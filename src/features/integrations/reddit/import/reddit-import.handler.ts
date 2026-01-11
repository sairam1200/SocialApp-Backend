import axios from "axios";
import configs from "../../../../configs";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { UserLogin } from "../../../../domain/entities";
import logger from "../../../../core/utils/winston.util";
import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { RedditImportEvent } from "../../../../domain/events";

export class RedditImportRequestModel {
  @ApiProperty()
  redditAccessToken: string;
}

export class RedditImportCommand {
  model: RedditImportRequestModel;
  constructor(request: Partial<RedditImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(RedditImportCommand)
export class RedditImportCommandHandler implements ICommandHandler<RedditImportCommand> {


  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: RedditImportCommand): Promise<{ accessToken: string, expiresIn: number }> {
    const now = new Date();
    const { redditAccessToken } = command.model;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    //logger.info(`[RedditImport] Started import for user ${userId}`);

    let accessToken: string;
    let expiresIn: number;

    if (redditAccessToken) {
      //logger.debug(`[RedditImport] Received external Reddit token ${redditAccessToken}`);
      const isValid = await this.verifyAccessTokenAsync(redditAccessToken);

      if (isValid) {
        //logger.info(`[RedditImport] Provided token is valid`);
        accessToken = redditAccessToken;
        expiresIn = 3600;
      } else {
        //logger.warn(`[RedditImport] Provided token is invalid. Falling back to stored token`);
        const userLogin = await this.getUserLoginAsync(userId);
        accessToken = userLogin.tokenValue;

        const storedValid = await this.verifyAccessTokenAsync(accessToken);
        if (!storedValid) {
          throw new ApplicationException('Reddit token expired or invalid. Please re-authenticate.');
        }

        expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000);
      }
    } else {
      //logger.debug(`[RedditImport] No token provided. Using stored token.`);
      const userLogin = await this.getUserLoginAsync(userId);
      accessToken = userLogin.tokenValue;

      const isValid = await this.verifyAccessTokenAsync(accessToken);
      if (!isValid) {
        throw new ApplicationException('Reddit token expired or invalid. Please re-authenticate.');
      }

      expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000);
    }

    //logger.debug(`[RedditImport] Token verification complete. Expires in ${expiresIn} seconds`);

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.REDDIT,
      userId
    );

    if (!account) {
      throw new NotFoundException('No matching Reddit profile was found!');
    }

    if (!account.syncEnabled) {
      account.syncEnabled = true;
      await this.linkedAccountRepository.updateAsync(account);
      logger.info(`[RedditImport] Sync enabled for user ${userId}`);
    }

    try {
      this.eventEmitter.emit('reddit.import', new RedditImportEvent({ account, accessToken }));
      logger.info(`[RedditImport] Import event emitted for user ${userId}`);
    } catch (error) {
      logger.error(`An error occurred while emitting the Reddit import event: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });
      throw new ApplicationException('Failed to initiate Reddit import. Please try again later.');
    }
    return {
      accessToken,
      expiresIn
    };
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      //logger.debug(`[RedditImport] Verifying Reddit token`);

      if (!accessToken || accessToken.trim() === '') {
        //logger.debug(`[RedditImport] Empty or null access token provided`);
        return false;
      }

      const response = await axios.get("https://oauth.reddit.com/api/v1/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
      });

      const isValid = response.status === 200 &&
        !!response.data?.id &&
        !!response.data?.name;

      return isValid;
    } catch (error) {
      // Enhanced error logging with different error types
      const tokenPreview = accessToken?.slice(0, 8) + '...';

      if (error.response) {
        const status = error.response.status;
        const redditError = error.response.data;

        logger.error(`[RedditImport] Reddit API error: ${status}`, {
          tokenPreview,
          status,
          statusText: error.response.statusText,
          redditError: redditError?.error || redditError,
          message: redditError?.message
        });

        if (status === 401) {
          logger.debug(`[RedditImport] Token is unauthorized or expired`);
        } else if (status === 403) {
          logger.debug(`[RedditImport] Token lacks required permissions`);
        } else if (status === 429) {
          logger.warn(`[RedditImport] Rate limit exceeded`);
        }
      } else if (error.request) {
        logger.error(`[RedditImport] Network error during token verification`, {
          tokenPreview,
          message: error.message,
          code: error.code,
          timeout: error.code === 'ECONNABORTED'
        });
      } else {
        logger.error(`[RedditImport] Token verification error: ${error.message}`, {
          tokenPreview,
          errorType: error.constructor.name
        });
      }

      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {
    //logger.debug(`[RedditImport] Fetching stored login for user ${userId}`);

    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.REDDIT
    );

    if (!userLogin) {
      //logger.warn(`[RedditImport] No stored Reddit login found for user ${userId}`);
      throw new ApplicationException(
        'No Reddit account linked to your user profile. Please link your Reddit account to proceed.'
      );
    }

    const now = new Date();
    if (now > userLogin.expiryDateUtc) {
      //logger.warn(`[RedditImport] Stored Reddit token expired for user ${userId}. Expired: ${userLogin.expiryDateUtc}`);
      throw new ApplicationException(
        'Your Reddit session has expired. Please log in again.'
      );
    }

    const timeToExpiry = Math.floor((userLogin.expiryDateUtc.getTime() - now.getTime()) / 1000);
    //logger.debug(`[RedditImport] Found valid stored token. Expires in ${timeToExpiry} seconds`);

    return userLogin;
  }
}