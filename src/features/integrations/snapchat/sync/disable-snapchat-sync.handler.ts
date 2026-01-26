import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { NotFoundException } from "@nestjs/common";

export class DisableSnapchatSyncCommand {
  constructor(request: Partial<DisableSnapchatSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(DisableSnapchatSyncCommand)
export class DisableSnapchatSyncCommandHandler implements ICommandHandler<DisableSnapchatSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(command: DisableSnapchatSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.SNAPCHAT,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching Snapchat profile was found!");
    }

    account.syncEnabled = false;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[SnapchatSync] Sync disabled for user ${userId}`);

    return { syncEnabled: account.syncEnabled };
  }
}
