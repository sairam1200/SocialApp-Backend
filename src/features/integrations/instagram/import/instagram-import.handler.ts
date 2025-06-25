import axios from "axios";
import { Queue } from "bull";
import configs from "../../../../configs";
import { InjectQueue } from "@nestjs/bull";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import logger from "../../../../core/utils/winston.util";
import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserLogin } from "../../../../domain/entities/userLogin.entity";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/irefreshtoken.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";

export class InstagramImportRequestModel {
  @ApiProperty()
  instagramAccessToken: string;
}

export class InstagramImportCommand {

  model: InstagramImportRequestModel;

  constructor(request: Partial<InstagramImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(InstagramImportCommand)
export class InstagramImportCommandHandler implements ICommandHandler<InstagramImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @InjectQueue(_const.BULL_QUEUES.INSTAGRAM_IMPORT)
    private readonly importQueue: Queue
  ) { }

  public async execute(command: InstagramImportCommand): Promise<{ accessToken: string, expiresIn: number }> {

    let expiresIn: number;
    const now = new Date();
    const { instagramAccessToken } = command.model;
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (instagramAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(instagramAccessToken);
      if (!isTokenValid) {
        const userLogin = await this.getUserLoginAsync(userId);
        const isTokenValid = await this.verifyAccessTokenAsync(accessToken);
        if (!isTokenValid) {
          throw new ApplicationException(
            'Your Instagram session has expired or the access token is invalid. Please log in to Instagram again to continue.'
          );
        }

        accessToken = userLogin.tokenValue;
        expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000);
      } else {
        accessToken = instagramAccessToken;
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      const isTokenValid = await this.verifyAccessTokenAsync(accessToken);
      if (!isTokenValid) {
        throw new ApplicationException(
          'Your Instagram session has expired or the access token is invalid. Please log in to Instagram again to continue.'
        );
      }

      accessToken = userLogin.tokenValue;
      expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000);
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.INSTAGRAM, userId);
    if (!account) {
      throw new NotFoundException('No matching Instagram profile was found!');
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

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {

    try {
      const appAccessToken = `${configs.Instagram.clientId}|${configs.Instagram.clientSecret}`;

      const response = await axios.get(`https://graph.facebook.com/v22.0/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: appAccessToken
        },
      });

      const data = response.data.data;
      return data.is_valid;
    } catch (error) {
      logger.error(`An error occurred while processing the Instagram import command: 
          ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });

      return false;
      // throw new ApplicationException("Something went wrong while verifying the Instagram access token. Please try again later.");
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {
    const now = new Date();

    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.INSTAGRAM
    );

    if (!userLogin) {
      throw new ApplicationException(
        'No Instagram account linked to your user profile. Please link your Instagram account to proceed.'
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new ApplicationException(
        'Your Instagram session has expired or the access token is invalid. Please log in to Instagram again to continue.'
      );
    }

    return userLogin;
  }
}