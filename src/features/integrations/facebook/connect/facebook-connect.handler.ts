import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { EventEmitter2 } from '@nestjs/event-emitter';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  PlatformConnectCleanupEvent,
  SocialAccountLinkedEvent,
} from '../../../../domain/events';
import { LinkedAccount } from '../../../../domain/entities/linkedAccount.entity';
import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToFacebookProfileModel } from '../../../../domain/mappers/facebook.mapper';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { serializeObject } from '../../../../core/utils/serialization.util';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import {
  FacebookProfileModel,
  FacebookUserDataType,
} from '../../../../domain/contracts/facebook.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { IContentStreamRepository } from '../../../../domain/repositories/icontentStream.repository';
import { UserLogin } from '../../../../domain/entities';
import { Globals } from '../../../../core/globals';

interface FacebookGranularScope {
  scope: string;
  target_ids?: string[];
}

interface FacebookLongLivedTokenResponse {
  access_token: string;
  expires_in: number;
}

interface FacebookPageResponse {
  id: string;
  name: string;
  access_token: string;
}

const GRAPH_BASE = 'https://graph.facebook.com/v23.0';

export class FacebookConnectQuery {
  model: {
    state: string;
  };

  constructor(request: Partial<FacebookConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class FacebookConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  };

  constructor(request: Partial<FacebookConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const facebookConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string()
    .required()
    .messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(FacebookConnectQuery)
export class FacebookConnectQueryHandler implements ICommandHandler<FacebookConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(query: FacebookConnectQuery): Promise<void> {
    const { model } = query;

    const expiresIn =
      Math.floor(Date.now() / 1000) + configs.Token.expirationTime;

    logger.debug('[FacebookConnect] Saving state');

    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      '',
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn,
    );

    const verify = await this.dataProtectionKeyRepository.getByKeyAsync(
      model.state,
    );

    logger.debug('[FacebookConnect] Saved state');
  }
}

@CommandHandler(FacebookConnectCallbackQuery)
export class FacebookConnectCallbackQueryHandler implements ICommandHandler<FacebookConnectCallbackQuery> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async execute(query: FacebookConnectCallbackQuery): Promise<{
    accessToken: string;
    expiresIn: number;
    profile: FacebookProfileModel;
  }> {
    const { model } = query;
    logger.debug('[FacebookConnect] Callback received');
    await facebookConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateState(model.state);

    const exchangeToken = await this.fetchShortLivedToken(model.code);
    const longToken = await this.fetchLongLivedToken(exchangeToken);

    const accessToken = longToken.access_token;

    const expiresIn = Number.isFinite(longToken.expires_in)
      ? longToken.expires_in
      : 60 * 24 * 60 * 60; // 60 days fallback

    const userData = await this.fetchUserData(accessToken);
    const user = await this.userRepository.getUserByIdAsync(
      dataProtectionKey.userId,
    );

    if (!user) {
      throw new ApplicationException(
        'Prevented: Alduterated Request Received!',
      );
    }
    const debugToken = await axios.get(`${GRAPH_BASE}/debug_token`, {
      params: {
        input_token: accessToken,
        access_token: `${configs.facebook.clientId}|${configs.facebook.clientSecret}`,
      },
    });

    const pageId = debugToken.data.data.granular_scopes?.find(
      (s: FacebookGranularScope) => s.scope === 'pages_show_list',
    )?.target_ids?.[0];

    if (!pageId) {
      throw new ApplicationException(
        'No Facebook Page ID found in token permissions.',
      );
    }

    let linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndEmailAsync(
        _const.PLATFORMS.FACEBOOK,
        user.email,
      );
    const newExternalId = userData.id;
    const pageResponse = await axios.get(`${GRAPH_BASE}/${pageId}`, {
      params: {
        fields: 'access_token,id,name',
        access_token: accessToken,
      },
    });
    const page = pageResponse.data;

    if (linkedAccount) {
      const oldExternalId = linkedAccount.externalId;

      if (oldExternalId !== newExternalId) {
        logger.info(
          `[FacebookConnect] User ${user.id} changed Facebook account from ${oldExternalId} to ${newExternalId}`,
        );
        this.eventEmitter.emit(
          'platform.connect.cleanup',
          new PlatformConnectCleanupEvent({ account: linkedAccount }),
        );
      }

      linkedAccount = await this.updateLinkedAccount(
        linkedAccount,
        userData,
        page,
      );
      logger.debug('[FacebookConnect] Linked account updated');
    } else {
      linkedAccount = await this.createLinkedAccount(
        user.id,
        user.email,
        userData,
        page,
      );
      logger.debug('[FacebookConnect] Linked account created');
    }

    const existingAccountLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        user.id,
        _const.PLATFORMS.FACEBOOK,
      );
    if (existingAccountLogin) {
      await this.updateUserLogin(existingAccountLogin, accessToken, expiresIn);
    } else {
      await this.createUserLogin(user.id, accessToken, expiresIn);
    }

    this.eventEmitter.emit(
      'social.account.linked',
      new SocialAccountLinkedEvent({ userId: user.id }),
    );

    return {
      accessToken: accessToken,
      expiresIn: expiresIn,
      profile: mapToFacebookProfileModel(linkedAccount, true),
    };
  }

  private async fetchShortLivedToken(code: string): Promise<string> {
    try {
      const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
        params: {
          client_id: configs.facebook.clientId,
          redirect_uri: configs.facebook.redirectUri,
          client_secret: configs.facebook.clientSecret,
          code,
        },
      });

      const { access_token } = response.data;
      return access_token;
    } catch (error) {
      logger.error('Error fetching short-lived token from Facebook', error);
      throw new ApplicationException(
        'Unexpected error during authentication with Facebook',
      );
    }
  }

  private async fetchLongLivedToken(
    shortLivedAccessToken: string,
  ): Promise<FacebookLongLivedTokenResponse> {
    const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
      params: {
        client_id: configs.facebook.clientId,
        client_secret: configs.facebook.clientSecret,
        grant_type: 'fb_exchange_token',
        fb_exchange_token: shortLivedAccessToken,
      },
    });

    logger.debug('[FacebookConnect] Fetched long-lived token');

    return response.data;
  }

  private async fetchUserData(
    accessToken: string,
  ): Promise<FacebookUserDataType> {
    try {
      const response = await axios.get<FacebookUserDataType>(
        `${GRAPH_BASE}/me`,
        {
          params: {
            access_token: accessToken,
            fields: 'id,name,email,picture,friends',
          },
        },
      );

      return response.data;
    } catch (error: unknown) {
      logger.error('Error fetching user data from Facebook', error);
      const facebookError =
        error instanceof Error && 'response' in error
          ? (error as any).response?.data || error.message
          : String(error);
      logger.error('Facebook API Error Details:', facebookError);
      throw new ApplicationException(
        `Facebook API Error: ${JSON.stringify(facebookError)}`,
      );
    }
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
    logger.debug('[FacebookConnect] Validating state');
    const dataProtectionKey =
      await this.dataProtectionKeyRepository.getByKeyAsync(state);
    logger.debug('[FacebookConnect] State validated');
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
    userData: FacebookUserDataType,
    page: FacebookPageResponse,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.FACEBOOK,
      page.id,
    );
    linkedAccount.externalId = page.id;
    linkedAccount.userName = page.name;
    linkedAccount.profileImage = userData.picture?.data?.url;
    linkedAccount.followingCount = userData.friends?.summary?.total_count;
    linkedAccount.metaData = {
      facebookUserId: userData.id,
      facebookUserName: userData.name,
      pageAccessToken: page.access_token,
      pageName: page.name,
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(
    userId: string,
    email: string,
    userData: FacebookUserDataType,
    page: FacebookPageResponse,
  ): Promise<LinkedAccount> {
    await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
      _const.PLATFORMS.FACEBOOK,
      page.id,
    );
    const newEntry = new LinkedAccount({
      platform: _const.PLATFORMS.FACEBOOK,
      email,
      userId,
      externalId: page.id,
      userName: page.name,
      profileImage: userData.picture?.data?.url,
      followingCount: userData.friends?.summary?.total_count,
      allowImport: true,
      metaData: {
        facebookUserId: userData.id,
        facebookUserName: userData.name,
        pageAccessToken: page.access_token,
        pageName: page.name,
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
    if (typeof expiresIn !== 'number' || Number.isNaN(expiresIn)) {
      throw new Error(`Invalid Facebook expires_in: ${expiresIn}`);
    }
    userLogin.expiryDateUtc = new Date(Date.now() + expiresIn * 1000);

    await this.userLoginRepository.updateAsync(userLogin);
  }

  private async createUserLogin(
    userId: string,
    accessToken: string,
    expiresIn: number,
  ): Promise<void> {
    // Standardize: Store as serialized object for consistency
    const tokenValue = serializeObject({
      access_token: accessToken,
      expires_in: expiresIn,
    });
    await this.userLoginRepository.createAysnc(
      _const.PLATFORMS.FACEBOOK,
      userId,
      '', // deviceId
      '', // userAgent
      '', // ipAddress
      tokenValue,
      new Date(Date.now() + expiresIn * 1000),
    );
  }
}
