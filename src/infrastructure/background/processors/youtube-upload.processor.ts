import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { IYoutubeAccountRepository } from '../../../domain/repositories/iyoutubeAccount.repository';
import { IYoutubeVideoRepository } from '../../../domain/repositories/iyoutubeVideo.repository';
import { IUploadJobRepository } from '../../../domain/repositories/iuploadJob.repository';
import { YoutubePublishingService } from '../../services/youtube/youtube-publishing.service';
import BullMQConfig from '../../../core/config/bullmq.config';

interface YoutubeUploadJobData {
  videoId: string;
  accountId: string;
  videoUrl: string;
  thumbnailUrl?: string;
}

@Processor(_const.BULL_QUEUES.YOUTUBE_UPLOAD, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.YOUTUBE_UPLOAD, 3))
export class YoutubeUploadProcessor extends WorkerHost {
  constructor(
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly uploadJobRepo: IUploadJobRepository,
    @Inject(_const.IYOUTUBE_PUBLISHING_SERVICE)
    private readonly publishingService: YoutubePublishingService,
  ) {
    super();
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[YoutubeUploadProcessor] Processing job ${job.id} for video ${job.data.videoId}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[YoutubeUploadProcessor] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[YoutubeUploadProcessor] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<YoutubeUploadJobData>): Promise<void> {
    const { videoId, accountId, videoUrl, thumbnailUrl } = job.data;

    const account = await this.accountRepo.getByIdAsync(accountId);
    if (!account || !account.connected) {
      throw new Error('YouTube account not found or disconnected');
    }

    const video = await this.videoRepo.getByIdAsync(videoId);
    if (!video) {
      throw new Error('Video record not found');
    }

    let uploadJob = await this.uploadJobRepo.getByVideoIdAsync(videoId);
    if (!uploadJob) {
      throw new Error('Upload job not found');
    }

    try {
      video.status = 'uploading';
      await this.videoRepo.updateAsync(video);

      uploadJob.status = 'processing';
      uploadJob.attempts = (uploadJob.attempts || 0) + 1;
      await this.uploadJobRepo.updateAsync(uploadJob);

      const { youtubeVideoId, youtubeUrl } = await this.publishingService.uploadVideo(
        account,
        video,
        videoUrl,
      );

      video.youtubeVideoId = youtubeVideoId;
      video.youtubeUrl = youtubeUrl;

      if (thumbnailUrl) {
        try {
          await this.publishingService.uploadThumbnail(account, youtubeVideoId, thumbnailUrl);
          video.thumbnailUrl = thumbnailUrl;
        } catch (thumbError) {
          logger.warn(`[YoutubeUploadProcessor] Thumbnail upload failed for video ${videoId}, proceeding without thumbnail`);
        }
      }

      if (video.publishAt) {
        video.status = 'scheduled';
      } else {
        video.status = 'published';
        video.publishedAt = new Date();
      }

      await this.videoRepo.updateAsync(video);

      uploadJob.status = 'completed';
      uploadJob.lastError = undefined;
      uploadJob.nextRetryAt = undefined;
      await this.uploadJobRepo.updateAsync(uploadJob);

      logger.info(`[YoutubeUploadProcessor] Video ${videoId} uploaded successfully: ${youtubeUrl}`);
    } catch (error: any) {
      video.status = 'failed';
      await this.videoRepo.updateAsync(video);

      const attemptCount = (uploadJob.attempts || 0) + 1;
      const delays = [60000, 300000, 900000, 1800000, 3600000, 21600000, 86400000];
      const delayIndex = Math.min(attemptCount - 1, delays.length - 1);
      const nextRetry = new Date(Date.now() + delays[delayIndex]);

      uploadJob.status = 'failed';
      uploadJob.attempts = attemptCount;
      uploadJob.lastError = error.message;
      uploadJob.nextRetryAt = attemptCount >= 10 ? undefined : nextRetry;
      await this.uploadJobRepo.updateAsync(uploadJob);

      logger.error(`[YoutubeUploadProcessor] Upload failed for video ${videoId} (attempt ${attemptCount}): ${error.message}`);

      throw error;
    }
  }
}
