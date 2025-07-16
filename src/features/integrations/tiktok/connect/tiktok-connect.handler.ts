import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from '../../../../core/globals';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { UserLogin } from "../../../../domain/entities/userLogin.entity";
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { IUserLoginRepository } from '../../../../domain/repositories/irefreshtoken.repository';
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';
import { TikTokErrorHandler } from '../../../../core/utils/tiktokError.util';

const TIKTOK_BASE = 'https://open.tiktokapis.com/v2';

export class TikTokConnectQuery {
  model: {
    state: string;
    codeVerifier?: string;
  }

  constructor(request: Partial<TikTokConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class TikTokConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<TikTokConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const tiktokConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(TikTokConnectQuery)
export class TikTokConnectQueryHandler implements ICommandHandler<TikTokConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(query: TikTokConnectQuery): Promise<void> {

    const { model } = query;

    // expires in 15 minutes
    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      model.codeVerifier || "",
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
    );
  }
}

@CommandHandler(TikTokConnectCallbackQuery)
export class TikTokConnectCallbackQueryHandler implements ICommandHandler<TikTokConnectCallbackQuery> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: TikTokConnectCallbackQuery):
    Promise<{ accessToken: string; expiresIn: number; profile: any }> {

    const { model } = query;
    await tiktokConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateState(model.state);

    const tokenData = await this.exchangeCodeForToken(model.code, dataProtectionKey.value);

    const user = await this.userRepository.getUserByIdAsync(dataProtectionKey.userId);

    if (!user) {
      throw new ApplicationException('TikTok callback received incorrect user');
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(_const.PLATFORMS.TIKTOK, user.email);
    if (linkedAccount) {
      linkedAccount = await this.updateLinkedAccount(linkedAccount, tokenData);
    } else {
      linkedAccount = await this.createLinkedAccount(user, tokenData);
    }

    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(user.id, _const.PLATFORMS.TIKTOK);
    if (userLogin) {
      await this.updateUserLogin(userLogin, tokenData);
    } else {
      await this.createUserLogin(user.id, tokenData);
    }

    return {
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
      profile: linkedAccount, // Map to desired profile model as needed
    };
  }

  private async exchangeCodeForToken(code: string, codeVerifier?: string): Promise<any> {
    return TikTokErrorHandler.withRetry(async () => {
      const tokenRequest: any = {
        client_key: configs.tiktok.clientId,
        client_secret: configs.tiktok.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: configs.tiktok.redirectUri,
      };
      
      // Include code_verifier if PKCE is used
      if (codeVerifier) {
        tokenRequest.code_verifier = codeVerifier;
      }
      
      const response = await axios.post(`${TIKTOK_BASE}/oauth/token/`, tokenRequest, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
        },
      });
      return response.data;
    }, 3, 1000, 'TikTok token exchange');
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
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

  private async updateLinkedAccount(linkedAccount: LinkedAccount, tokenData: any): Promise<LinkedAccount> {
    linkedAccount.metaData = {
      ...linkedAccount.metaData,
      likesCount: tokenData.scoped_info?.likes_count || 0,
      videoCount: tokenData.scoped_info?.video_count || 0,
    };
    await this.linkedAccountRepository.updateAsync(linkedAccount);
    return linkedAccount;
  }

  private async createLinkedAccount(user: any, tokenData: any): Promise<LinkedAccount> {
    const newAccount = new LinkedAccount({
      userId: user.id,
      platform: _const.PLATFORMS.TIKTOK,
      userName: user.email, // Simplified for example
      externalId: tokenData.open_id,
      allowImport: true,
      metaData: {
        likesCount: tokenData.scoped_info?.likes_count || 0,
        videoCount: tokenData.scoped_info?.video_count || 0,
      },
    });
    return this.linkedAccountRepository.createAsync(newAccount);
  }

  private async updateUserLogin(userLogin: any, tokenData: any): Promise<void> {
    userLogin.tokenValue = tokenData.access_token;
    userLogin.expiryDateUtc = new Date(Date.now() + tokenData.expires_in * 1000);
    await this.userLoginRepository.updateAsync(userLogin);
  }

  private async createUserLogin(userId: string, tokenData: any): Promise<void> {
    await this.userLoginRepository.createAysnc(
      _const.PLATFORMS.TIKTOK,
      userId,
      '', // deviceId
      '', // userAgent
      '', // ipAddress
      tokenData.refresh_token || tokenData.access_token,
      new Date(Date.now() + (tokenData.refresh_token_expires_in || tokenData.expires_in) * 1000)
    );
  }

  private async refreshTokenAsync(refreshToken: string): Promise<{ access_token: string, expires_in: number, refresh_token?: string }> {
    return TikTokErrorHandler.withRetry(async () => {
      const response = await axios.post(`${TIKTOK_BASE}/oauth/token/`, {
        client_key: configs.tiktok.clientId,
        client_secret: configs.tiktok.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
        },
      });
      
      return response.data;
    }, 3, 1000, 'TikTok token refresh');
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`${TIKTOK_BASE}/user/info/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      return response.status === 200 && !!response.data?.data?.user?.open_id;
    } catch (error) {
      logger.error('TikTok token verification failed', error);
      return false;
    }
  }
}

