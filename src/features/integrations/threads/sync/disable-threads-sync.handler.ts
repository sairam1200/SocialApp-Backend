import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { NotFoundException } from '@nestjs/common';

export class DisableThreadsSyncCommand {
  constructor(request: Partial<DisableThreadsSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(DisableThreadsSyncCommand)
export class DisableThreadsSyncCommandHandler implements ICommandHandler<DisableThreadsSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    command: DisableThreadsSyncCommand,
  ): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.THREADS,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching Threads profile was found!');
    }

    account.syncEnabled = false;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[ThreadsSync] Sync disabled for user ${userId}`);

    return { syncEnabled: account.syncEnabled };
  }
}
