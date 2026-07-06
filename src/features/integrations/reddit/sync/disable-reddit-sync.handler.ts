import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { NotFoundException } from '@nestjs/common';

export class DisableRedditSyncCommand {
  constructor(request: Partial<DisableRedditSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(DisableRedditSyncCommand)
export class DisableRedditSyncCommandHandler
  implements ICommandHandler<DisableRedditSyncCommand>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    command: DisableRedditSyncCommand,
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

    account.syncEnabled = false;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[RedditSync] Sync disabled for user ${userId}`);

    return { syncEnabled: account.syncEnabled };
  }
}
