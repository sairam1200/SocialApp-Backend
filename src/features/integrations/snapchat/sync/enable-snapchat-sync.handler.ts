import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { NotFoundException } from '@nestjs/common';
import { deserializeObject } from '../../../../core/utils/serialization.util';
import { IQueueService } from '../../../../domain/services/iqueue.service';

export class EnableSnapchatSyncCommand {
  constructor(request: Partial<EnableSnapchatSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableSnapchatSyncCommand)
export class EnableSnapchatSyncCommandHandler
  implements ICommandHandler<EnableSnapchatSyncCommand>
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
    command: EnableSnapchatSyncCommand,
  ): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.SNAPCHAT,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching Snapchat profile was found!');
    }

    account.syncEnabled = true;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(
      `[SnapchatSync] Sync enabled for user ${userId}. Triggering initial import.`,
    );

    const userLogin =
      await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.SNAPCHAT,
      );
    if (userLogin) {
      const tokenValue = deserializeObject<{ access_token: string }>(
        userLogin.tokenValue,
      );
      await this.queueService.enqueueSnapchatImport(
        account,
        tokenValue.access_token || userLogin.tokenValue,
      );
      logger.info(`[SnapchatSync] Import job enqueued for user ${userId}`);
    } else {
      logger.warn(
        `[SnapchatSync] UserLogin not found for user ${userId}. Cannot trigger import after sync enable.`,
      );
    }

    return { syncEnabled: account.syncEnabled };
  }
}
