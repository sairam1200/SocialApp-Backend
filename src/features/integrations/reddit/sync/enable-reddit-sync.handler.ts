import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { NotFoundException } from '@nestjs/common';
import { IQueueService } from '../../../../domain/services/iqueue.service';

export class EnableRedditSyncCommand {
  constructor(request: Partial<EnableRedditSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableRedditSyncCommand)
export class EnableRedditSyncCommandHandler
  implements ICommandHandler<EnableRedditSyncCommand>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
  ) {}

  public async execute(
    command: EnableRedditSyncCommand,
  ): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.REDDIT,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching Reddit profile was found!');
    }

    account.syncEnabled = true;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(
      `[RedditSync] Sync enabled for user ${userId}. Triggering initial import.`,
    );

    const userLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.REDDIT,
      );
    if (userLogin) {
      await this.queueService.enqueueRedditImport(
        account,
        userLogin.tokenValue,
      );
      logger.info(`[RedditSync] Import job enqueued for user ${userId}`);
    } else {
      logger.warn(
        `[RedditSync] UserLogin not found for user ${userId}. Cannot trigger import after sync enable.`,
      );
    }

    return { syncEnabled: account.syncEnabled };
  }
}
