import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { FacebookImportEvent } from "../../../../domain/events";

export class EnableFacebookSyncCommand {
  constructor(request: Partial<EnableFacebookSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableFacebookSyncCommand)
export class EnableFacebookSyncCommandHandler implements ICommandHandler<EnableFacebookSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: EnableFacebookSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.FACEBOOK,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching Facebook profile was found!");
    }

    account.syncEnabled = true;
    logger.info(`[FacebookSync] Sync enabled for user ${userId}`);

    try {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.FACEBOOK,
      );

      if (!userLogin) {
        throw new UnauthorizedException("No Facebook login found. Please reconnect your Facebook account.");
      }

      const accessToken = userLogin.tokenValue;
      this.eventEmitter.emit('facebook.import', new FacebookImportEvent({ account, accessToken }));
      logger.info(`[FacebookSync] Import event triggered for user ${userId}`);

      account.allowImport = true;
    } catch (error) {
      logger.error(`[FacebookSync] Error triggering import:`, error);
    }
    await this.linkedAccountRepository.updateAsync(account);

    return { syncEnabled: account.syncEnabled };
  }
}

