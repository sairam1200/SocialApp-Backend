import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { PublishJobRepository } from '../../repositories/publishJob.repository';
import { PublishProviderRegistry } from '../../services/publishing/publish-provider.registry';
import { R2StorageService } from '../../../shared/storage/r2/r2-storage.service';
import { PublishJob } from '../../../domain/entities/publishJob.entity';
import BullMQConfig from '../../../core/config/bullmq.config';
import { PublishExpiredError } from '../../../core/exceptions/publishing.exception';
interface PublishContentJobData {
  publishJobId: string;
}

@Processor(
  _const.BULL_QUEUES.PUBLISH_CONTENT,
  BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.PUBLISH_CONTENT, 1),
)
export class PublishContentProcessor extends WorkerHost {
  constructor(
    @Inject(_const.IPUBLISHJOB_REPOSITORY)
    private readonly publishJobRepo: PublishJobRepository,
    @Inject(_const.IPUBLISH_PROVIDER_REGISTRY)
    private readonly providerRegistry: PublishProviderRegistry,
    @Inject(_const.IR2_STORAGE_SERVICE)
    private readonly r2Storage: R2StorageService,
  ) {
    super();
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(
      `[PublishContentProcessor] Processing job ${job.id} for publish job ${job.data.publishJobId}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[PublishContentProcessor] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    const errMessage = error?.message || String(error);
    const errStack = error?.stack || '';
    logger.error(
      `[PublishContentProcessor] BullMQ job ${job.id} failed ` +
        `(publishJobId=${job.data.publishJobId}): ${errMessage}`,
      errStack ? { stack: errStack } : undefined,
    );
  }

  private async updateProgress(
    publishJob: PublishJob,
    progress: number,
    statusMessage: string,
  ): Promise<void> {
    publishJob.progress = progress;
    publishJob.statusMessage = statusMessage;
    await this.publishJobRepo.updateAsync(publishJob);
  }

  public async process(job: Job<PublishContentJobData>): Promise<void> {
    const { publishJobId } = job.data;
    let publishJob: PublishJob | null = null;

    try {
      publishJob = await this.publishJobRepo.getByIdAsync(publishJobId);
      if (!publishJob) {
        throw new Error(`Publish job not found: ${publishJobId}`);
      }

      if (publishJob.status === 'completed') {
        logger.info(
          `[PublishContentProcessor] Job ${publishJobId} already completed, skipping`,
        );
        return;
      }

      if (publishJob.expiresAt < new Date()) {
        throw new PublishExpiredError();
      }

      const provider = this.providerRegistry.getProvider(publishJob.platform);

      publishJob.status = 'processing';
      publishJob.attempts = (publishJob.attempts || 0) + 1;
      await this.publishJobRepo.updateAsync(publishJob);

      await this.updateProgress(publishJob, 10, 'Validating content...');
      await job.updateProgress(10);

      const content = {
        title: publishJob.metadata?.title || 'Untitled',
        description: publishJob.metadata?.description,
        tags: publishJob.metadata?.tags,
        visibility: publishJob.metadata?.visibility,
        r2Key: publishJob.r2Key,
        fileSize: publishJob.fileSize,
        contentType: publishJob.metadata?.contentType || 'video/mp4',
        publishAt: publishJob.metadata?.publishAt,
        metadata: publishJob.metadata,
      };

      const validation = await provider.validate(content);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
      }

      await this.updateProgress(publishJob, 20, 'Publishing to platform...');
      await job.updateProgress(20);

      const result = await provider.publish(
        publishJob,
        content,
        (progress: number, message: string) => {
          const adjustedProgress = Math.min(
            20 + Math.round(progress * 0.7),
            90,
          );
          this.updateProgress(publishJob!, adjustedProgress, message).catch(
            (err) =>
              logger.warn(
                '[PublishContentProcessor] Failed to update progress',
                err,
              ),
          );
          job
            .updateProgress(adjustedProgress)
            .catch((err) =>
              logger.warn(
                '[PublishContentProcessor] Failed to update BullMQ progress',
                err,
              ),
            );
        },
      );

      await this.updateProgress(publishJob, 95, 'Finalizing...');
      await job.updateProgress(95);

      publishJob.status = 'completed';
      publishJob.progress = 100;
      publishJob.statusMessage = 'Published successfully';
      publishJob.platformContentId = result.platformContentId;
      publishJob.platformContentUrl = result.platformContentUrl;
      publishJob.lastError = undefined;
      publishJob.nextRetryAt = undefined;
      await this.publishJobRepo.updateAsync(publishJob);

      await this.cleanupR2(publishJob.r2Key, publishJobId, job.id!);

      logger.info(
        `[PUBLISH JOB COMPLETED] id=${publishJobId} platform=${publishJob.platform} ` +
          `userId=${publishJob.userId} contentId=${result.platformContentId}`,
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));

      logger.error(
        `[PUBLISH JOB FAILED] publishJobId=${publishJobId} ` +
          `bullmqJobId=${job.id} ` +
          `platform=${publishJob?.platform ?? 'unknown'} ` +
          `userId=${publishJob?.userId ?? 'unknown'} ` +
          `attempt=${publishJob?.attempts ?? 0} ` +
          `errorType=${err.constructor.name} ` +
          `error=${err.message}`,
        err.stack ? { stack: err.stack } : undefined,
      );

      if (publishJob) {
        const provider = this.providerRegistry.getProvider(
          publishJob.platform,
        );
        const normalized = provider.normalizeError(error);

        const attemptCount = (publishJob.attempts || 0) + 1;
        const delays = [
          60000, 300000, 900000, 1800000, 3600000, 21600000, 86400000,
        ];
        const delayIndex = Math.min(attemptCount - 1, delays.length - 1);
        const nextRetry = new Date(Date.now() + delays[delayIndex]);

        publishJob.status = 'failed';
        publishJob.progress = 0;
        publishJob.statusMessage = normalized.message;
        publishJob.attempts = attemptCount;
        publishJob.lastError = normalized.message;
        publishJob.nextRetryAt =
          normalized.retryable && attemptCount < 10 ? nextRetry : undefined;
        await this.publishJobRepo.updateAsync(publishJob);

        if (!normalized.retryable) {
          logger.warn(
            `[PUBLISH JOB PERMANENTLY FAILED] publishJobId=${publishJobId} ` +
              `code=${normalized.code} — will NOT retry`,
          );
          return;
        }
      }

      throw error;
    }
  }

  private async cleanupR2(
    r2Key: string | undefined,
    publishJobId: string,
    jobId: string,
  ): Promise<void> {
    if (!r2Key) return;

    logger.info(`[R2Storage] Cleanup started`, { publishJobId, r2Key, jobId });
    try {
      const exists = await this.r2Storage.fileExists(r2Key);
      if (!exists) {
        logger.info(`[R2Storage] Cleanup skipped (file missing)`, {
          publishJobId,
          r2Key,
          jobId,
        });
        return;
      }
      await this.r2Storage.deleteFile(r2Key);
      logger.info(`[R2Storage] Cleanup successful`, {
        publishJobId,
        r2Key,
        jobId,
      });
    } catch (cleanupError) {
      logger.warn(`[R2Storage] Cleanup failed`, {
        publishJobId,
        r2Key,
        jobId,
        error: cleanupError,
      });
    }
  }
}
