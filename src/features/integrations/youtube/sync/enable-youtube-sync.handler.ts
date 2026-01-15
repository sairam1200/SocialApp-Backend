import { Inject } from "@nestjs/common";
import configs from "../../../../configs";
import _const from "../../../../core/utils/const";
import logger from "../../../../core/utils/winston.util";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { deserializeObject } from "../../../../core/utils/serialization.util";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { IUserLoginRepository } from "../../../../domain/repositories/iuserLogin.repository";
import { ILinkedAccountRepository } from "../../../../domain/repositories/ilinkedAccount.repository";
import { IYoutubeWebhookService } from "../../../../domain/services/webhooks/iyoutube-webhook.service";
import { IQueueService } from "../../../../domain/services/iqueue.service";

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
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
    @Inject(_const.IYOUTUBEWEBHOOK_SERVICE)
    private readonly youtubeWebhookService: IYoutubeWebhookService,
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
      await this.queueService.enqueueYoutubeImport(account, tokenValue.access_token);
      logger.info(`[YoutubeSync] Import job enqueued for user ${userId}`);

      account.allowImport = true;
    } catch (error) {
      logger.error(`[YoutubeSync] Error triggering import:`, error);
    }
    await this.linkedAccountRepository.updateAsync(account);

    return { syncEnabled: account.syncEnabled };
  }
}

