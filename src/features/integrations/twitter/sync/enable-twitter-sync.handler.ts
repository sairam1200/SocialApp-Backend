import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { TwitterImportEvent } from "../../../../domain/events";
import { deserializeObject } from "../../../../core/utils/serialization.util";

export class EnableTwitterSyncCommand {
  constructor(request: Partial<EnableTwitterSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableTwitterSyncCommand)
export class EnableTwitterSyncCommandHandler implements ICommandHandler<EnableTwitterSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: EnableTwitterSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.TWITTER,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching Twitter profile was found!");
    }

    account.syncEnabled = true;
    logger.info(`[TwitterSync] Sync enabled for user ${userId}`);

    try {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.TWITTER,
      );

      if (!userLogin) {
        throw new UnauthorizedException("No Twitter login found. Please reconnect your Twitter account.");
      }

      const tokenValue = deserializeObject<{ access_token: string }>(userLogin.tokenValue);
      this.eventEmitter.emit('twitter.import', new TwitterImportEvent({ account, accessToken: tokenValue.access_token }));
      logger.info(`[TwitterSync] Import event triggered for user ${userId}`);

      account.allowImport = true;
    } catch (error) {
      logger.error(`[TwitterSync] Error triggering import:`, error);
    }
    await this.linkedAccountRepository.updateAsync(account);

    return { syncEnabled: account.syncEnabled };
  }
}

