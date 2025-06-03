import axios from "axios";
import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { DataProtectionKey } from "../../../../domain/entities/dataProtectionKey.entity";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";

export class RedditConnectQuery {
  model: { state: string };
  constructor(request: Partial<RedditConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

export class RedditConnectCallbackQuery {
  model: { code: string; state: string };
  constructor(request: Partial<RedditConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

const redditConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(RedditConnectQuery)
export class RedditConnectQueryHandler implements ICommandHandler<RedditConnectQuery> {
  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) {}

  public async execute(command: RedditConnectQuery): Promise<void> {
    const { model } = command;
    const expiresIn = Math.floor(Date.now() / 1000) + configs.Token.expirationTime;

    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      "",
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
    );
  }
}
@CommandHandler(RedditConnectCallbackQuery)
export class RedditConnectCallbackQueryHandler implements ICommandHandler<RedditConnectCallbackQuery> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  public async execute(query: RedditConnectCallbackQuery)
    : Promise<{ accessToken: string; expiresIn: number; profile: any }> {
    const { model } = query;
    await redditConnectCallbackValidations.validateAsync(model);
    await this.validateState(model.state);

    const { access_token, refresh_token, expires_in } = await this.fetchToken(model.code);
    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByEmailAsync(userData.data.email);

    if (!user || user.id !== HttpContext.user[Globals.ClaimTypes.UserId]) {
      throw new ApplicationException('Prevented: Alduterated Request Received!');
    }

    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(
      _const.PLATFORMS.REDDIT,
      user.email
    );

    if (linkedAccount) {
      linkedAccount.userName = userData.data.name;
      linkedAccount.profileImage = ''; // Reddit doesn't return profile image in /me
      linkedAccount.metaData = {
        karma: userData.data.total_karma,
        isEmployee: userData.data.is_employee,
      };
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      linkedAccount = await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: _const.PLATFORMS.REDDIT,
        userId: user.id,
        email: userData.data.email,
        externalId: userData.data.id,
        userName: userData.data.name,
        profileImage: '',
        metaData: {
          karma: userData.data.total_karma,
          isEmployee: userData.data.is_employee,
        }
      }));
    }

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProvider(
      user.id,
      _const.PLATFORMS.REDDIT
    );

    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = refresh_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.REDDIT,
        user.id,
        "",
        "",
        "",
        refresh_token,
        new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)
      );
    }

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: {
        username: userData.data.name,
        karma: userData.data.total_karma,
        isEmployee: userData.data.is_employee
      }
    };
  }

  private async fetchToken(code: string) {
    const credentials = Buffer.from(`${configs.reddit.clientId}:${configs.reddit.clientSecret}`).toString('base64');

    const response = await axios.post(
      `https://www.reddit.com/api/v1/access_token`,
      new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: configs.reddit.redirectUri
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data;
  }

  private async fetchUserData(accessToken: string) {
    const response = await axios.get(`https://oauth.reddit.com/api/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    return { data: response.data };
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
    const dataProtectionKey = await this.dataProtectionKeyRepository.getByKeyAsync(state);
    if (!dataProtectionKey) throw new ApplicationException('Invalid state parameter');
    if (dataProtectionKey.expiresIn < Math.floor(Date.now() / 1000)) throw new ApplicationException('State expired');
    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
    return dataProtectionKey;
  }
}
