import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { UserLogin } from "../../../../domain/entities";
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { PlatformConnectCleanupEvent } from '../../../../domain/events';
import { serializeObject } from '../../../../core/utils/serialization.util';
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import { mapToTiktokProfileModel } from '../../../../domain/mappers/tiktok.mapper';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { TiktokProfileModel, TiktokUserDataModel } from '../../../../domain/contracts/tiktok.model';
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';

const TIKTOK_BASE = 'https://open.tiktokapis.com/v2';

export class TikTokConnectQuery {
  model: {
    state: string;
    codeVerifier: string;
  }

  constructor(request: Partial<TikTokConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class TiktokConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<TiktokConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const tiktokConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(TikTokConnectQuery)
export class TiktokConnectQueryHandler implements ICommandHandler<TikTokConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { console.log('TiktokConnectQueryHandler initialized'); }

  public async execute(query: TikTokConnectQuery): Promise<void> {

    const { model } = query;

    // expires in 15 minutes
    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      model.codeVerifier || "",
      HttpContext.getCurrentUserId,
      expiresIn
    );
  }
}

@CommandHandler(TiktokConnectCallbackQuery)
export class TiktokConnectCallbackQueryHandler implements ICommandHandler<TiktokConnectCallbackQuery> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(query: TiktokConnectCallbackQuery):
    Promise<{ accessToken: string; expiresIn: number; profile: TiktokProfileModel }> {

    const { model } = query;
    await tiktokConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);

    const {
      access_token,
      expires_in,
      open_id,
      refresh_expires_in,
      refresh_token
    } = await this.fetchTokenAsync(model.code, dataProtectionKey.value);
    console.log('TikTok access token:', access_token);
    const userData = await this.fetchUserData(access_token, open_id);
    const user = await this.userRepository.getUserByIdAsync(dataProtectionKey.userId);

    if (!user) {
      throw new ApplicationException('Prevented: Alduterated Request Received!');
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.TIKTOK, user.id);
    const newExternalId = userData.open_id;
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(`[TikTokConnect] User ${user.id} changed TikTok account from ${oldExternalId} to ${newExternalId}`);
        this.eventEmitter.emit('platform.connect.cleanup', new PlatformConnectCleanupEvent({ account: linkedAccount }));
      }

      linkedAccount = await this.updateLinkedAccount(linkedAccount, userData);
    } else {
      linkedAccount = await this.createLinkedAccount(user.id, userData);
    }

    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(user.id, _const.PLATFORMS.TIKTOK);
    if (userLogin) {
      await this.updateUserLogin(userLogin, { access_token, expires_in, refresh_token, refresh_expires_in });
    } else {
      await this.createUserLogin(user.id, { access_token, expires_in, refresh_token, refresh_expires_in });
    }

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToTiktokProfileModel(linkedAccount, true),
    };
  }

  private async fetchTokenAsync(code: string, codeVerifier?: string)
    : Promise<{ access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number; open_id: number; }> {
    try {
      const tokenRequest: any = {
        client_key: configs.tiktok.clientId,
        client_secret: configs.tiktok.clientSecret,
        code,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
        redirect_uri: configs.tiktok.redirectUri,
      };
      console.log(configs.tiktok.clientId, configs.tiktok.clientSecret);
      const response = await axios.post(`${TIKTOK_BASE}/oauth/token/`, tokenRequest, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching token from TikTok', error);
      throw new ApplicationException('Unexpected error during authentication with TikTok');
    }
  }

  private async fetchUserData(accessToken: string, openId: number): Promise<TiktokUserDataModel> {
    try {
      const response = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          open_id: openId,
          fields: [
            'open_id',
            'union_id',
            'display_name',
            'avatar_url',
            'bio',
            'profile_deep_link',
            'is_verified',
            'follower_count',
            'following_count',
            'likes_count',
            'video_count'
          ].join(','),
        },
      });

      return response.data.data.user
    } catch (error) {
      logger.error('Error fetching user data from Tiktok', error);
      throw new ApplicationException('Unexpected error during authentication with Tiktok');
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

  private async updateLinkedAccount(linkedAccount: LinkedAccount, userData: TiktokUserDataModel): Promise<LinkedAccount> {
    const userName = userData.profile_deep_link?.split('@')[1] ?? '';

    linkedAccount.verified = userData.is_verified;
    linkedAccount.followersCount = userData.follower_count;
    linkedAccount.followingCount = userData.following_count;
    linkedAccount.externalUrl = userData.profile_deep_link;
    linkedAccount.profileImage = userData.avatar_url;
    linkedAccount.userName = userName;
    linkedAccount.metaData = {
      bio: userData?.bio,
      unionId: userData.union_id,
      displayName: userData.display_name,
      likesCount: userData?.likes_count || 0,
      videoCount: userData?.video_count || 0,
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(userId: string, userData: TiktokUserDataModel): Promise<LinkedAccount> {
    console.log("this is the user data", userData);
    const userName = userData.profile_deep_link?.split('@')[1] ?? '';
    const newEntry = new LinkedAccount({
      userId,
      userName,
      externalId: userData.open_id,
      verified: userData?.is_verified,
      profileImage: userData.avatar_url,
      platform: _const.PLATFORMS.TIKTOK,
      externalUrl: userData.profile_deep_link,
      followersCount: userData.follower_count,
      followingCount: userData.following_count,
      metaData: {
        bio: userData?.bio,
        unionId: userData.union_id,
        displayName: userData.display_name,
        likesCount: userData?.likes_count || 0,
        videoCount: userData?.video_count || 0,
      },
    });
    return this.linkedAccountRepository.createAsync(newEntry);
  }

  private async updateUserLogin(userLogin: UserLogin, tokenData: { access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number; }): Promise<void> {
    const tokenValue = serializeObject({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token
    })
    userLogin.tokenValue = tokenValue;
    userLogin.expiryDateUtc = new Date(Date.now() + tokenData.refresh_expires_in * 1000);
    await this.userLoginRepository.updateAsync(userLogin);
  }

  private async createUserLogin(userId: string, tokenData: { access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number; }): Promise<void> {
    const tokenValue = serializeObject({
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token
    })

    await this.userLoginRepository.createAysnc(
      _const.PLATFORMS.TIKTOK,
      userId,
      '', // deviceId
      '', // userAgent
      '', // ipAddress
      tokenValue,
      new Date(Date.now() + tokenData.refresh_expires_in * 1000)
    );
  }
}