import axios from "axios";
import configs from "../../../../configs";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { UserLogin } from "../../../../domain/entities";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { Inject, NotFoundException, UnauthorizedException } from "@nestjs/common";
import ApplicationException from "../../../../core/exceptions/application.exception";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IQueueService } from "../../../../domain/services/iqueue.service";

export class ThreadsImportRequestModel {
  @ApiProperty()
  threadsAccessToken: string;
}

export class ThreadsImportCommand {

  model: ThreadsImportRequestModel

  constructor(request: Partial<ThreadsImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(ThreadsImportCommand)
export class ThreadsImportCommandHandler implements ICommandHandler<ThreadsImportCommand> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
  ) { }

  public async execute(command: ThreadsImportCommand)
    : Promise<{ accessToken: string, expiresIn: number }> {

    let expiresIn: number;
    const { threadsAccessToken } = command.model;
    let accessToken: string | undefined;
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    if (threadsAccessToken) {
      const isTokenValid = await this.verifyAccessTokenAsync(threadsAccessToken);
      if (!isTokenValid) {
        const userLogin = await this.getUserLoginAsync(userId);
        accessToken = userLogin.tokenValue;
        expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - Date.now()) / 1000);
      } else {
        accessToken = threadsAccessToken;
      }
    } else {
      const userLogin = await this.getUserLoginAsync(userId);
      accessToken = userLogin.tokenValue;
      expiresIn = Math.floor((userLogin.expiryDateUtc.getTime() - Date.now()) / 1000);
    }

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.THREADS, userId);
    if (!account) {
      throw new NotFoundException("No matching Threads profile was found!");
    }

    if (!account.syncEnabled) {
      account.syncEnabled = true;
      await this.linkedAccountRepository.updateAsync(account);
      logger.info(`[ThreadsImport] Sync enabled for user ${userId}`);
    }

    try {
      /* await this.queueService.enqueueThreadsImport(account, accessToken); */
      logger.info(`[ThreadsImport] Import job enqueued for user ${userId}`);
    } catch (error) {
      logger.error(`An error occurred while enqueueing the Threads import job: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`, { error });
      throw new ApplicationException('Failed to initiate Threads import. Please try again later.');
    }
    return {
      accessToken,
      expiresIn
    }
  }

  private async verifyAccessTokenAsync(accessToken: string): Promise<boolean> {
    try {
      const res = await axios.get('https://graph.threads.net/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return !!res.data?.id;
    } catch (error) {
      logger.error('Threads access token verification failed:', error.response?.data || error.message)
      return false;
    }
  }

  private async getUserLoginAsync(userId: string): Promise<UserLogin> {

    const now = new Date();
    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
      userId,
      _const.PLATFORMS.THREADS
    );

    if (!userLogin) {
      throw new UnauthorizedException(
        'No Threads account linked to your user profile. Please link your Threads account to proceed.'
      );
    }

    if (now > userLogin.expiryDateUtc) {
      throw new UnauthorizedException(
        'Your Threads session has expired or the access token is invalid. Please log in to Threads again to continue.'
      );
    }

    return userLogin;
  }
}
