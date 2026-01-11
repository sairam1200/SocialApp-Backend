import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { LinkedInImportEvent } from "../../../../domain/events";

export class EnableLinkedInSyncCommand {
  constructor(request: Partial<EnableLinkedInSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableLinkedInSyncCommand)
export class EnableLinkedInSyncCommandHandler implements ICommandHandler<EnableLinkedInSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: EnableLinkedInSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.LINKEDIN,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching LinkedIn profile was found!");
    }

    account.syncEnabled = true;
    logger.info(`[LinkedInSync] Sync enabled for user ${userId}`);

    try {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.LINKEDIN,
      );

      if (!userLogin) {
        throw new UnauthorizedException("No LinkedIn login found. Please reconnect your LinkedIn account.");
      }

      this.eventEmitter.emit('linkedin.import', new LinkedInImportEvent({ account, accessToken: userLogin.tokenValue }));
      logger.info(`[LinkedInSync] Import event triggered for user ${userId}`);

      account.allowImport = true;
    } catch (error) {
      logger.error(`[LinkedInSync] Error triggering import:`, error);
    }
    await this.linkedAccountRepository.updateAsync(account);

    return { syncEnabled: account.syncEnabled };
  }
}

