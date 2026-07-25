import { Inject } from '@nestjs/common';
import configs from '../../../../configs';
import _const from '../../../../core/utils/const';
import { NotFoundException } from '@nestjs/common';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IYoutubeWebhookService } from '../../../../domain/services/webhooks/iyoutube-webhook.service';

export class DisableYoutubeSyncCommand {
  constructor(request: Partial<DisableYoutubeSyncCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(DisableYoutubeSyncCommand)
export class DisableYoutubeSyncCommandHandler implements ICommandHandler<DisableYoutubeSyncCommand> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IYOUTUBEWEBHOOK_SERVICE)
    private readonly youtubeWebhookService: IYoutubeWebhookService,
  ) {}

  public async execute(
    command: DisableYoutubeSyncCommand,
  ): Promise<{ syncEnabled: boolean }> {
    const userId = HttpContext.getCurrentUserId;

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.YOUTUBE,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching Youtube profile was found!');
    }

    const channelId = account.metaData?.channel?.id;
    if (channelId && configs.youtube.webhookUrl) {
      try {
        await this.youtubeWebhookService.unsubscribeAsync(
          channelId,
          configs.youtube.webhookUrl,
        );
        logger.info(
          `[YoutubeSync] Webhook unsubscription successful for channel ${channelId}`,
        );
      } catch (error) {
        logger.error(`[YoutubeSync] Error unsubscribing from webhook:`, error);
      }
    }

    account.syncEnabled = false;
    await this.linkedAccountRepository.updateAsync(account);

    logger.info(`[YoutubeSync] Sync disabled for user ${userId}`);

    return { syncEnabled: account.syncEnabled };
  }
}
