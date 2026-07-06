import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IQueueService } from '../../../../domain/services/iqueue.service';

export class EnableInstagramSyncCommand {
  constructor(request: Partial<EnableInstagramSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableInstagramSyncCommand)
export class EnableInstagramSyncCommandHandler
  implements ICommandHandler<EnableInstagramSyncCommand>
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
    command: EnableInstagramSyncCommand,
  ): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.INSTAGRAM,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching Instagram profile was found!');
    }

    account.syncEnabled = true;
    logger.info(`[InstagramSync] Sync enabled for user ${userId}`);

    try {
      const userLogin =
        await this.userLoginRepository.getByUserIdAndProviderAsync(
          userId,
          _const.PLATFORMS.INSTAGRAM,
        );

      if (!userLogin) {
        throw new UnauthorizedException(
          'No Instagram login found. Please reconnect your Instagram account.',
        );
      }

      await this.queueService.enqueueInstagramImport(
        account,
        userLogin.tokenValue,
      );
      logger.info(`[InstagramSync] Import job enqueued for user ${userId}`);

      account.allowImport = true;
    } catch (error) {
      logger.error(`[InstagramSync] Error triggering import:`, error);
    }
    await this.linkedAccountRepository.updateAsync(account);

    return { syncEnabled: account.syncEnabled };
  }
}
