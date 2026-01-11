import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { NotFoundException } from "@nestjs/common";

export class DisableLinkedInSyncCommand {
  constructor(request: Partial<DisableLinkedInSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(DisableLinkedInSyncCommand)
export class DisableLinkedInSyncCommandHandler implements ICommandHandler<DisableLinkedInSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(command: DisableLinkedInSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.LINKEDIN,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching LinkedIn profile was found!");
    }

    account.syncEnabled = false;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[LinkedInSync] Sync disabled for user ${userId}`);

    return { syncEnabled: account.syncEnabled };
  }
}

