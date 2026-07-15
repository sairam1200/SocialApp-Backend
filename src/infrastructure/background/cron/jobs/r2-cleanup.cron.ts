import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { IPublishJobRepository } from '../../../../domain/repositories/ipublishJob.repository';
import { R2StorageService } from '../../../../shared/storage/r2/r2-storage.service';
import { PublishJobRepository } from '../../../repositories/publishJob.repository';

@Injectable()
export class R2CleanupCron {
  constructor(
    @Inject(_const.IUPLOADJOB_REPOSITORY)
    private readonly publishJobRepo: PublishJobRepository,
    @Inject(_const.IR2_STORAGE_SERVICE)
    private readonly r2Storage: R2StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleR2Cleanup(): Promise<void> {
    try {
      const expiredJobs = await this.publishJobRepo.getExpiredJobsAsync();

      if (expiredJobs.length === 0) {
        return;
      }

      logger.info(
        `[R2CleanupCron] Found ${expiredJobs.length} expired publish jobs`,
      );

      let cleanedCount = 0;
      for (const job of expiredJobs) {
        if (!job.r2Key) {
          job.r2CleanedAt = new Date();
          await this.publishJobRepo.updateAsync(job);
          continue;
        }

        try {
          const exists = await this.r2Storage.fileExists(job.r2Key);
          if (exists) {
            await this.r2Storage.deleteFile(job.r2Key);
            logger.info(
              `[R2CleanupCron] Deleted expired R2 object: ${job.r2Key}`,
            );
          }
          job.r2CleanedAt = new Date();
          await this.publishJobRepo.updateAsync(job);
          cleanedCount++;
        } catch (error) {
          logger.warn(
            `[R2CleanupCron] Failed to delete R2 object: ${job.r2Key}`,
            error,
          );
        }
      }

      if (cleanedCount > 0) {
        logger.info(
          `[R2CleanupCron] Cleaned up ${cleanedCount} expired R2 objects`,
        );
      }
    } catch (error) {
      logger.error('[R2CleanupCron] Error during R2 cleanup:', error);
    }
  }
}
