import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import configs from '../../../../configs';
import logger from '../../../../core/utils/winston.util';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { DataSource, In } from 'typeorm';
import { IPlatformDisconnectService } from '../../../../domain/services/iplatform-disconnect.service';
import { IQueueService } from '../../../../domain/services/iqueue.service';
import { IYoutubeWebhookService } from '../../../../domain/services/webhooks/iyoutube-webhook.service';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { IUserLoginRepository } from '../../../../domain/repositories/iuserLogin.repository';
import { YoutubeAccount, YoutubeVideo, YoutubeAnalytic, UploadJob } from '../../../../domain/entities';

export class YoutubeDisconnectCommand {
  constructor(request: Partial<YoutubeDisconnectCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(YoutubeDisconnectCommand)
export class YoutubeDisconnectCommandHandler
  implements ICommandHandler<YoutubeDisconnectCommand> {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(_const.IPLATFORM_DISCONNECT_SERVICE)
    private readonly disconnectService: IPlatformDisconnectService,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    @Inject(_const.IYOUTUBEWEBHOOK_SERVICE)
    private readonly youtubeWebhookService: IYoutubeWebhookService,
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
  ) { }

  public async execute(command: YoutubeDisconnectCommand): Promise<void> {
    const userId = HttpContext.getCurrentUserId;
    const platform = _const.PLATFORMS.YOUTUBE;

    // Step 1: Find LinkedAccount as the source of truth
    const linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(platform, userId);
    if (!linkedAccount) {
      logger.warn(`[YoutubeDisconnect] No LinkedAccount found for user ${userId}`);
      return;
    }

    const channelId: string | undefined = linkedAccount.metaData?.channel?.id;
    logger.info(`[YoutubeDisconnect] Starting disconnect for user ${userId}, channel ${channelId || 'unknown'}`);

    // Step 2: Get token from UserLogin for revocation (fixes the encrypted-token bug)
    const userLogin = await this.userLoginRepository.getByUserIdAndProviderAsync(userId, platform);
    if (userLogin) {
      try {
        const { access_token } = JSON.parse(userLogin.tokenValue);
        if (access_token) {
          this.revokeGoogleToken(access_token).catch(err =>
            logger.error(`[YoutubeDisconnect] Token revocation failed: ${err.message}`)
          );
        }
      } catch {
        logger.warn(`[YoutubeDisconnect] Could not parse tokenValue for revocation`);
      }
    }

    // Step 3: Non-transactional cleanup (best-effort, fire-and-forget)
    if (channelId && configs.youtube.webhookUrl) {
      this.youtubeWebhookService.unsubscribeAsync(channelId, configs.youtube.webhookUrl).catch(err =>
        logger.error(`[YoutubeDisconnect] Webhook unsubscribe failed: ${err.message}`)
      );
    }
    this.queueService.cancelYoutubeImport(userId).catch(err =>
      logger.error(`[YoutubeDisconnect] Cancel import job failed: ${err.message}`)
    );

    // Step 4: Collect video IDs for queue cancellation (before transaction)
    let videoIds: string[] = [];
    const youtubeAccount = await this.dataSource.getRepository(YoutubeAccount).findOne({ where: { userId } });
    if (youtubeAccount) {
      const videos = await this.dataSource.getRepository(YoutubeVideo).find({ where: { accountId: youtubeAccount.id } });
      videoIds = videos.map(v => v.id);
    }

    // 4a. Cancel per-video upload BullMQ jobs (non-DB, best-effort)
    if (videoIds.length > 0) {
      this.queueService.cancelYoutubeUpload(videoIds).catch(err =>
        logger.error(`[YoutubeDisconnect] Cancel upload jobs failed: ${err.message}`)
      );
    }

    // Step 5: Transactional cleanup — all DB operations in one atomic unit
    await this.dataSource.transaction(async (entityManager) => {
      // 5a. Find YoutubeAccount (secondary lookup for video cascade, inside transaction for consistency)
      const acct = youtubeAccount
        ? await entityManager.getRepository(YoutubeAccount).findOne({ where: { id: youtubeAccount.id } })
        : null;

      if (acct) {
        if (videoIds.length > 0) {
          await Promise.all([
            entityManager.getRepository(YoutubeAnalytic).delete({ videoId: In(videoIds) }),
            entityManager.getRepository(UploadJob).delete({ videoId: In(videoIds) }),
            entityManager.getRepository(YoutubeVideo).delete({ accountId: acct.id }),
          ]);
        }

        await entityManager.getRepository(YoutubeAccount).delete(acct.id);
      }

      // 5b. Generic platform disconnect (LinkedAccount, UserContent, UserLogin)
      await this.disconnectService.disconnectPlatformAsync(userId, platform, entityManager);
    });

    logger.info(`[YoutubeDisconnect] Full disconnect complete for user ${userId}`);
  }

  private async revokeGoogleToken(accessToken: string): Promise<void> {
    const https = require('https');
    const url = `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`;
    await new Promise<void>((resolve, reject) => {
      https.get(url, (res: any) => {
        res.resume();
        resolve();
      }).on('error', reject);
    });
  }
}