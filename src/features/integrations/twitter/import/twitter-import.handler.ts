import axios from "axios";
import { Queue } from "bull";
import configs from "../../../../configs";
import { InjectQueue } from "@nestjs/bull";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { Inject, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserLogin } from "../../../../domain/entities/userLogin.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

export class TwitterImportRequestModel {
  @ApiProperty()
  twitterAccessToken: string;
}

export class TwitterImportCommand {

  model: TwitterImportRequestModel;

  constructor(request: Partial<TwitterImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TwitterImportCommand)
export class TwitterImportCommandHandler implements ICommandHandler<TwitterImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.TWITTER_IMPORT)
    private readonly importQueue: Queue
  ) { }

  public async execute(command: TwitterImportCommand)
    : Promise<{ accessToken: string, expiresIn: number }> {

    let expiresIn: number;
    const { twitterAccessToken: twtterAccessToken } = command.model;
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (twtterAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(twtterAccessToken);
      if (!isTokenValid) {
        const userLogin = await this.getUserLoginAsync(userId);
        const {
          access_token,
          expires_in,
          refresh_token
        } = await this.refreshTokenAsync(userLogin.tokenValue);

        if (refresh_token) {
          userLogin.tokenValue = refresh_token;
          userLogin.expiryDateUtc = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 100 days
          this.userLoginRepository.updateAsync(userLogin);
        }

        accessToken = access_token;
        expiresIn = expires_in;
      } else {
        accessToken = twtterAccessToken;
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      const { access_token, expires_in } = await this.refreshTokenAsync(userLogin.tokenValue);

      accessToken = access_token;
      expiresIn = expires_in;
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.TWITTER, userId);
    if (!account) {
      throw new NotFoundException("No matching Twitter profile was found!");
    }

    this.importQueue.add({ account, accessToken }, {
      attempts: 3,
      backoff: 5000
    });

    return {
      accessToken,
      expiresIn
    }
  }

  private async refreshTokenAsync(refreshToken: string)
    : Promise<{ access_token: string, expires_in: number, refresh_token: string }> {

    try {

      const response = await axios.post('https://api.twitter.com/2/oauth2/token', new URLSearchParams({
        client_id: configs.youtube.clientId,
        client_secret: configs.youtube.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, expires_in, refresh_token } = response.data;

      return {
        access_token,
        expires_in,
        refresh_token,
      };

    } catch (error) {
      logger.error(`An error occurred while processing the Twitter import command: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });

      throw new UnauthorizedException(
        'No Twitter account linked to your user profile. Please re-link your Twitter account to proceed.'
      );
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const res = await axios.get('https://api.twitter.com/2/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // If user data exists, token is valid
      return !!res.data?.data?.id;
    } catch (error) {
      console.error('Twitter access token verification failed:', error.response?.data || error.message);
      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {

    const now = new Date();
    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.TWITTER
    );

    if (!userLogin) {
      throw new UnauthorizedException(
        'No Twitter account linked to your user profile. Please link your Twitter account to proceed.'
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new UnauthorizedException(
        'Your Twitter session has expired or the access token is invalid. Please log in to Twitter again to continue.'
      );
    }

    return userLogin;
  }
}