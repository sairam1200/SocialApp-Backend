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
import { UserNotFoundException } from "core/exceptions";

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
  ) { }

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
  ) { }

  public async execute(query: RedditConnectCallbackQuery)
    : Promise<{ accessToken: string; expiresIn: number; profile: any }> {
    const { model } = query;

    // Validate incoming request
    await redditConnectCallbackValidations.validateAsync(model);

    // Validate state parameter
    const dataProtectionKey = await this.validateState(model.state);

    // Fetch access token from Reddit
    const { access_token, expires_in } = await this.fetchToken(model.code);

    // Fetch Reddit user profile data
    const userData = await this.fetchUserData(access_token);

    // Get local user by ID
    const user = await this.userRepository.getUserByIdAsync(dataProtectionKey.userId);
    if (!user || user.id !== dataProtectionKey.userId) {
      throw new UserNotFoundException(userData.id);
    }

    // Find existing linked account or create a new one
    let linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.REDDIT,
      user.id
    );

    if (linkedAccount) {
      linkedAccount.userName = userData.name;
      linkedAccount.profileImage = userData.snoovatar_img || userData.icon_img || '';
      linkedAccount.metaData = {
        karma: userData.total_karma,
        isEmployee: userData.is_employee,
        isGold: userData.is_gold,
        created: userData.created,
      };
      await this.linkedAccountRepository.updateAsync(linkedAccount);
    } else {
      linkedAccount = await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: _const.PLATFORMS.REDDIT,
        userId: user.id,
        email: user.email,
        externalId: userData.id,
        userName: userData.name,
        profileImage: userData.snoovatar_img || userData.icon_img || '',
        metaData: {
          karma: userData.total_karma,
          isEmployee: userData.is_employee,
          isGold: userData.is_gold,
          created: userData.created,
        }
      }));
    }

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      user.id,
      _const.PLATFORMS.REDDIT
    );

    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = access_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + expires_in * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        _const.PLATFORMS.REDDIT,
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
      profile: {
        username: userData.name,
        karma: userData.total_karma,
        isEmployee: userData.is_employee,
        isGold: userData.is_gold,
        verified: userData.verified,
        created: userData.created,
        profileImage: userData.snoovatar_img || userData.icon_img || ''
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

    const data = response.data;

    return {
      id: data.id,
      name: data.name,
      total_karma: data.total_karma ?? (data.link_karma + data.comment_karma),
      is_employee: data.is_employee,
      is_gold: data.is_gold,
      verified: data.verified,
      created: data.created,
      icon_img: data.icon_img,
      snoovatar_img: data.snoovatar_img,
    };
  }

  private async validateState(state: string): Promise<DataProtectionKey> {
    const dataProtectionKey = await this.dataProtectionKeyRepository.getByKeyAsync(state);
    if (!dataProtectionKey) throw new ApplicationException('Invalid state parameter');
    if (new Date(dataProtectionKey.createdOn.getTime() + dataProtectionKey.expiresIn * 1000) < new Date()) {
      throw new ApplicationException('State parameter has expired');
    }
    await this.dataProtectionKeyRepository.deleteAsync(dataProtectionKey);
    return dataProtectionKey;
  }

}
