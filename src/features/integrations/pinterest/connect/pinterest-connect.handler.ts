import axios from "axios";
import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { PinterestUserData } from "../../../../domain/contracts/pinterest.model";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IDataProtectionKeyRepository } from "../../../../domain/repositories/idataProtectionKey.repository";

const PLATFORM = 'pinterest';
const BASE_URL = 'https://api.pinterest.com/v5';

export class PinterestConnectCallbackQuery {
  model: {
    code: string;
    state: string;
  }

  constructor(request: Partial<PinterestConnectCallbackQuery> = {}) {
    Object.assign(this, request);
  }
}

export class PinterestConnectQuery {
  model: {
    state: string;
  }

  constructor(request: Partial<PinterestConnectQuery> = {}) {
    Object.assign(this, request);
  }
}

const pinterestConnectCallbackValidations = Joi.object({
  code: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
  state: Joi.string().required().messages({ 'any.required': 'Invalid request' }),
});

@CommandHandler(PinterestConnectQuery)
export class PinterestConnectQueryHandler implements ICommandHandler<PinterestConnectQuery> {

  constructor(
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
  ) { }

  public async execute(command: PinterestConnectQuery): Promise<void> {

    const { model } = command;

    // expires in 15 minutes
    const expiresIn = 15 * 60;
    await this.dataProtectionKeyRepository.createAsync(
      model.state,
      "", // value is not used
      HttpContext.user[Globals.ClaimTypes.UserId],
      expiresIn
    );
  }
}

/**
 * Important: Pinterest does not reviel the email address of the user
 */
@CommandHandler(PinterestConnectCallbackQuery)
export class PinterestConnectCallbackQueryHandler implements ICommandHandler<PinterestConnectCallbackQuery> {

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

  public async execute(command: PinterestConnectCallbackQuery):
    Promise<{ accessToken: string; expiresIn: number; profile: PinterestUserData; }> {
    const { model } = command;
    await pinterestConnectCallbackValidations.validateAsync(model);
    await this.validateState(model.state);

    const { access_token, refresh_token, expires_in, refresh_token_expires_in } = await this.fetchToken(model.code);

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByIdAsync(HttpContext.user[Globals.ClaimTypes.UserId]);

    if (!user) {
      throw new ApplicationException('Prevented: Alduterated Request Received!');
    }

    let existingLinkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(PLATFORM, user.email);
    if (existingLinkedAccount) {
      existingLinkedAccount.username = userData.username;
      existingLinkedAccount.profileImage = userData.profile_image;
      existingLinkedAccount.followersCount = userData.follower_count;
      existingLinkedAccount.followingCount = userData.following_count;
      existingLinkedAccount.metaData = {
        monthly_views: userData.monthly_views,
        board_count: userData.board_count,
        website_url: userData.website_url,
        pin_count: userData.pin_count,
        about: userData.about,
      };
      await this.linkedAccountRepository.updateAsync(existingLinkedAccount);
    } else {
      await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: PLATFORM,
        userId: user.id,
        externalId: userData.id,
        username: userData.username,
        profileImage: userData.profile_image,
        followersCount: userData.follower_count,
        followingCount: userData.following_count,
        metaData: {
          monthly_views: userData.monthly_views,
          board_count: userData.board_count,
          website_url: userData.website_url,
          pin_count: userData.pin_count,
          about: userData.about,
        }
      }));
    }

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProvider(user.id, PLATFORM);
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = refresh_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + refresh_token_expires_in * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        PLATFORM,
        user.id,
        "",
        "",
        "",
        refresh_token,
        new Date(Date.now() + refresh_token_expires_in * 1000)
      );
    }

    return {
      accessToken: access_token,
      expiresIn: expires_in,
      profile: userData
    }
  }

  private async fetchToken(code: string)
    : Promise<{ access_token: string; token_type: string; expires_in: number; refresh_token: string; refresh_token_expires_in: number }> {
    try {
      const response = await axios.get(`${BASE_URL}/oauth/token`, {
        params: {
          client_secret: configs.pinterest.clientSecret,
          redirect_uri: configs.pinterest.redirectUri,
          client_id: configs.pinterest.clientId,
          grant_type: 'authorization_code',
          code: code,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching token from Pinterest', error);
      throw new Error('Unexpected error during authentication with Pinterest');
    }
  }

  private async fetchUserData(accessToken: string): Promise<PinterestUserData> {
    try {
      const response = await axios.get<PinterestUserData>(`${BASE_URL}/me`, {
        params: {
          access_token: accessToken,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from Pinterest', error);
      throw new Error('Unexpected error during authentication with Pinterest');
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