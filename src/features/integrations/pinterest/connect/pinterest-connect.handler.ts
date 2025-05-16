import axios from "axios";
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

const PLATFORM = 'pinterest';
const BASE_URL = 'https://api.pinterest.com/v5';

export class PinterestConnectCommand {
  model: {
    code: string;
  }

  constructor(request: Partial<PinterestConnectCommand> = {}) {
    Object.assign(this, request);
  }
}

/**
 * Important: Pinterest does not reviel the email address of the user
 */
@CommandHandler(PinterestConnectHandler)
export class PinterestConnectHandler implements ICommandHandler<PinterestConnectCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: PinterestConnectCommand): Promise<any> {
    const { model } = command;

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

    // save content to db

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



}