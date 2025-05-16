import axios from "axios";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { InstagramUserData } from "../../../../domain/contracts/instagram.model";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

const PLATFORM = 'instagram';
const GRAPH_BASE = 'https://graph.instagram.com/v22.0';

export class InstagramConnectCommand {
  model: {
    code: string;
  }

  constructor(request: Partial<InstagramConnectCommand> = {}) {
    Object.assign(this, request);
  }
}

/**
 * Important: Instagram does not reviel the email address of the user
 */
@CommandHandler(InstagramConnectCommand)
export class InstagramConnectHandler implements ICommandHandler<InstagramConnectCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: InstagramConnectCommand): Promise<any> {
    const { model } = command;

    const exchangeToken = await this.fetchShortLivedToken(model.code);
    const { access_token, expires_in } = await this.fetchLongLivedToken(exchangeToken);

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByIdAsync(HttpContext.user[Globals.ClaimTypes.UserId]);

    if (!user) {
      throw new ApplicationException('Prevented: Alduterated Request Received!');
    }

    let existingLinkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(PLATFORM, user.email);
    if (existingLinkedAccount) {
      existingLinkedAccount.username = userData.username;
      existingLinkedAccount.profileImage = userData.profile_picture_url;
      existingLinkedAccount.followersCount = userData.followers_count;
      existingLinkedAccount.followingCount = userData.follows_count;
      existingLinkedAccount.metaData = {
        name: userData.name,
        biography: userData.biography,
        website: userData.website,
        media_count: userData.media_count,
        accountType: userData.type,
      };
      await this.linkedAccountRepository.updateAsync(existingLinkedAccount);
    } else {
      await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: PLATFORM,
        userId: user.id,
        externalId: userData.id,
        username: userData.username,
        profileImage: userData.profile_picture_url,
        followersCount: userData.followers_count,
        followingCount: userData.follows_count,
        metaData: {
          name: userData.name,
          biography: userData.biography,
          website: userData.website,
          media_count: userData.media_count,
          accountType: userData.type,
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

    // save content to db

  }

  private async fetchShortLivedToken(code: string): Promise<string> {
    try {

      const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
        params: {
          client_id: configs.Instagram.clientId,
          redirect_uri: configs.Instagram.redirectUri,
          client_secret: configs.Instagram.clientSecret,
          code,
        },
      });

      const { access_token } = response.data;
      return access_token;

    } catch (error) {
      logger.error('Error fetching short-lived token from Instagram', error);
      throw new Error('Unexpected error during authentication with Instagram');
    }
  }

  private async fetchLongLivedToken(shortLivedAccessToken: string)
    : Promise<{ access_token: string; token_type: string; expires_in: number }> {
    try {
      const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
        params: {
          client_id: configs.facebook.clientId,
          client_secret: configs.facebook.clientSecret,
          grant_type: 'ig_exchange_token',
          fb_exchange_token: shortLivedAccessToken,
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching long-lived token from Instagram', error);
      throw new Error('Unexpected error during authentication with Instagram');
    }
  }

  private async fetchUserData(accessToken: string): Promise<InstagramUserData> {
    try {
      const response = await axios.get<InstagramUserData>(`${GRAPH_BASE}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,username,email,profile_picture_url,biography,website,media_count,followers_count,follows_count',
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching user data from Instagram', error);
      throw new Error('Unexpected error during authentication with Instagram');
    }
  }

}