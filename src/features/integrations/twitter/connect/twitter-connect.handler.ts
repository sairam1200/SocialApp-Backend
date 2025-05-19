import axios from "axios";
import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { mapToTwitterProfileModel } from "../../../../domain/mappers/twitter.mapper";
import { DataProtectionKey } from "../../../../domain/entities/dataProtectionKey.entity";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { TwitterProfileModel, TwitterUserDataModel } from "../../../../domain/contracts/twitter.model";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";

const PLATFORM = 'twitter';
const BASE_URL = 'https://api.twitter.com/2';

export class TwitterConnectQuery {
  model: {
    state: string;
    codeVerifier: string;
  }

  constructor(request: Partial<TwitterConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class TwitterConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<TwitterConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const twitterConnectValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(TwitterConnectQuery)
export class TwiiterConnectQueryHandler implements ICommandHandler<TwitterConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(query: TwitterConnectQuery): Promise<void> {

    const { model } = query;

    // expires in 15 minutes
    const expiresIn = 15 * 60;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      model.codeVerifier,
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
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
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: TwitterConnectCallbackQuery): Promise<{
    accessToken: string,
    expiresIn: number,
    profile: TwitterProfileModel
  }> {

    const { model } = query;
    await twitterConnectValidations.validateAsync(model);
    const dataProtectionKey = await this.validateState(model.state);

    const { access_token, refresh_token, expires_in } = await this.fetchToken(model.code, dataProtectionKey.value);

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByIdAsync(HttpContext.user[Globals.ClaimTypes.UserId]);

    if (!user) {
      throw new ApplicationException('Prevented: Alduterated Request Received!');
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(PLATFORM, user.id);
    if (linkedAccount) {
      linkedAccount.userName = userData.data.username;
      linkedAccount.profileImage = userData.data.profile_image_url;
      linkedAccount.followersCount = userData.data.public_metrics.followers_count;
      linkedAccount.followingCount = userData.data.public_metrics.following_count;
      linkedAccount.metaData = {
        name: userData.data.name,
        description: userData.data.description,
        countryCodes: userData.data.withheld.country_codes,
        url: userData.data.url,
        location: userData.data.location,
        pinnedTweetId: userData.data.pinned_tweet_id,
        tweetCount: userData.data.public_metrics.tweet_count,
        listedCount: userData.data.public_metrics.listed_count,
        createdAt: userData.data.created_at,
        verified: userData.data.verified,
        protected: userData.data.protected,
        entities: userData.data.entities,
      };
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      linkedAccount = await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: PLATFORM,
        userId: user.id,
        externalId: userData.data.id,
        userName: userData.data.username,
        profileImage: userData.data.profile_image_url,
        followersCount: userData.data.public_metrics.followers_count,
        followingCount: userData.data.public_metrics.following_count,
        metaData: {
          name: userData.data.name,
          description: userData.data.description,
          countryCodes: userData.data.withheld.country_codes,
          url: userData.data.url,
          location: userData.data.location,
          pinnedTweetId: userData.data.pinned_tweet_id,
          tweetCount: userData.data.public_metrics.tweet_count,
          listedCount: userData.data.public_metrics.listed_count,
          createdAt: userData.data.created_at,
          verified: userData.data.verified,
          protected: userData.data.protected,
          entities: userData.data.entities,
        }
      }));
    }

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProvider(user.id, PLATFORM);
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = refresh_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        PLATFORM,
        user.id,
        "",
        "",
        "",
        refresh_token,
        new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)
      );
    }

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToTwitterProfileModel(linkedAccount, true)
    }
  }

  private async fetchToken(code: string, codeVerifier: string)
    : Promise<{ access_token: string; expires_in: number; refresh_token: string; }> {
    try {
      const response = await axios.get(`${BASE_URL}/oauth2/token`, {
        params: {
          redirect_uri: configs.twitter.redirectUri,
          client_id: configs.twitter.clientId,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
          code: code,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching token from Twitter', error);
      throw new Error('Unexpected error during authentication with Twitter');
    }
  }

  private async fetchUserData(accessToken: string): Promise<TwitterUserDataModel> {
    try {
      const response = await axios.get<TwitterUserDataModel>(`${BASE_URL}/users/me`, {
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
            'pinned_tweet_id'
          ].join(',')
        }
      });

      return response.data
    } catch (error) {
      logger.error('Error fetching user data from Twitter', error);
      throw new Error('Unexpected error during authentication with Twiiter');
    }
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
    const dataProtectionKey = await this.dataProtectionKeyRepository.getByKeyAsync(state);
    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid state parameter');
    }

    if (new Date(dataProtectionKey.createdOn.getTime() + dataProtectionKey.expiresIn * 1000) < new Date()) {
      throw new ApplicationException('State parameter has expired');
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
    return dataProtectionKey;
  }
}