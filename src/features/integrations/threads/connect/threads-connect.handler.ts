import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { EventEmitter2 } from '@nestjs/event-emitter';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SocialAccountLinkedEvent } from '../../../../domain/events';
import { DataProtectionKey } from '../../../../domain/entities';
import { UserNotFoundException } from '../../../../core/exceptions';
import { PlatformConnectCleanupEvent } from '../../../../domain/events';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToThreadsProfileModel } from '../../../../domain/mappers/threads.mapper';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import {
  ThreadsProfileModel,
  ThreadsUserDataType,
} from '../../../../domain/contracts/threads.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';

// Note: Threads API base URL - placeholder until API is released
const BASE_URL = 'https://graph.threads.net/v1.0';

export class ThreadsConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<ThreadsConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

export class ThreadsConnectQuery {
  model: {
    state: string;
  };

  constructor(request: Partial<ThreadsConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

const threadsConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(ThreadsConnectQuery)
export class ThreadsConnectQueryHandler implements ICommandHandler<ThreadsConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(command: ThreadsConnectQuery): Promise<void> {
    const { model } = command;
    const expiresIn =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      '',
      HttpContext.getCurrentUserId,
      expiresIn,
    );
  }
}

@CommandHandler(ThreadsConnectCallbackQuery)
export class ThreadsConnectCallbackQueryHandler implements ICommandHandler<ThreadsConnectCallbackQuery> {
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

  public async execute(query: ThreadsConnectCallbackQuery): Promise<{
    accessToken: string;
    expiresIn: number;
    profile: ThreadsProfileModel;
  }> {
    const { model } = query;
    await threadsConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);

    // Note: Threads API not yet available - stub implementation
    // When API is released, replace with actual implementation
    let access_token: string;
    let expires_in: number;
    let userData: ThreadsUserDataType;

    try {
      const tokenResponse = await this.fetchToken(model.code);
      access_token = tokenResponse.access_token;
      expires_in = tokenResponse.expires_in;
      userData = await this.fetchUserData(access_token);
    } catch (error) {
      logger.warn('[ThreadsConnect] API not yet available', error);
      throw new ApplicationException(
        'Threads API is not yet available. Please check back later.',
      );
    }

    const user = await this.userRepository.getUserByIdAsync(
      dataProtectionKey.userId,
    );
    if (!user || user.id !== dataProtectionKey.userId) {
      throw new UserNotFoundException(userData.id);
    }

    let linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.THREADS,
        user.id,
      );
    const newExternalId = userData.id;
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(
          `[ThreadsConnect] User ${user.id} changed Threads account from ${oldExternalId} to ${newExternalId}`,
        );
        this.eventEmitter.emit(
          'platform.connect.cleanup',
          new PlatformConnectCleanupEvent({ account: linkedAccount }),
        );
      }

      linkedAccount.externalId = newExternalId;
      linkedAccount.userName = userData.username;
      linkedAccount.profileImage = userData.profile_picture_url;
      linkedAccount.externalUrl = `https://www.threads.net/@${userData.username}`;
      linkedAccount.metaData = {
        displayName: userData.name,
      };
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.THREADS,
        newExternalId,
      );
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.THREADS,
        userData.id,
      );
      linkedAccount = await this.linkedAccountRepository.createAsync(
        new LinkedAccount({
          platform: _const.PLATFORMS.THREADS,
          userId: user.id,
          externalId: userData.id,
          userName: userData.username,
          profileImage: userData.profile_picture_url,
          externalUrl: `https://www.threads.net/@${userData.username}`,
          metaData: {
            displayName: userData.name,
          },
        }),
      );
    }

    let existingAccountLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        user.id,
        _const.PLATFORMS.THREADS,
      );
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = access_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(
        Date.now() + expires_in * 1000,
      );
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.THREADS,
        user.id,
        '',
        '',
        '',
        access_token,
        new Date(Date.now() + expires_in * 1000),
      );
    }

    this.eventEmitter.emit(
      'social.account.linked',
      new SocialAccountLinkedEvent({ userId: user.id }),
    );

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToThreadsProfileModel(linkedAccount, true),
    };
  }

  private async fetchToken(
    code: string,
  ): Promise<{ access_token: string; expires_in: number }> {
    // Placeholder - update when Threads API is available
    const basicAuth = Buffer.from(
      `${configs.threads?.clientId || ''}:${configs.threads?.clientSecret || ''}`,
    ).toString('base64');
    try {
      const response = await axios.post(
        `${BASE_URL}/oauth/access_token`,
        `grant_type=authorization_code` +
          `&code=${encodeURIComponent(code)}` +
          `&redirect_uri=${encodeURIComponent(configs.threads?.redirectUri || '')}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        },
      );
      return response.data;
    } catch (error) {
      logger.error('Error fetching token from Threads', error);
      throw new ApplicationException('Threads API is not yet available.');
    }
  }

  private async fetchUserData(
    accessToken: string,
  ): Promise<ThreadsUserDataType> {
    try {
      const response = await axios.get<ThreadsUserDataType>(`${BASE_URL}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from Threads', error);
      throw new ApplicationException('Threads API is not yet available.');
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
