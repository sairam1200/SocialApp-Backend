import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { EventEmitter2 } from '@nestjs/event-emitter';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserNotFoundException } from '../../../../core/exceptions';
import {
  PlatformConnectCleanupEvent,
  SocialAccountLinkedEvent,
} from '../../../../domain/events';
import { serializeObject } from '../../../../core/utils/serialization.util';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToTwitterProfileModel } from '../../../../domain/mappers/twitter.mapper';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import {
  TwitterProfileModel,
  TwitterUserDataType,
} from '../../../../domain/contracts/twitter.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';

const BASE_URL = 'https://api.x.com/2';

export class TwitterConnectQuery {
  model: {
    state: string;
    codeVerifier: string;
  };

  constructor(request: Partial<TwitterConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class TwitterConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<TwitterConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const twitterConnectValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(TwitterConnectQuery)
export class TwiiterConnectQueryHandler implements ICommandHandler<TwitterConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(query: TwitterConnectQuery): Promise<void> {
    const { model } = query;

    const expiresIn =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    console.log('Saving state:', model.state);
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      model.codeVerifier,
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn,
    );
  }
}

@CommandHandler(TwitterConnectCallbackQuery)
export class TwitterConnectCallbackQueryHandler implements ICommandHandler<TwitterConnectCallbackQuery> {
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

  public async execute(query: TwitterConnectCallbackQuery): Promise<{
    success: boolean;
    accessToken: string;
    expiresIn: number;
    profile: TwitterProfileModel;
  }> {
    const { model } = query;
    await twitterConnectValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);

    const { access_token, refresh_token, expires_in } = await this.fetchToken(
      model.code,
      dataProtectionKey.value,
    );

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByIdAsync(
      dataProtectionKey.userId,
    );
    if (!user) {
      throw new UserNotFoundException(userData.data.id);
    }

    let linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.TWITTER,
        user.id,
      );
    console.log('Linked Account:', linkedAccount);
    const newExternalId = userData.data.id;
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(
          `[TwitterConnect] User ${user.id} changed Twitter account from ${oldExternalId} to ${newExternalId}`,
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
        _const.PLATFORMS.TWITTER,
      );
    const tokenValue = serializeObject({ access_token, refresh_token });
    console.log('this is the token value: ', tokenValue);
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
      success: true,
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToTwitterProfileModel(linkedAccount, true),
    };
  }

  private async fetchToken(
    code: string,
    codeVerifier: string,
  ): Promise<{
    access_token: string;
    expires_in: number;
    refresh_token: string;
  }> {
    try {
      const body = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: configs.twitter.clientId,
        redirect_uri: configs.twitter.redirectUri,
        code_verifier: codeVerifier,
      });

      const credentials = Buffer.from(
        `${configs.twitter.clientId}:${configs.twitter.clientSecret}`,
      ).toString('base64');
      console.log(configs.twitter.clientId);
      console.log(configs.twitter.clientSecret);
      const response = await axios.post(
        'https://api.x.com/2/oauth2/token',
        body.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
          },
        },
      );

      console.log('TOKEN RESPONSE', response.data);

      return response.data;
    } catch (error: any) {
      console.error('TOKEN ERROR', error?.response?.data ?? error);

      throw error;
    }
  }

  private async fetchUserData(
    accessToken: string,
  ): Promise<TwitterUserDataType> {
    try {
      const response = await axios.get<TwitterUserDataType>(
        `${BASE_URL}/users/me`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            'user.fields': [
              'id',
              'name',
              'username',
              'created_at',
              'description',
              'profile_image_url',
              'public_metrics',
              'verified',
              'protected',
              'location',
              'url',
              'entities',
              'pinned_tweet_id',
              'withheld',
            ].join(','),
          },
        },
      );
      console.log('Twitter user data response:', response.data);
      return response.data;
    } catch (error) {
      console.log(error);
      logger.error('Error fetching user data from Twitter', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Twiiter',
      );
    }
  }

  private async validateStateAsync(state: string): Promise<DataProtectionKey> {
    console.log('Callback state:', state);
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

  private async updateLinkedAccount(
    linkedAccount: LinkedAccount,
    userData: TwitterUserDataType,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.TWITTER,
      userData.data.id,
    );
    linkedAccount.externalId = userData.data.id;
    linkedAccount.userName = userData.data.username;
    linkedAccount.profileImage = userData.data.profile_image_url;
    linkedAccount.followersCount = userData.data.public_metrics.followers_count;
    linkedAccount.followingCount = userData.data.public_metrics.following_count;
    linkedAccount.verified = userData.data.verified;
    linkedAccount.externalUrl = `https://x.com/${userData.data.username}`;
    linkedAccount.metaData = {
      name: userData.data.name,
      description: userData.data.description,
      countryCodes: userData.data.withheld?.country_codes || [],
      url: userData.data.url || null,
      location: userData.data.location || null,
      pinnedTweetId: userData.data.pinned_tweet_id || null,
      tweetCount: userData.data.public_metrics.tweet_count,
      listedCount: userData.data.public_metrics.listed_count,
      createdAt: userData.data.created_at,
      protected: userData.data.protected,
      entities: userData.data.entities || null,
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(
    userId: string,
    userData: TwitterUserDataType,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.TWITTER,
      userData.data.id,
    );
    const newEntry = new LinkedAccount({
      platform: _const.PLATFORMS.TWITTER,
      userId,
      externalId: userData.data.id,
      userName: userData.data.username,
      profileImage: userData.data.profile_image_url,
      followersCount: userData.data.public_metrics.followers_count,
      followingCount: userData.data.public_metrics.following_count,
      verified: userData.data.verified,
      externalUrl: `https://x.com/${userData.data.username}`,
      metaData: {
        name: userData.data.name,
        description: userData.data.description,
        countryCodes: userData.data.withheld?.country_codes || [],
        url: userData.data.url || null,
        location: userData.data.location || null,
        pinnedTweetId: userData.data.pinned_tweet_id || null,
        tweetCount: userData.data.public_metrics.tweet_count,
        listedCount: userData.data.public_metrics.listed_count,
        createdAt: userData.data.created_at,
        protected: userData.data.protected,
        entities: userData.data.entities || null,
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
      _const.PLATFORMS.TWITTER,
      userId,
      '', // deviceId
      '', // userAgent
      '', // ipAddress
      tokenValue,
      new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
    );
  }
}
