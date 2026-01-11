import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { NotFoundException } from "@nestjs/common";
import { SpotifyImportEvent } from "../../../../domain/events";
import { deserializeObject } from "../../../../core/utils/serialization.util";

export class EnableSpotifySyncCommand {
  constructor(request: Partial<EnableSpotifySyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableSpotifySyncCommand)
export class EnableSpotifySyncCommandHandler implements ICommandHandler<EnableSpotifySyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: EnableSpotifySyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.SPOTIFY,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching Spotify profile was found!");
    }

    account.syncEnabled = true;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[SpotifySync] Sync enabled for user ${userId}. Triggering initial import.`);

    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, _const.PLATFORMS.SPOTIFY);
    if (userLogin) {
      const tokenValue = deserializeObject<{ access_token: string }>(userLogin.tokenValue);
      this.eventEmitter.emit('spotify.import', new SpotifyImportEvent({ account, accessToken: tokenValue.access_token }));
    } else {
      logger.warn(`[SpotifySync] UserLogin not found for user ${userId}. Cannot trigger import after sync enable.`);
    }

    return { syncEnabled: account.syncEnabled };
  }
}

