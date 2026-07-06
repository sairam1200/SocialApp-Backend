import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { NotFoundException } from '@nestjs/common';

export class DisableTiktokSyncCommand {
  constructor(request: Partial<DisableTiktokSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(DisableTiktokSyncCommand)
export class DisableTiktokSyncCommandHandler
  implements ICommandHandler<DisableTiktokSyncCommand>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    command: DisableTiktokSyncCommand,
  ): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.TIKTOK,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching TikTok profile was found!');
    }

    account.syncEnabled = false;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[TiktokSync] Sync disabled for user ${userId}`);

    return { syncEnabled: account.syncEnabled };
  }
}
