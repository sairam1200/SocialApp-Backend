import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { EventEmitter2 } from '@nestjs/event-emitter';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  PlatformConnectCleanupEvent,
  SocialAccountLinkedEvent,
} from '../../../../domain/events';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { UserLogin } from '../../../../domain/entities';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { serializeObject } from '../../../../core/utils/serialization.util';
import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToInstagramProfileModel } from '../../../../domain/mappers/instagram.mapper';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import {
  InstagramProfileModel,
  InstagramUserDataType,
} from '../../../../domain/contracts/instagram.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';

const PLATFORM = 'instagram';
const GRAPH_BASE = 'https://graph.instagram.com';
const LONG_LIVED_TOKEN_EXPIRES_IN = 60 * 24 * 60 * 60; // 60 days in seconds

export class InstagramConnectQuery {
  model: {
    state: string;
  };

  constructor(request: Partial<InstagramConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class InstagramConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<InstagramConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const instagramConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(InstagramConnectQuery)
export class InstagramConnectQueryHandler
  implements ICommandHandler<InstagramConnectQuery>
{
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(command: InstagramConnectQuery): Promise<void> {
    const { model } = command;

    // expires in 15 minutes
    const expiresIn =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      '',
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn,
    );
  }
}

/**
 * Important: Instagram does not reviel the email address of the user
 */
@CommandHandler(InstagramConnectCallbackQuery)
export class InstagramConnectCallbackQueryHandler
  implements ICommandHandler<InstagramConnectCallbackQuery>
{
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

  public async execute(query: InstagramConnectCallbackQuery): Promise<{
    accessToken: string;
    expiresIn: number;
    profile: InstagramProfileModel;
  }> {
    const { model } = query;
    await instagramConnectCallbackValidations.validateAsync(model);

    await this.validateState(model.state);

    const tokenResponse = await this.fetchShortLivedToken(model.code);

    const shortLivedToken = tokenResponse.access_token;
    const shortLivedExpiresIn = tokenResponse.expires_in ?? 3600;

    let access_token = shortLivedToken;
    let expires_in = shortLivedExpiresIn;

    try {
      const longLivedResponse = await this.fetchLongLivedToken(shortLivedToken);
      if (longLivedResponse?.access_token) {
        access_token = longLivedResponse.access_token;
        expires_in = Number.isFinite(longLivedResponse.expires_in)
          ? longLivedResponse.expires_in
          : LONG_LIVED_TOKEN_EXPIRES_IN;
        logger.info(
          '[InstagramConnect] Long-lived token obtained successfully',
        );
      }
    } catch (error: any) {
      logger.warn(
        '[InstagramConnect] Failed to exchange for long-lived token, using short-lived token',
        { status: error?.response?.status },
      );
    }

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.user[Globals.ClaimTypes.UserId],
    );

    if (!user) {
      throw new ApplicationException(
        'Prevented: Alduterated Request Received!',
      );
    }

    let linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        PLATFORM,
        user.id,
      );
    const newExternalId = userData.id;
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(
          `[InstagramConnect] User ${user.id} changed Instagram account from ${oldExternalId} to ${newExternalId}`,
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
        PLATFORM,
      );
    if (existingAccountLogin) {
      await this.updateUserLogin(
        existingAccountLogin,
        access_token,
        expires_in,
      );
    } else {
      await this.createUserLogin(user.id, access_token, expires_in);
    }

    this.eventEmitter.emit(
      'social.account.linked',
      new SocialAccountLinkedEvent({ userId: user.id }),
    );

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToInstagramProfileModel(linkedAccount, true),
    };
  }

  private async fetchShortLivedToken(code: string): Promise<{
    access_token: string;
    expires_in?: number;
  }> {
    const body = new URLSearchParams({
      client_id: configs.Instagram.clientId,
      client_secret: configs.Instagram.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: configs.Instagram.redirectUri,
      code,
    });

    const response = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      body.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    return response.data;
  }

  private async fetchLongLivedToken(
    shortLivedAccessToken: string,
  ): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
      params: {
        client_id: configs.facebook.clientId,
        client_secret: configs.facebook.clientSecret,
        grant_type: 'ig_exchange_token',
        fb_exchange_token: shortLivedAccessToken,
      },
    });

    return response.data;
  }

  private async fetchUserData(
    accessToken: string,
  ): Promise<InstagramUserDataType> {
    try {
      const response = await axios.get<InstagramUserDataType>(
        `${GRAPH_BASE}/me`,
        {
          params: {
            access_token: accessToken,
            fields:
              'id,username,name,profile_picture_url,media_count,followers_count,follows_count',
          },
        },
      );
      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from Instagram', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Instagram',
      );
    }
  }

  private async validateState(state: string): Promise<void> {
    const dataProtectionKey =
      await this.dataProtectionKeyRepository.getByKeyAsync(state);
    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid state parameter');
    }

    if (dataProtectionKey.expiresIn < Math.floor(Date.now() / 1000)) {
      throw new ApplicationException('State parameter has expired');
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
  }

  private async updateLinkedAccount(
    linkedAccount: LinkedAccount,
    userData: InstagramUserDataType,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      PLATFORM,
      userData.id,
    );
    linkedAccount.externalId = userData.id;
    linkedAccount.userName = userData.username;
    linkedAccount.profileImage = userData.profile_picture_url ?? '';
    linkedAccount.followersCount = userData.followers_count ?? 0;
    linkedAccount.followingCount = userData.follows_count ?? 0;
    linkedAccount.metaData = {
      name: userData.name ?? '',
      biography: userData.biography ?? '',
      websiteUrl: userData.website ?? '',
      mediaCount: userData.media_count ?? 0,
      accountType: userData.account_type ?? '',
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(
    userId: string,
    userData: InstagramUserDataType,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      PLATFORM,
      userData.id,
    );
    const newEntry = new LinkedAccount({
      platform: PLATFORM,
      userId,
      externalId: userData.id,
      userName: userData.username,
      profileImage: userData.profile_picture_url,
      followersCount: userData.followers_count,
      followingCount: userData.follows_count,
      metaData: {
        name: userData.name,
        biography: userData.biography,
        websiteUrl: userData.website,
        mediaCount: userData.media_count,
        accountType: userData.type,
      },
    });
    return await this.linkedAccountRepository.createAsync(newEntry);
  }

  private async updateUserLogin(
    userLogin: UserLogin,
    accessToken: string,
    expiresIn: number,
  ): Promise<void> {
    const tokenValue = serializeObject({
      access_token: accessToken,
      expires_in: expiresIn,
    });
    userLogin.tokenValue = tokenValue;
    userLogin.addedDateUtc = new Date();
    userLogin.expiryDateUtc = new Date(Date.now() + expiresIn * 1000);
    await this.userLoginRepository.updateAsync(userLogin);
  }

  private async createUserLogin(
    userId: string,
    accessToken: string,
    expiresIn: number,
  ): Promise<void> {
    const tokenValue = serializeObject({
      access_token: accessToken,
      expires_in: expiresIn,
    });
    await this.userLoginRepository.createAysnc(
      PLATFORM,
      userId,
      '', // deviceId
      '', // userAgent
      '', // ipAddress
      tokenValue,
      new Date(Date.now() + expiresIn * 1000),
    );
  }
}
