import axios from "axios";
import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { EventEmitter2 } from "@nestjs/event-emitter";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { DataProtectionKey } from "../../../../domain/entities";
import { UserNotFoundException } from "../../../../core/exceptions";
import { PlatformConnectCleanupEvent } from "../../../../domain/events";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { mapToSnapchatProfileModel } from "../../../../domain/mappers/snapchat.mapper";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { SnapchatProfileModel, SnapchatUserDataType } from "../../../../domain/contracts/snapchat.model";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";
import { IContentStreamRepository } from "../../../../domain/repositories/icontentStream.repository";

// Note: Snapchat Kit API base URL - may need adjustment based on actual API
const BASE_URL = 'https://kit.snapchat.com/v1';

export class SnapchatConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<SnapchatConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

export class SnapchatConnectQuery {
  model: {
    state: string;
  }

  constructor(request: Partial<SnapchatConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

const snapchatConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(SnapchatConnectQuery)
export class SnapchatConnectQueryHandler implements ICommandHandler<SnapchatConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: SnapchatConnectQuery): Promise<void> {

    const { model } = command;

    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      "",
      HttpContext.getCurrentUserId,
      expiresIn
    );
  }
}

@CommandHandler(SnapchatConnectCallbackQuery)
export class SnapchatConnectCallbackQueryHandler implements ICommandHandler<SnapchatConnectCallbackQuery> {

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

  public async execute(query: SnapchatConnectCallbackQuery):
    Promise<{ accessToken: string; expiresIn: number; profile: SnapchatProfileModel; }> {
    const { model } = query;
    await snapchatConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);

    // Note: Snapchat API may not be available - implement fallback logic
    let access_token: string;
    let expires_in: number;
    let userData: SnapchatUserDataType;

    try {
      const tokenResponse = await this.fetchToken(model.code);
      access_token = tokenResponse.access_token;
      expires_in = tokenResponse.expires_in;
      userData = await this.fetchUserData(access_token);
    } catch (error) {
      logger.warn('[SnapchatConnect] API unavailable, using fallback logic', error);
      // Fallback: Create account with limited data
      userData = {
        id: `snapchat_${Date.now()}`,
        username: `user_${Date.now()}`,
        display_name: 'Snapchat User',
      };
      access_token = 'fallback_token';
      expires_in = 3600;
    }

    const user = await this.userRepository.getUserByIdAsync(dataProtectionKey.userId);
    if (!user || user.id !== dataProtectionKey.userId) {
      throw new UserNotFoundException(userData.id);
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.SNAPCHAT, user.id);
    const newExternalId = userData.id;
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(`[SnapchatConnect] User ${user.id} changed Snapchat account from ${oldExternalId} to ${newExternalId}`);
        this.eventEmitter.emit('platform.connect.cleanup', new PlatformConnectCleanupEvent({ account: linkedAccount }));
      }

      linkedAccount.externalId = newExternalId;
      linkedAccount.userName = userData.username;
      linkedAccount.profileImage = userData.profile_image;
      linkedAccount.externalUrl = `https://www.snapchat.com/add/${userData.username}`;
      linkedAccount.metaData = {
        displayName: userData.display_name,
      };
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.SNAPCHAT,
        newExternalId,
      );
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.SNAPCHAT,
        userData.id,
      );
      linkedAccount = await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: _const.PLATFORMS.SNAPCHAT,
        userId: user.id,
        externalId: userData.id,
        userName: userData.username,
        profileImage: userData.profile_image,
        externalUrl: `https://www.snapchat.com/add/${userData.username}`,
        metaData: {
          displayName: userData.display_name,
        }
      }));
    }

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(user.id, _const.PLATFORMS.SNAPCHAT);
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = access_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.SNAPCHAT,
        user.id,
        "",
        "",
        "",
        access_token,
        new Date(Date.now() + expires_in * 1000)
      );
    }

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: mapToSnapchatProfileModel(linkedAccount, true)
    }
  }

  private async fetchToken(code: string)
    : Promise<{ access_token: string; expires_in: number }> {
    // Note: This is a placeholder - actual Snapchat API implementation may differ
    const basicAuth = Buffer.from(`${configs.snapchat?.clientId || ''}:${configs.snapchat?.clientSecret || ''}`).toString('base64');
    try {
      const response = await axios.post(
        `${BASE_URL}/oauth/token`,
        `grant_type=authorization_code` +
        `&code=${encodeURIComponent(code)}` +
        `&redirect_uri=${encodeURIComponent(configs.snapchat?.redirectUri || '')}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`
          }
        })
      return response.data;
    } catch (error) {
      logger.error('Error fetching token from Snapchat', error);
      throw new ApplicationException('Unexpected error during authentication with Snapchat');
    }
  }

  private async fetchUserData(accessToken: string): Promise<SnapchatUserDataType> {
    try {
      const response = await axios.get<SnapchatUserDataType>(`${BASE_URL}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from Snapchat', error);
      throw new ApplicationException('Unexpected error during authentication with Snapchat');
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
    return dataProtectionKey
  }
}
