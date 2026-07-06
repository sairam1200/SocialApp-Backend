import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IYoutubeAccountRepository } from '../../../domain/repositories/iyoutubeAccount.repository';
import { IYoutubeVideoRepository } from '../../../domain/repositories/iyoutubeVideo.repository';
import { IUploadJobRepository } from '../../../domain/repositories/iuploadJob.repository';
import { YoutubePublishingService } from '../../services/youtube/youtube-publishing.service';
import { R2StorageService } from '../../../shared/storage/r2/r2-storage.service';
import { UploadJob } from '../../../domain/entities/uploadJob.entity';
import BullMQConfig from '../../../core/config/bullmq.config';

interface YoutubeUploadJobData {
  videoId: string;
  accountId: string;
  r2Key: string;
}

@Processor(
  _const.BULL_QUEUES.YOUTUBE_UPLOAD,
  BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.YOUTUBE_UPLOAD, 1),
)
export class YoutubeUploadProcessor extends WorkerHost {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepo: ILinkedAccountRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly accountRepo: IYoutubeAccountRepository,
    @Inject(_const.IYOUTUBEVIDEO_REPOSITORY)
    private readonly videoRepo: IYoutubeVideoRepository,
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly uploadJobRepo: IUploadJobRepository,
    @Inject(_const.IYOUTUBE_PUBLISHING_SERVICE)
    private readonly publishingService: YoutubePublishingService,
    @Inject(_const.IR2_STORAGE_SERVICE)
    private readonly r2Storage: R2StorageService,
  ) {
    super();
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(
      `[YoutubeUploadProcessor] Processing job ${job.id} for video ${job.data.videoId}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[YoutubeUploadProcessor] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[YoutubeUploadProcessor] Job ${job.id} failed:`, error);
  }

  private async updateProgress(
    uploadJob: UploadJob,
    progress: number,
    statusMessage: string,
  ): Promise<void> {
    uploadJob.progress = progress;
    uploadJob.statusMessage = statusMessage;
    await this.uploadJobRepo.updateAsync(uploadJob);
  }

  public async process(job: Job<YoutubeUploadJobData>): Promise<void> {
    const { videoId, accountId, r2Key } = job.data;

    logger.debug('[YoutubeUploadProcessor] Resolving linked account', {
      videoId,
      accountId,
      r2Key,
    });

    const linkedAccount = await this.linkedAccountRepo.getByIdAsync(accountId);
    if (!linkedAccount) {
      logger.error(
        '[YoutubeUploadProcessor] No YouTube integration record found for user',
        { accountId, found: false },
      );
      throw new Error('YouTube integration account not found');
    }
    if (linkedAccount.platform !== _const.PLATFORMS.YOUTUBE) {
      logger.error(
        '[YoutubeUploadProcessor] Linked account platform mismatch',
        { accountId, expected: 'youtube', actual: linkedAccount.platform },
      );
      throw new Error('YouTube integration account not found');
    }

    const account = await this.accountRepo.getByUserIdAsync(
      linkedAccount.userId,
    );
    if (!account) {
      logger.error(
        '[YoutubeUploadProcessor] No YouTube integration record found for user',
        {
          userId: linkedAccount.userId,
          linkedAccountId: linkedAccount.id,
          found: false,
        },
      );
      throw new Error('YouTube integration account not found');
    }
    if (!account.connected) {
      logger.error(
        '[YoutubeUploadProcessor] YouTube integration exists but disconnected',
        {
          userId: linkedAccount.userId,
          youtubeAccountId: account.id,
          connected: account.connected,
        },
      );
      throw new Error('YouTube account is disconnected');
    }
    if (!account.refreshToken) {
      logger.error(
        '[YoutubeUploadProcessor] YouTube integration exists but refresh token missing',
        { userId: linkedAccount.userId, youtubeAccountId: account.id },
      );
      throw new Error('YouTube account token missing');
    }

    logger.debug('[YoutubeUploadProcessor] Account resolved', {
      linkedAccountId: linkedAccount.id,
      channelId: account.channelId,
      youtubeAccountId: account.id,
    });

    const video = await this.videoRepo.getByIdAsync(videoId);
    if (!video) {
      throw new Error('Video record not found');
    }

    if (video.youtubeVideoId) {
      logger.info(
        `[YoutubeUploadProcessor] Video ${videoId} already uploaded (youtubeVideoId=${video.youtubeVideoId}), skipping`,
      );
      return;
    }

    const uploadJob = await this.uploadJobRepo.getByVideoIdAsync(videoId);
    if (!uploadJob) {
      throw new Error('Upload job not found');
    }

    logger.info(
      `[UPLOAD JOB STARTED] videoId=${videoId} r2Key=${r2Key} fileSize=${uploadJob.fileSize}`,
    );

    try {
      video.status = 'uploading';
      await this.videoRepo.updateAsync(video);

      uploadJob.status = 'processing';
      uploadJob.attempts = (uploadJob.attempts || 0) + 1;
      await this.uploadJobRepo.updateAsync(uploadJob);

      await this.updateProgress(uploadJob, 5, 'Initiating upload...');
      await job.updateProgress(5);

      const { youtubeVideoId, youtubeUrl } =
        await this.publishingService.uploadVideoFromR2(
          account,
          video,
          r2Key,
          uploadJob.fileSize,
          (progress: number, message: string) => {
            this.updateProgress(uploadJob, progress, message).catch((err) =>
              logger.warn(
                '[YoutubeUploadProcessor] Failed to update progress',
                err,
              ),
            );
            job
              .updateProgress(progress)
              .catch((err) =>
                logger.warn(
                  '[YoutubeUploadProcessor] Failed to update BullMQ progress',
                  err,
                ),
              );
          },
        );

      video.youtubeVideoId = youtubeVideoId;
      video.youtubeUrl = youtubeUrl;

      await this.updateProgress(uploadJob, 95, 'Finalizing...');
      await job.updateProgress(95);

      if (video.publishAt) {
        video.status = 'scheduled';
      } else {
        video.status = 'published';
        video.publishedAt = new Date();
      }

      await this.videoRepo.updateAsync(video);

      uploadJob.status = 'completed';
      uploadJob.progress = 100;
      uploadJob.statusMessage = 'Upload complete';
      uploadJob.lastError = undefined;
      uploadJob.nextRetryAt = undefined;
      await this.uploadJobRepo.updateAsync(uploadJob);

      logger.info(
        `[UPLOAD JOB COMPLETED] videoId=${videoId} youtubeVideoId=${youtubeVideoId} youtubeUrl=${youtubeUrl}`,
      );

      // Cleanup R2 only on success — file is now on YouTube
      await this.cleanupR2(r2Key, videoId, job.id!);
    } catch (error: unknown) {
      video.status = 'failed';
      await this.videoRepo.updateAsync(video);

      const attemptCount = (uploadJob.attempts || 0) + 1;
      const delays = [
        60000, 300000, 900000, 1800000, 3600000, 21600000, 86400000,
      ];
      const delayIndex = Math.min(attemptCount - 1, delays.length - 1);
      const nextRetry = new Date(Date.now() + delays[delayIndex]);

      uploadJob.status = 'failed';
      uploadJob.progress = 0;
      uploadJob.statusMessage = 'Upload failed';
      uploadJob.attempts = attemptCount;
      uploadJob.lastError =
        error instanceof Error ? error.message : 'Unknown error';
      uploadJob.nextRetryAt = attemptCount >= 10 ? undefined : nextRetry;
      await this.uploadJobRepo.updateAsync(uploadJob);

      logger.error(
        `[UPLOAD JOB FAILED] videoId=${videoId} attempt=${attemptCount} error=${error instanceof Error ? error.message : String(error)}`,
      );

      throw error;
    }
  }

  private async cleanupR2(
    r2Key: string,
    videoId: string,
    jobId: string,
  ): Promise<void> {
    logger.info(`[R2Storage] Cleanup started`, { videoId, r2Key, jobId });
    try {
      const exists = await this.r2Storage.fileExists(r2Key);
      if (!exists) {
        logger.info(`[R2Storage] Cleanup skipped (file missing)`, {
          videoId,
          r2Key,
          jobId,
        });
        return;
      }
      await this.r2Storage.deleteFile(r2Key);
      logger.info(`[R2Storage] Cleanup successful`, { videoId, r2Key, jobId });
    } catch (cleanupError) {
      logger.warn(`[R2Storage] Cleanup failed`, {
        videoId,
        r2Key,
        jobId,
        error: cleanupError,
      });
    }
  }
}
