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
import { mapToBehanceProfileModel } from "../../../../domain/mappers/behance.mapper";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { BehanceProfileModel, BehanceUserDataType } from "../../../../domain/contracts/behance.model";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";
import { IContentStreamRepository } from "../../../../domain/repositories/icontentStream.repository";

// Behance has no official API, using fallback logic with manual profile linking
const BEHANCE_BASE_URL = 'https://www.behance.net';

export class BehanceConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<BehanceConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

export class BehanceConnectQuery {
  model: {
    state: string;
  }

  constructor(request: Partial<BehanceConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

const behanceConnectCallbackValidations = Joi.object({
  code: Joi.string().optional().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(BehanceConnectQuery)
export class BehanceConnectQueryHandler implements ICommandHandler<BehanceConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: BehanceConnectQuery): Promise<void> {
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

@CommandHandler(BehanceConnectCallbackQuery)
export class BehanceConnectCallbackQueryHandler implements ICommandHandler<BehanceConnectCallbackQuery> {

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

  public async execute(query: BehanceConnectCallbackQuery):
    Promise<{ accessToken: string; expiresIn: number; profile: BehanceProfileModel; }> {
    const { model } = query;
    await behanceConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateStateAsync(model.state);

    // Since Behance has no official API, we'll create a basic account
    // This would scrape profile data from the provided URL or use manual entry
    const userData: BehanceUserDataType = {
      id: `behance_${Date.now()}`,
      username: `user_${Date.now()}`,
      display_name: 'Behance User',
    };

    const user = await this.userRepository.getUserByIdAsync(dataProtectionKey.userId);
    if (!user || user.id !== dataProtectionKey.userId) {
      throw new UserNotFoundException(userData.id);
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.BEHANCE, user.id);
    const newExternalId = userData.id;
    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(`[BehanceConnect] User ${user.id} changed Behance account from ${oldExternalId} to ${newExternalId}`);
        this.eventEmitter.emit('platform.connect.cleanup', new PlatformConnectCleanupEvent({ account: linkedAccount }));
      }

      linkedAccount.externalId = newExternalId;
      linkedAccount.userName = userData.username;
      linkedAccount.externalUrl = `${BEHANCE_BASE_URL}/${userData.username}`;
      linkedAccount.metaData = {
        displayName: userData.display_name,
        location: userData.location,
        occupation: userData.occupation,
      };
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.BEHANCE,
        newExternalId,
      );
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
        _const.PLATFORMS.BEHANCE,
        userData.id,
      );
      linkedAccount = await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: _const.PLATFORMS.BEHANCE,
        userId: user.id,
        externalId: userData.id,
        userName: userData.username,
        externalUrl: `${BEHANCE_BASE_URL}/${userData.username}`,
        metaData: {
          displayName: userData.display_name,
          location: userData.location,
          occupation: userData.occupation,
        }
      }));
    }

    // For Behance, we use a placeholder token since there's no API
    const access_token = 'behance_fallback_token';
    const expires_in = 3600 * 24 * 365; // 1 year placeholder

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(user.id, _const.PLATFORMS.BEHANCE);
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = access_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.BEHANCE,
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
      profile: mapToBehanceProfileModel(linkedAccount, true)
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
