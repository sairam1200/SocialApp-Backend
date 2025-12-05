import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from '../../../../core/globals';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { mapToFacebookProfileModel } from '../../../../domain/mappers/facebook.mapper';
import { DataProtectionKey } from '../../../../domain/entities/dataProtectionKey.entity';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { FacebookProfileModel, FacebookUserDataModel } from '../../../../domain/contracts/facebook.model';
import { IDataProtectionKeyRepository } from '../../../../domain/repositories/idataProtectionKey.repository';

const GRAPH_BASE = 'https://graph.facebook.com/v23.0';

export class FacebookConnectQuery {
  model: {
    state: string;
  }

  constructor(request: Partial<FacebookConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class FacebookConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<FacebookConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const facebookConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(FacebookConnectQuery)
export class FacebookConnectQueryHandler implements ICommandHandler<FacebookConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(query: FacebookConnectQuery): Promise<void> {

    const { model } = query;

    // expires in 15 minutes
    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      "",
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
    );
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
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: FacebookConnectCallbackQuery):
    Promise<{ accessToken: string; expiresIn: number; profile: FacebookProfileModel }> {

    const { model } = query;
    await facebookConnectCallbackValidations.validateAsync(model);
    const dataProtectionKey = await this.validateState(model.state);

    const exchangeToken = await this.fetchShortLivedToken(model.code);
    const { access_token, expires_in } = await this.fetchLongLivedToken(exchangeToken);

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByIdAsync(dataProtectionKey.userId);

    if (!user) {
      throw new ApplicationException('Prevented: Alduterated Request Received!');
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(_const.PLATFORMS.FACEBOOK, user.email);
    if (linkedAccount) {
      linkedAccount.userName = userData.name;
      linkedAccount.profileImage = userData.picture?.data?.url;
      linkedAccount.followingCount = userData.friends?.summary?.total_count,
      linkedAccount.metaData = {
        name: userData.name,
      };
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      linkedAccount = await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: _const.PLATFORMS.FACEBOOK,
        email: userData.email,
        userId: user.id,
        externalId: userData.id,
        userName: userData.name,
        profileImage: userData.picture?.data?.url,
        followingCount: userData.friends?.summary?.total_count,
        metaData: {
          name: userData.name,
        }
      }));
    }

    const existingAccountLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(user.id, _const.PLATFORMS.FACEBOOK);
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = access_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.FACEBOOK,
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
      profile: mapToFacebookProfileModel(linkedAccount, true)
    }
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
      throw new ApplicationException('Unexpected error during authentication with Facebook');
    }
  }

  private async fetchLongLivedToken(shortLivedAccessToken: string)
    : Promise<{ access_token: string; token_type: string; expires_in: number }> {
    try {
      const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
        params: {
          client_id: configs.facebook.clientId,
          client_secret: configs.facebook.clientSecret,
          grant_type: 'fb_exchange_token',
          fb_exchange_token: shortLivedAccessToken,
        },
      });

      return response.data;
    } catch (error) {

    }
  }

  private async fetchUserData(accessToken: string): Promise<FacebookUserDataModel> {
    try {
      const response = await axios.get<FacebookUserDataModel>(`${GRAPH_BASE}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,email,picture,friends',
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error('Error fetching user data from Facebook', error);
      const facebookError = error.response?.data || error.message;
      logger.error('Facebook API Error Details:', facebookError);
      throw new ApplicationException(`Facebook API Error: ${JSON.stringify(facebookError)}`);
    }
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
}