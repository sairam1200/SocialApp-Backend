import axios from "axios";
import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { LinkedAccount } from "../../../../domain/entities/linkedAccount.entity";
import { SpotifyUserData } from "../../../../domain/contracts/spotify.model";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

const PLATFORM = 'spotify';
const BASE_URL = 'https://api.spotify.com/v1';

export class SpotifyConnectCommand {
  model: {
    code: string;
  }

  constructor(request: Partial<SpotifyConnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(SpotifyConnectHandler)
export class SpotifyConnectHandler implements ICommandHandler<SpotifyConnectCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: SpotifyConnectCommand): Promise<any> {
    const { model } = command;

    const { access_token, refresh_token, expires_in } = await this.fetchToken(model.code);

    const userData = await this.fetchUserData(access_token);
    const user = await this.userRepository.getUserByEmailAsync(userData.data.email);

    if (!user || user.id !== HttpContext.user[Globals.ClaimTypes.UserId]) {
      throw new ApplicationException('Prevented: Alduterated Request Received!');
    }

    let existingLinkedAccount = await this.linkedAccountRepository.getByPlatformAndEmailAsync(PLATFORM, user.email);
    if (existingLinkedAccount) {
      existingLinkedAccount.username = userData.data.display_name;
      existingLinkedAccount.profileImage = userData.data.images[0]?.url;
      existingLinkedAccount.followersCount = userData.data.followers.total;
      existingLinkedAccount.followingCount = userData.userfollowing;
      existingLinkedAccount.metaData = {
        name: userData.data.display_name,
        country: userData.data.country,
        email: userData.data.email,
        external_url: userData.data.external_urls.spotify,
        product: userData.data.product,
        type: userData.data.type,
      };
      await this.linkedAccountRepository.updateAsync(existingLinkedAccount);
    } else {
      await this.linkedAccountRepository.createAsync(new LinkedAccount({
        platform: PLATFORM,
        userId: user.id,
        email: userData.data.email,
        externalId: userData.data.id,
        username: userData.data.display_name,
        profileImage: userData.data.images[0]?.url,
        followersCount: userData.data.followers.total,
        followingCount: userData.userfollowing,
        metaData: {
          name: userData.data.display_name,
          country: userData.data.country,
          email: userData.data.email,
          external_url: userData.data.external_urls.spotify,
          product: userData.data.product,
          type: userData.data.type,
        }
      }));
    }

    let existingAccountLogin = await this.userLoginRepository.getByUserIdAndProvider(user.id, PLATFORM);
    if (existingAccountLogin) {
      existingAccountLogin.tokenValue = refresh_token;
      existingAccountLogin.addedDateUtc = new Date();
      existingAccountLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      await this.userLoginRepository.updateAsync(existingAccountLogin);
    } else {
      existingAccountLogin = await this.userLoginRepository.createAysnc(
        PLATFORM,
        user.id,
        "",
        "",
        "",
        refresh_token,
        new Date(Date.now() + 100 * 24 * 60 * 60 * 1000)
      );
    }

    // save content to db

  }

  private async fetchToken(code: string)
    : Promise<{ access_token: string; token_type: string; expires_in: number; refresh_token: string; }> {
    try {
      const response = await axios.get(`https://accounts.spotify.com/api/token`, {
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
      logger.error('Error fetching token from Spotify', error);
      throw new Error('Unexpected error during authentication with Spotify');
    }
  }

  private async fetchUserData(accessToken: string): Promise<{ data: SpotifyUserData, userfollowing: number }> {
    try {
      const response = await axios.get<SpotifyUserData>(`${BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const userfollowing = await axios.get(`${BASE_URL}/me/following?type=artist`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return {
        data: response.data,
        userfollowing: userfollowing.data.artists.items?.length,
      };
    } catch (error) {
      logger.error('Error fetching user data from Spotify', error);
      throw new Error('Unexpected error during authentication with Spotify');
    }
  }



}