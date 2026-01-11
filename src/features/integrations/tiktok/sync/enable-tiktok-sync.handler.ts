import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { TiktokImportEvent } from "../../../../domain/events";
import { deserializeObject } from "../../../../core/utils/serialization.util";

export class EnableTiktokSyncCommand {
  constructor(request: Partial<EnableTiktokSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableTiktokSyncCommand)
export class EnableTiktokSyncCommandHandler implements ICommandHandler<EnableTiktokSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: EnableTiktokSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.TIKTOK,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching TikTok profile was found!");
    }

    account.syncEnabled = true;
    logger.info(`[TiktokSync] Sync enabled for user ${userId}`);

    try {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.TIKTOK,
      );

      if (!userLogin) {
        throw new UnauthorizedException("No TikTok login found. Please reconnect your TikTok account.");
      }

      const tokenValue = deserializeObject<{ access_token: string }>(userLogin.tokenValue);
      this.eventEmitter.emit('tiktok.import', new TiktokImportEvent({ account, accessToken: tokenValue.access_token }));
      logger.info(`[TiktokSync] Import event triggered for user ${userId}`);

      account.allowImport = true;
    } catch (error) {
      logger.error(`[TiktokSync] Error triggering import:`, error);
    }
    await this.linkedAccountRepository.updateAsync(account);

    return { syncEnabled: account.syncEnabled };
  }
}

