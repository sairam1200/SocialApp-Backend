import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { IYoutubeImportService } from '../../../domain/services/youtube/iyoutube-import.services';
import BullMQConfig from '../../../core/config/bullmq.config';

interface YoutubeImportJobData {
  account: any;
  accessToken: string;
}

@Processor(
  _const.BULL_QUEUES.YOUTUBE_IMPORT,
  BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.YOUTUBE_IMPORT, 1),
)
export class YoutubeImportProcessor extends WorkerHost {
  constructor(
    @Inject(_const.IYOUTUBE_IMPORT_SERVICE)
    private readonly youtubeImportService: IYoutubeImportService,
  ) {
    super();
    logger.info(`[YoutubeImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[YoutubeImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[YoutubeImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[YoutubeImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<YoutubeImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;
    logger.info(
      `[YoutubeImport] Starting job ${job.id} for user ${account.userId}`,
    );
    await this.youtubeImportService.importFullAsync(account, accessToken, job);
    logger.info(
      `[YoutubeImport] Finished job ${job.id} for user ${account.userId}`,
    );
  }
}
