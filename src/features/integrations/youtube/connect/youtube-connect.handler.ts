import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { getRedirectUrl } from '../../../../core/utils/redirectUrl.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DataProtectionKey } from '../../../../domain/entities';
import { UserNotFoundException } from '../../../../core/exceptions';
import { PlatformConnectCleanupEvent } from '../../../../domain/events';
import { serializeObject } from '../../../../core/utils/serialization.util';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToYoutubeProfileModel } from '../../../../domain/mappers/youtube.mapper';
import { IUserLoginRepository, ILinkedAccountRepository, IDataProtectionKeyRepository } from '../../../../domain/repositories';
import { GoogleUserDataType, YoutubeChannelDataType, YoutubeProfileModel } from '../../../../domain/contracts/youtube.model';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';
import { YoutubeAccount } from '../../../../domain/entities/youtubeAccount.entity';
import { IYoutubeAccountRepository } from '../../../../domain/repositories/iyoutubeAccount.repository';
import { cryptoUtils } from '../../../../core/utils/crypto.util';

const BASE_URL = 'https://www.googleapis.com/oauth2/v2';

export class YoutubeConnectQuery {
  model: {
    state: string;
  };

  constructor(request: Partial<YoutubeConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class YoutubeConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<YoutubeConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const youtubeConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(YoutubeConnectQuery)
export class YoutubeConnectQueryHandler
  implements ICommandHandler<YoutubeConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: YoutubeConnectQuery): Promise<void> {
    const { model } = command;

    // expires in 15 minutes
    const expiresIn =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      '', // value is not used
      HttpContext.getCurrentUserId,
      expiresIn,
    );
  }
}

@CommandHandler(YoutubeConnectCallbackQuery)
export class YoutubeConnectCallbackQueryHandler
  implements ICommandHandler<YoutubeConnectCallbackQuery> {
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
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(query: YoutubeConnectCallbackQuery): Promise<{
    accessToken: string;
    expiresIn: number;
    profile: YoutubeProfileModel;
  }> {
    const { model } = query;
    await youtubeConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateState(model.state);

    const { access_token, refresh_token, expires_in } = await this.fetchToken(
      model.code,
    );

    const tokenValue = serializeObject({ access_token, refresh_token, expires_in });

    const userData = await this.fetchUserData(access_token);
    console.log(userData);

    const user = configs.env !== "production" ? await this.userRepository.getUserByIdAsync(dataProtectionKey.userId) : await this.userRepository.getUserByEmailAsync(userData.profile.email);

    if (!user || user.id !== dataProtectionKey.userId) {
      throw new UserNotFoundException(userData.profile.email, 'email');
    }
    
    let linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.YOUTUBE,
        user.id,
      );

    const newExternalId = userData.profile.id;

    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(`[YoutubeConnect] User ${user.id} changed YouTube account from ${oldExternalId} to ${newExternalId}`);
        this.eventEmitter.emit('platform.connect.cleanup', new PlatformConnectCleanupEvent({ account: linkedAccount }));
      }

      linkedAccount.externalId = newExternalId;
      linkedAccount.userName = userData.profile.name;
      linkedAccount.profileImage = userData.profile.picture;
      linkedAccount.externalUrl = `https://www.youtube.com/channel/${userData.channel.items[0].id}`;
      (linkedAccount.followersCount = Number.parseInt(
        userData.channel.items[0].statistics.subscriberCount,
      )),
        (linkedAccount.followingCount = 0); // TODO : retreive this
      linkedAccount.metaData = {
        hd: userData.profile.hd,
        locale: userData.profile.locale,
        name: userData.profile.name,
        channel: {
          id: userData.channel.items[0].id,
          title: userData.channel.items[0].snippet.title,
          description: userData.channel.items[0].snippet.description,
          viewCount: userData.channel.items[0].statistics.viewCount,
          videoCount: userData.channel.items[0].statistics.videoCount,
          thumbthumbnail: userData.channel.items[0].snippet.thumbnails.default.url,
        },
      };
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.YOUTUBE,
        newExternalId,
      );
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.YOUTUBE,
        newExternalId,
      );
      linkedAccount = await this.linkedAccountRepository.createAsync(
        new LinkedAccount({
          platform: _const.PLATFORMS.YOUTUBE,
          userId: user.id,
          email: userData.profile.email,
          externalId: userData.profile.id,
          userName: userData.profile.name,
          profileImage: userData.profile.picture,
          externalUrl: `https://www.youtube.com/channel/${userData.channel.items[0].id}`,
          followersCount: Number.parseInt(
            userData.channel.items[0].statistics.subscriberCount,
          ),
          followingCount: 0, // TODO : retreive this
          metaData: {
            hd: userData.profile.hd,
            locale: userData.profile.locale,
            name: userData.profile.name,
            channel: {
              id: userData.channel.items[0].id,
              title: userData.channel.items[0].snippet.title,
              description: userData.channel.items[0].snippet.description,
              viewCount: userData.channel.items[0].statistics.viewCount,
              videoCount: userData.channel.items[0].statistics.videoCount,
              thumbnail: userData.channel.items[0].snippet.thumbnails.default.url,
            },
          },
        }),
      );
    }

    let existingAccountLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        user.id,
        _const.PLATFORMS.YOUTUBE,
      );

    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = tokenValue;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(
        Date.now() + 100 * 24 * 60 * 60 * 1000,
      );
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.YOUTUBE,
        user.id,
        '',
        '',
        '',
        tokenValue,
        new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
      );
    }

    const channelId = userData.channel.items[0].id;
    const channelTitle = userData.channel.items[0].snippet.title;
    let youtubeAccount = await this.youtubeAccountRepository.getByChannelIdAsync(channelId);

    if (youtubeAccount) {
      youtubeAccount.accessToken = cryptoUtils.encrypt(access_token);
      youtubeAccount.refreshToken = cryptoUtils.encrypt(refresh_token);
      youtubeAccount.tokenExpiry = new Date(Date.now() + expires_in * 1000);
      youtubeAccount.channelTitle = channelTitle;
      youtubeAccount.connected = true;
      youtubeAccount.disconnectedAt = undefined;
      await this.youtubeAccountRepository.updateAsync(youtubeAccount);
    } else {
      youtubeAccount = await this.youtubeAccountRepository.createAsync(
        new YoutubeAccount({
          userId: user.id,
          channelId,
          channelTitle,
          accessToken: cryptoUtils.encrypt(access_token),
          refreshToken: cryptoUtils.encrypt(refresh_token),
          tokenExpiry: new Date(Date.now() + expires_in * 1000),
          connected: true,
        }),
      );
    }

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToYoutubeProfileModel(linkedAccount, true),
    };
  }

  private async fetchToken(code: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
  }> {
    try {
      
      const response = await axios.post(`https://oauth2.googleapis.com/token`, {
        client_secret: configs.youtube.clientSecret,
        redirect_uri: getRedirectUrl(configs.youtube.callbackUrl),
        client_id: configs.youtube.clientId,
        grant_type: 'authorization_code',
        code: code,
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching token from Google', error);
      throw new ApplicationException('Unexpected error during authentication with Google');
    }
  }

  private async fetchUserData(accessToken: string): Promise<{
    profile: GoogleUserDataType;
    channel: YoutubeChannelDataType;
  }> {
    try {
      const response = await axios.get<GoogleUserDataType>(
        `${BASE_URL}/userinfo`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const channelResponse = await axios.get<YoutubeChannelDataType>(
        'https://www.googleapis.com/youtube/v3/channels',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            part: 'snippet,contentDetails,statistics,brandingSettings',
            mine: 'true',
          },
        },
      );

      return {
        profile: response.data,
        channel: channelResponse.data,
      };
    } catch (error) {
      logger.error('Error fetching user data from Google', error);
      throw new ApplicationException('Unexpected error during authentication with Google');
    }
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
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
}
