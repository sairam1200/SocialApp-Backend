import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { EventEmitter2 } from '@nestjs/event-emitter';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SocialAccountLinkedEvent } from '../../../../domain/events';
import { UserNotFoundException } from '../../../../core/exceptions';
import { PlatformConnectCleanupEvent } from '../../../../domain/events';
import { serializeObject } from '../../../../core/utils/serialization.util';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToDiscordProfileModel } from '../../../../domain/mappers/discord.mapper';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import {
  DiscordProfileModel,
  DiscordUserDataType,
} from '../../../../domain/contracts/discord.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';

const DISCORD_API_URL = 'https://discord.com/api/v10';

export class DiscordConnectQuery {
  model: {
    state: string;
  };

  constructor(request: Partial<DiscordConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class DiscordConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<DiscordConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const discordConnectValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(DiscordConnectQuery)
export class DiscordConnectQueryHandler implements ICommandHandler<DiscordConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(query: DiscordConnectQuery): Promise<void> {
    const { model } = query;

    const expiresIn =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      '', // No code verifier needed for Discord OAuth
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn,
    );
  }
}

@CommandHandler(DiscordConnectCallbackQuery)
export class DiscordConnectCallbackQueryHandler implements ICommandHandler<DiscordConnectCallbackQuery> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async execute(query: DiscordConnectCallbackQuery): Promise<{
    accessToken: string;
    profile: DiscordProfileModel;
  }> {
    const { model } = query;
    await discordConnectValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);
    const { access_token } = await this.fetchToken(model.code);

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByIdAsync(
      dataProtectionKey.userId,
    );
    if (!user) {
      throw new UserNotFoundException(String(userData.id));
    }

    let linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.DISCORD,
        user.id,
      );
    const newExternalId = String(userData.id);
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(
          `[DiscordConnect] User ${user.id} changed Discord account from ${oldExternalId} to ${newExternalId}`,
        );
        this.eventEmitter.emit(
          'platform.connect.cleanup',
          new PlatformConnectCleanupEvent({ account: linkedAccount }),
        );
      }

      linkedAccount = await this.updateLinkedAccount(linkedAccount, userData);
    } else {
      linkedAccount = await this.createLinkedAccount(user.id, userData);
    }

    const existingAccountLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        user.id,
        _const.PLATFORMS.DISCORD,
      );
    const tokenValue = serializeObject({ access_token });
    if (existingAccountLogin) {
      await this.updateUserLogin(existingAccountLogin, tokenValue);
    } else {
      await this.createUserLogin(user.id, tokenValue);
    }

    this.eventEmitter.emit(
      'social.account.linked',
      new SocialAccountLinkedEvent({ userId: user.id }),
    );

    return {
      accessToken: access_token,
      profile: mapToDiscordProfileModel(linkedAccount, true),
    };
  }

  private async fetchToken(code: string): Promise<{ access_token: string }> {
    try {
      const params = new URLSearchParams({
        client_id: configs.discord.clientId,
        client_secret: configs.discord.clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: configs.discord.redirectUri,
      });

      const response = await axios.post(
        `${DISCORD_API_URL}/oauth2/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      if (response.data.error) {
        logger.error('Discord token error:', response.data);
        throw new ApplicationException(
          `Discord OAuth error: ${response.data.error_description || response.data.error}`,
        );
      }
      return response.data;
    } catch (error) {
      if (error instanceof ApplicationException) throw error;
      logger.error('Error fetching token from Discord', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Discord',
      );
    }
  }

  private async fetchUserData(
    accessToken: string,
  ): Promise<DiscordUserDataType> {
    try {
      const response = await axios.get<DiscordUserDataType>(
        `${DISCORD_API_URL}/users/@me`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from Discord', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Discord',
      );
    }
  }

  private async validateStateAsync(state: string): Promise<DataProtectionKey> {
    const dataProtectionKey =
      await this.dataProtectionKeyRepository.getByKeyAsync(state);
    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid state parameter');
    }

    if (dataProtectionKey.expiresIn < Math.floor(Date.now() / 1000)) {
      throw new ApplicationException('State parameter has expired');
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
    return dataProtectionKey;
  }

  private getAvatarUrl(userData: DiscordUserDataType): string {
    if (userData.avatar) {
      return `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`;
    }
    // Default avatar based on discriminator or user id
    const index =
      userData.discriminator === '0'
        ? (BigInt(userData.id) >> BigInt(22)) % BigInt(6)
        : Number(userData.discriminator) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  private async updateLinkedAccount(
    linkedAccount: LinkedAccount,
    userData: DiscordUserDataType,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.DISCORD,
      String(userData.id),
    );
    linkedAccount.externalId = String(userData.id);
    linkedAccount.userName = userData.username;
    linkedAccount.profileImage = this.getAvatarUrl(userData);
    linkedAccount.followersCount = 0;
    linkedAccount.followingCount = 0;
    linkedAccount.verified = userData.verified || false;
    linkedAccount.externalUrl = `https://discord.com/users/${userData.id}`;
    linkedAccount.metaData = {
      globalName: userData.global_name,
      discriminator: userData.discriminator,
      accentColor: userData.accent_color,
      premiumType: userData.premium_type,
      publicFlags: userData.public_flags,
      email: userData.email,
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(
    userId: string,
    userData: DiscordUserDataType,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.DISCORD,
      String(userData.id),
    );
    const newEntry = new LinkedAccount({
      platform: _const.PLATFORMS.DISCORD,
      userId,
      externalId: String(userData.id),
      userName: userData.username,
      profileImage: this.getAvatarUrl(userData),
      followersCount: 0,
      followingCount: 0,
      verified: userData.verified || false,
      externalUrl: `https://discord.com/users/${userData.id}`,
      metaData: {
        globalName: userData.global_name,
        discriminator: userData.discriminator,
        accentColor: userData.accent_color,
        premiumType: userData.premium_type,
        publicFlags: userData.public_flags,
        email: userData.email,
      },
    });
    return await this.linkedAccountRepository.createAsync(newEntry);
  }

  private async updateUserLogin(
    userLogin: any,
    tokenValue: string,
  ): Promise<void> {
    userLogin.tokenValue = tokenValue;
    userLogin.addedDateUtc = new Date();
    userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    await this.userLoginRepository.updateAsync(userLogin);
  }

  private async createUserLogin(
    userId: string,
    tokenValue: string,
  ): Promise<void> {
    await this.userLoginRepository.createAysnc(
      _const.PLATFORMS.DISCORD,
      userId,
      '', // deviceId
      '', // userAgent
      '', // ipAddress
      tokenValue,
      new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
    );
  }
}
