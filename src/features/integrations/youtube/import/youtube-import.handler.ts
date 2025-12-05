import axios from "axios";
import configs from "../../../../configs";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { UserLogin } from "../../../../domain/entities";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Inject, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { deserializeObject, serializeObject } from "../../../../core/utils/serialization.util";
import { YoutubeImportEvent } from "../../../../domain/events";

export class YoutubeImportRequestModel {
  @ApiProperty()
  youtubeAccessToken: string;
}

export class YoutubeImportCommand {

  model: YoutubeImportRequestModel

  constructor(request: Partial<YoutubeImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(YoutubeImportCommand)
export class YoutubeImportCommandHandler implements ICommandHandler<YoutubeImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: YoutubeImportCommand)
    : Promise<{ accessToken: string, expiresIn: number }> {

    let expiresIn: number;
    const { youtubeAccessToken } = command.model;
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (youtubeAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(youtubeAccessToken);
      if (!isTokenValid) {
        const userLogin = await this.getUserLoginAsync(userId);
        const tokenValue = deserializeObject<{ access_token: string, refresh_token: string }>(userLogin.tokenValue);
        const {
          access_token,
          expires_in
        } = await this.refreshTokenAsync(tokenValue.refresh_token);
        if (access_token) {
          userLogin.tokenValue = serializeObject({ access_token, refresh_token: tokenValue.refresh_token, expires_in });
          userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 100 days
          await this.userLoginRepository.updateAsync(userLogin);
        }
        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = youtubeAccessToken;
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      const tokenValue = deserializeObject<{ access_token: string, refresh_token: string, expires_in: number }>(userLogin.tokenValue);
      const isTokenValid = await this.verifyAccessTokenAsync(tokenValue.access_token);
      if (!isTokenValid) {
        const { access_token, expires_in } = await this.refreshTokenAsync(tokenValue.refresh_token);
        userLogin.tokenValue = serializeObject({ access_token, refresh_token: tokenValue.refresh_token });
        userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 100 days
        await this.userLoginRepository.updateAsync(userLogin);

        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = tokenValue.access_token;
        expiresIn = tokenValue.expires_in;
      }
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.YOUTUBE, userId);
    console.log(account);
    if (!account) {
      throw new NotFoundException("No matching Youtube profile was found!");
    }

    try {
      this.eventEmitter.emit('youtube.import', new YoutubeImportEvent({ account, accessToken }));
    } catch (error) {
      logger.error(`An error occurred while emitting the Youtube import event: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });
      throw new ApplicationException('Failed to initiate Youtube import. Please try again later.');
    }

    return {
      accessToken,
      expiresIn
    }
  }

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, expires_in: number }> {

    try {

      const response = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: configs.youtube.clientId,
        client_secret: configs.youtube.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, expires_in } = response.data;
      if (!access_token) {
        throw new ApplicationException('Your Youtube session has expired or the access token is invalid. Please log in to Youtube again to continue.');
      }

      return {
        access_token,
        expires_in,
      };

    } catch (error) {
      logger.error(`An error occurred while processing the Youtube import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });

      throw new UnauthorizedException(
        'Your Youtube session has expired or the access token is invalid. Please log in to Youtube again to continue.'
      );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo`, {
        params: {
          access_token: accessToken,
        },
      });

      // If token is valid, response.data will contain info like expiry, user_id, scopes, etc.
      // If invalid, Google returns an error and axios will throw.

      return true;
    } catch (error) {

      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {

    const now = new Date();
    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.YOUTUBE
    );

    if (!userLogin) {
      throw new UnauthorizedException(
        'No Youtube account linked to your user profile. Please link your Youtube account to proceed.'
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new UnauthorizedException(
        'Your Youtube session has expired or the access token is invalid. Please log in to Youtube again to continue.'
      );
    }
    return userLogin;
  }

}