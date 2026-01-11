import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { NotFoundException } from "@nestjs/common";

export class DisableFacebookSyncCommand {
  constructor(request: Partial<DisableFacebookSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(DisableFacebookSyncCommand)
export class DisableFacebookSyncCommandHandler implements ICommandHandler<DisableFacebookSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(command: DisableFacebookSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.FACEBOOK,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching Facebook profile was found!");
    }

    account.syncEnabled = false;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[FacebookSync] Sync disabled for user ${userId}`);

    return { syncEnabled: account.syncEnabled };
  }
}

