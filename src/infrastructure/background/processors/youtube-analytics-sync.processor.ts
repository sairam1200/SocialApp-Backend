import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { IYoutubeAccountRepository } from '../../../domain/repositories/iyoutubeAccount.repository';
import { YoutubeAnalyticsService } from '../../services/youtube/youtube-analytics.service';
import BullMQConfig from '../../../core/config/bullmq.config';

interface YoutubeAnalyticsSyncJobData {
  accountId: string;
}

@Processor(_const.BULL_QUEUES.YOUTUBE_ANALYTICS_SYNC, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.YOUTUBE_ANALYTICS_SYNC, 2))
export class YoutubeAnalyticsSyncProcessor extends WorkerHost {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBE_ANALYTICS_SERVICE)
    private readonly analyticsService: YoutubeAnalyticsService,
  ) {
    super();
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[YoutubeAnalyticsSync] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[YoutubeAnalyticsSync] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[YoutubeAnalyticsSync] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<YoutubeAnalyticsSyncJobData>): Promise<{ syncedVideos: number }> {
    const { accountId } = job.data;

    const account = await this.accountRepo.getByIdAsync(accountId);
    if (!account) {
      throw new Error('YouTube account not found');
    }

    logger.info(`[YoutubeAnalyticsSync] Syncing analytics for account ${accountId}`);
    const synced = await this.analyticsService.syncVideoAnalytics(account);
    logger.info(`[YoutubeAnalyticsSync] Synced ${synced} videos for account ${accountId}`);

    return { syncedVideos: synced };
  }
}
