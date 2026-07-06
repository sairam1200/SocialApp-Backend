import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { EventEmitter2 } from '@nestjs/event-emitter';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DataProtectionKey } from '../../../../domain/entities';
import { UserNotFoundException } from '../../../../core/exceptions';
import { PlatformConnectCleanupEvent } from '../../../../domain/events';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToPinterestProfileModel } from '../../../../domain/mappers/pinterest.mapper';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import {
  PinterestProfileModel,
  PinterestUserDataType,
} from '../../../../domain/contracts/pinterest.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';

const BASE_URL = 'https://api.pinterest.com/v5';

export class PinterestConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<PinterestConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

export class PinterestConnectQuery {
  model: {
    state: string;
  };

  constructor(request: Partial<PinterestConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

const pinterestConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(PinterestConnectQuery)
export class PinterestConnectQueryHandler
  implements ICommandHandler<PinterestConnectQuery>
{
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(command: PinterestConnectQuery): Promise<void> {
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

/**
 * Important: Pinterest does not reviel the email address of the user
 */
@CommandHandler(PinterestConnectCallbackQuery)
export class PinterestConnectCallbackQueryHandler
  implements ICommandHandler<PinterestConnectCallbackQuery>
{
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
  ) {}

  public async execute(query: PinterestConnectCallbackQuery): Promise<{
    accessToken: string;
    expiresIn: number;
    profile: PinterestProfileModel;
  }> {
    const { model } = query;
    await pinterestConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);

    const {
      access_token,
      refresh_token,
      expires_in,
      refresh_token_expires_in,
    } = await this.fetchToken(model.code);

    const userData = await this.fetchUserData(access_token);

    const user = await this.userRepository.getUserByIdAsync(
      dataProtectionKey.userId,
    );
    if (!user || user.id !== dataProtectionKey.userId) {
      throw new UserNotFoundException(userData.id);
    }

    console.log('user user: ', user);
    console.log('user userdata: ', userData);
    let linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.PINTEREST,
        user.id,
      );
    console.log('linkedAccount: ', linkedAccount);

    const newExternalId = userData.id;
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(
          `[PinterestConnect] User ${user.id} changed Pinterest account from ${oldExternalId} to ${newExternalId}`,
        );
        this.eventEmitter.emit(
          'platform.connect.cleanup',
          new PlatformConnectCleanupEvent({ account: linkedAccount }),
        );
      }

      linkedAccount.externalId = newExternalId;
      linkedAccount.userName = userData.username;
      linkedAccount.profileImage = userData.profile_image;
      linkedAccount.followersCount = userData.follower_count;
      linkedAccount.followingCount = userData.following_count;
      linkedAccount.externalUrl = `https://www.pinterest.com/${userData.username}/`;
      linkedAccount.metaData = {
        monthly_views: userData.monthly_views,
        board_count: userData.board_count,
        website_url: userData.website_url,
        pin_count: userData.pin_count,
        about: userData.about,
      };
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.PINTEREST,
        newExternalId,
      );
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      console.log('Creating new linked account for Pinterest');
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.PINTEREST,
        userData.id,
      );
      linkedAccount = await this.linkedAccountRepository.createAsync(
        new LinkedAccount({
          platform: _const.PLATFORMS.PINTEREST,
          userId: user.id,
          externalId: userData.id,
          userName: userData.username,
          profileImage: userData.profile_image,
          followersCount: userData.follower_count,
          followingCount: userData.following_count,
          externalUrl: `https://www.pinterest.com/${userData.username}/`,
          metaData: {
            monthlyViews: userData.monthly_views,
            boardCount: userData.board_count,
            websiteUrl: userData.website_url,
            pinCount: userData.pin_count,
            about: userData.about,
          },
        }),
      );
    }

    let existingAccountLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        user.id,
        _const.PLATFORMS.PINTEREST,
      );
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = refresh_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(
        Date.now() + refresh_token_expires_in * 1000,
      );
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.PINTEREST,
        user.id,
        '',
        '',
        '',
        refresh_token,
        new Date(Date.now() + refresh_token_expires_in * 1000),
      );
    }

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToPinterestProfileModel(linkedAccount, true),
    };
  }

  private async fetchToken(code: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    refresh_token_expires_in: number;
  }> {
    const basicAuth = Buffer.from(
      `${configs.pinterest.clientId}:${configs.pinterest.clientSecret}`,
    ).toString('base64');
    try {
      const response = await axios.post(
        `${BASE_URL}/oauth/token`,
        `grant_type=authorization_code` +
          `&code=${encodeURIComponent(code)}` +
          `&redirect_uri=${encodeURIComponent(configs.pinterest.redirectUri)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        },
      );
      console.log('Access token response:', response.data);
      return response.data;
    } catch (error) {
      //console.log('Error fetching token from Pinterest', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Pinterest',
      );
    }
  }

  private async fetchUserData(
    accessToken: string,
  ): Promise<PinterestUserDataType> {
    try {
      const response = await axios.get<PinterestUserDataType>(
        `${BASE_URL}/user_account`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      console.log('User data response:', response.data);
      return response.data;
    } catch (error) {
      console.log('Error fetching user data from Pinterest', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Pinterest',
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
}
