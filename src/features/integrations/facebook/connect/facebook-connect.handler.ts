import axios from 'axios';
import * as Joi from 'joi';
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from '../../../../core/globals';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { FacebookUserData } from '../../../../domain/contracts/facebook.model';
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import ApplicationException from '../../../../core/exceptions/application.exception';
import { IUserLoginRepository } from '../../../../domain/repositories/irefreshtoken.repository';
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IDataProtectionKeyRepository } from 'domain/repositories/idataProtectionKey.repository';

const PLATFORM = 'facebook';
const GRAPH_BASE = 'https://graph.facebook.com/v22.0';

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

  public async execute(command: FacebookConnectQuery): Promise<void> {

    const { model } = command;

    // expires in 15 minutes
    const expiresIn = 15 * 60;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      "",
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
    );
  }
}

@CommandHandler(FacebookConnectCallbackQuery)
export class FacebookConnectCallbackHandler implements ICommandHandler<FacebookConnectCallbackQuery> {

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

  public async execute(command: FacebookConnectCallbackQuery):
    Promise<{ accessToken: string; expiresIn: number; profile: FacebookUserData }> {

    const { model } = command;
    await facebookConnectCallbackValidations.validateAsync(model);
    await this.validateState(model.state);

    const exchangeToken = await this.fetchShortLivedToken(model.code);
    const { access_token, expires_in } = await this.fetchLongLivedToken(exchangeToken);

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByEmailAsync(userData.email)
      ?? await this.userRepository.getUserByIdAsync(HttpContext.user[Globals.ClaimTypes.UserId]);

    if (!user) {
      throw new ApplicationException('Prevented: Alduterated Request Received!');
    }

    let existingLinkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(PLATFORM, user.email);
    if (existingLinkedAccount) {
      existingLinkedAccount.username = userData.username;
      existingLinkedAccount.profileImage = userData.picture?.data?.url;
      existingLinkedAccount.followersCount = userData.followers_count;
      existingLinkedAccount.followingCount = userData.friends?.summary?.total_count;
      existingLinkedAccount.metaData = {
        name: userData.name,
      };
      await this.linkedAccountRepository.updateAsync(existingLinkedAccount);
    } else {
      await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: PLATFORM,
        email: userData.email,
        userId: user.id,
        externalId: userData.id,
        username: userData.username,
        profileImage: userData.picture?.data?.url,
        followersCount: userData.followers_count,
        followingCount: userData.friends?.summary?.total_count,
        metaData: {
          name: userData.name,
        }
      }));
    }

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProvider(user.id, PLATFORM);
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = access_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        PLATFORM,
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
      profile: userData
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
      throw new Error('Unexpected error during authentication with Facebook');
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

  private async fetchUserData(accessToken: string): Promise<FacebookUserData> {
    try {
      const response = await axios.get<FacebookUserData>(`${GRAPH_BASE}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,username,email,picture,followers_count,friends',
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from Facebook', error);
      throw new Error('Unexpected error during authentication with Facebook');
    }
  }

  private async validateState(state: string): Promise<void> {
    const dataProtectionKey = await this.dataProtectionKeyRepository.getByKeyAsync(state);
    if (!dataProtectionKey) {
      throw new ApplicationException('Invalid state parameter');
    }

    if (new Date(dataProtectionKey.createdOn.getTime() + dataProtectionKey.expiresIn * 1000) < new Date()) {
      throw new ApplicationException('State parameter has expired');
    }

    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
  }
}