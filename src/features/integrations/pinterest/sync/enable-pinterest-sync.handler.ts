import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { NotFoundException } from "@nestjs/common";
import { PinterestImportEvent } from "../../../../domain/events";
import { deserializeObject } from "../../../../core/utils/serialization.util";

export class EnablePinterestSyncCommand {
  constructor(request: Partial<EnablePinterestSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnablePinterestSyncCommand)
export class EnablePinterestSyncCommandHandler implements ICommandHandler<EnablePinterestSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: EnablePinterestSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.PINTEREST,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching Pinterest profile was found!");
    }

    account.syncEnabled = true;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[PinterestSync] Sync enabled for user ${userId}. Triggering initial import.`);

    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.PINTEREST);
    if (userLogin) {
      const tokenValue = deserializeObject<{ access_token: string }>(userLogin.tokenValue);
      this.eventEmitter.emit('pinterest.import', new PinterestImportEvent({ account, accessToken: tokenValue.access_token }));
    } else {
      logger.warn(`[PinterestSync] UserLogin not found for user ${userId}. Cannot trigger import after sync enable.`);
    }

    return { syncEnabled: account.syncEnabled };
  }
}

