import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { EventEmitter2 } from "@nestjs/event-emitter";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { YoutubeWebhookService } from "../../../../infrastructure/services/youtube-webhook.service";
import { YoutubeImportEvent } from "../../../../domain/events";
import { deserializeObject } from "../../../../core/utils/serialization.util";

export class EnableYoutubeSyncCommand {
  constructor(request: Partial<EnableYoutubeSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(EnableYoutubeSyncCommand)
export class EnableYoutubeSyncCommandHandler implements ICommandHandler<EnableYoutubeSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly youtubeWebhookService: YoutubeWebhookService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  public async execute(command: EnableYoutubeSyncCommand): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.YOUTUBE,
      userId,
    );

    if (!account) {
      throw new NotFoundException("No matching Youtube profile was found!");
    }

    const channelId = account.metaData?.channel?.id;
    if (!channelId) {
      throw new NotFoundException("YouTube channel ID not found. Please reconnect your YouTube account.");
    }

    if (!configs.youtube.webhookUrl) {
      throw new NotFoundException("YouTube webhook URL not configured.");
    }

    try {
      await this.youtubeWebhookService.subscribeAsync(channelId, configs.youtube.webhookUrl);
      logger.info(`[YoutubeSync] Webhook subscription successful for channel ${channelId}`);
    } catch (error) {
      logger.error(`[YoutubeSync] Error subscribing to webhook:`, error);
      throw error;
    }

    account.syncEnabled = true;
    logger.info(`[YoutubeSync] Sync enabled for user ${userId}`);

    try {
      const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(
        userId,
        _const.PLATFORMS.YOUTUBE,
      );

      if (!userLogin) {
        throw new UnauthorizedException("No YouTube login found. Please reconnect your YouTube account.");
      }

      const tokenValue = deserializeObject<{ access_token: string }>(userLogin.tokenValue);
      this.eventEmitter.emit('youtube.import', new YoutubeImportEvent({ account, accessToken: tokenValue.access_token }));
      logger.info(`[YoutubeSync] Import event triggered for user ${userId}`);

      account.allowImport = true;
    } catch (error) {
      logger.error(`[YoutubeSync] Error triggering import:`, error);
    }
    await this.linkedAccountRepository.updateAsync(account);

    return { syncEnabled: account.syncEnabled };
  }
}

