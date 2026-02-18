import { Inject } from "@nestjs/common";
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { NotificationStatus, NotificationType } from "../../../domain/enums";
import { INotificationService } from "../../../domain/services/inotification.service";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import BullMQConfig from "../../../core/config/bullmq.config";


interface ThreadsImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.THREADS_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.THREADS_IMPORT, 5))
export class ThreadsImportProcessor extends WorkerHost {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
  ) {
    super();
    logger.info(`[ThreadsImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[ThreadsImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[ThreadsImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[ThreadsImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<ThreadsImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.THREADS,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[ThreadsImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[ThreadsImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[ThreadsImport] Starting import for user ${account.userId}`);
    
    // Threads API not yet available, placeholder implementation
    // When Meta releases Threads API, implement actual import logic here
    logger.warn(`[ThreadsImport] Threads API is not yet available. Structure ready for future implementation.`);
    
    // Create a basic notification
    const notification = await this.notificationService.notifyAsync(
      account.userId,
      NotificationType.Import,
      "Threads import completed (API not yet available - structure ready for future implementation)",
      "Threads import completed (API not yet available - structure ready for future implementation)",
      true,
      {
        platform: _const.PLATFORMS.THREADS,
        status: NotificationStatus.Completed,
        reports: [],
      },
    );

    logger.info(`[ThreadsImport] Import completed for user ${account.userId}`);
  }
}
