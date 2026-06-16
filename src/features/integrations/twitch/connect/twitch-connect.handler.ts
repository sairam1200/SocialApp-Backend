import axios from "axios";
import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { EventEmitter2 } from "@nestjs/event-emitter";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserNotFoundException } from "../../../../core/exceptions";
import { PlatformConnectCleanupEvent } from "../../../../domain/events";
import { serializeObject } from "../../../../core/utils/serialization.util";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { DataProtectionKey } from "../../../../domain/entities/dataProtectionKey.entity";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";
import { IContentStreamRepository } from "../../../../domain/repositories/icontentStream.repository";

const TWITCH_API_URL = 'https://api.twitch.tv/helix';

type TwitchUserDataType = {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  email?: string;
  created_at: string;
};

export class TwitchConnectQuery {
  model: {
    state: string;
  }

  constructor(request: Partial<TwitchConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class TwitchConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<TwitchConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const twitchConnectValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(TwitchConnectQuery)
export class TwitchConnectQueryHandler implements ICommandHandler<TwitchConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(query: TwitchConnectQuery): Promise<void> {

    const { model } = query;

    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      '',
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
    );
  }
}

@CommandHandler(TwitchConnectCallbackQuery)
export class TwitchConnectCallbackQueryHandler implements ICommandHandler<TwitchConnectCallbackQuery> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(query: TwitchConnectCallbackQuery): Promise<{
    accessToken: string,
    profile: LinkedAccount
  }> {

    const { model } = query;
    await twitchConnectValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);
    const { access_token, refresh_token, expires_in } = await this.fetchToken(model.code);

    const userData = await this.fetchUserData(access_token);
    const twitchUser = userData[0];

    if (!twitchUser) {
      throw new ApplicationException('Unable to fetch Twitch user profile');
    }

    const user = await this.userRepository.getUserByIdAsync(dataProtectionKey.userId);
    if (!user) {
      throw new UserNotFoundException(String(twitchUser.id));
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.TWITCH, user.id);
    const newExternalId = String(twitchUser.id);
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(`[TwitchConnect] User ${user.id} changed Twitch account from ${oldExternalId} to ${newExternalId}`);
        this.eventEmitter.emit('platform.connect.cleanup', new PlatformConnectCleanupEvent({ account: linkedAccount }));
      }

      linkedAccount = await this.updateLinkedAccount(linkedAccount, twitchUser);
    } else {
      linkedAccount = await this.createLinkedAccount(user.id, twitchUser);
    }

    const existingAccountLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(user.id, _const.PLATFORMS.TWITCH);
    const tokenValue = serializeObject({ access_token, refresh_token, expires_in });
    if (existingAccountLogin) {
      await this.updateUserLogin(existingAccountLogin, tokenValue, expires_in);
    } else {
      await this.createUserLogin(user.id, tokenValue, expires_in);
    }

    return {
      accessToken: access_token,
      profile: linkedAccount,
    }
  }

  private async fetchToken(code: string)
    : Promise<{ access_token: string; refresh_token?: string; expires_in?: number; }> {
    try {
      const params = new URLSearchParams({
        client_id: configs.twitch.clientId,
        client_secret: configs.twitch.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: configs.twitch.redirectUri,
      });

      const response = await axios.post(
        'https://id.twitch.tv/oauth2/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        }
      );

      if (response.data.error) {
        logger.error('Twitch token error:', response.data);
        throw new ApplicationException(`Twitch OAuth error: ${response.data.message || response.data.error}`);
      }
      return response.data;
    } catch (error) {
      if (error instanceof ApplicationException) throw error;
      logger.error('Error fetching token from Twitch', error);
      throw new ApplicationException('Unexpected error during authentication with Twitch');
    }
  }

  private async fetchUserData(accessToken: string): Promise<TwitchUserDataType[]> {
    try {
      const response = await axios.get<{ data: TwitchUserDataType[] }>(`${TWITCH_API_URL}/users`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': configs.twitch.clientId,
        },
      });
      return response.data.data;
    } catch (error) {
      logger.error('Error fetching user data from Twitch', error);
      throw new ApplicationException('Unexpected error during authentication with Twitch');
    }
  }

  private async validateStateAsync(state: string): Promise<DataProtectionKey> {
    const dataProtectionKey = await this.dataProtectionKeyRepository.getByKeyAsync(state);
    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid state parameter');
    }

    if (dataProtectionKey.expiresIn < Math.floor(Date.now() / 1000)) {
      throw new ApplicationException('State parameter has expired');
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
    return dataProtectionKey;
  }

  private async updateLinkedAccount(linkedAccount: LinkedAccount, userData: TwitchUserDataType): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.TWITCH,
      String(userData.id),
    );
    linkedAccount.externalId = String(userData.id);
    linkedAccount.userName = userData.display_name || userData.login;
    linkedAccount.profileImage = userData.profile_image_url;
    linkedAccount.followersCount = linkedAccount.followersCount || 0;
    linkedAccount.followingCount = linkedAccount.followingCount || 0;
    linkedAccount.verified = userData.broadcaster_type === 'partner';
    linkedAccount.externalUrl = `https://twitch.tv/${userData.login}`;
    linkedAccount.metaData = {
      login: userData.login,
      displayName: userData.display_name,
      type: userData.type,
      broadcasterType: userData.broadcaster_type,
      description: userData.description,
      offlineImageUrl: userData.offline_image_url,
      viewCount: userData.view_count,
      email: userData.email,
      createdAt: userData.created_at,
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(userId: string, userData: TwitchUserDataType): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.TWITCH,
      String(userData.id),
    );
    const newEntry = new LinkedAccount({
      platform: _const.PLATFORMS.TWITCH,
      userId,
      externalId: String(userData.id),
      userName: userData.display_name || userData.login,
      profileImage: userData.profile_image_url,
      followersCount: 0,
      followingCount: 0,
      verified: userData.broadcaster_type === 'partner',
      externalUrl: `https://twitch.tv/${userData.login}`,
      metaData: {
        login: userData.login,
        displayName: userData.display_name,
        type: userData.type,
        broadcasterType: userData.broadcaster_type,
        description: userData.description,
        offlineImageUrl: userData.offline_image_url,
        viewCount: userData.view_count,
        email: userData.email,
        createdAt: userData.created_at,
      }
    });
    return await this.linkedAccountRepository.createAsync(newEntry);
  }

  private async updateUserLogin(userLogin: any, tokenValue: string, expiresIn?: number): Promise<void> {
    userLogin.tokenValue = tokenValue;
    userLogin.addedDateUtc = new Date();
    if (expiresIn && expiresIn > 0) {
      userLogin.expiryDateUtc = new Date(Date.now() + (expiresIn * 1000));
    }
    await this.userLoginRepository.updateAsync(userLogin);
  }

  private async createUserLogin(userId: string, tokenValue: string, expiresIn?: number): Promise<void> {
    const expiry = expiresIn && expiresIn > 0
      ? new Date(Date.now() + (expiresIn * 1000))
      : undefined;

    await this.userLoginRepository.createAysnc(
      _const.PLATFORMS.TWITCH,
      userId,
      "",
      "",
      "",
      tokenValue,
      expiry
    );
  }
}

