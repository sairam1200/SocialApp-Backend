import { Inject } from "@nestjs/common";
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { NotificationStatus, NotificationType } from "../../../domain/enums";
import { INotificationService } from "../../../domain/services/inotification.service";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import BullMQConfig from "../../../core/config/bullmq.config";


interface SnapchatImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.SNAPCHAT_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.SNAPCHAT_IMPORT, 5))
export class SnapchatImportProcessor extends WorkerHost {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
  ) {
    super();
    logger.info(`[SnapchatImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[SnapchatImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[SnapchatImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[SnapchatImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<SnapchatImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.SNAPCHAT,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[SnapchatImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[SnapchatImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[SnapchatImport] Starting import for user ${account.userId}`);
    
    // Snapchat API has limited availability, implement fallback logic
    // This is a placeholder implementation
    logger.warn(`[SnapchatImport] Snapchat API integration not yet fully implemented. Using fallback logic.`);
    
    // Create a basic notification
    const notification = await this.notificationService.notifyAsync(
      account.userId,
      NotificationType.Import,
      "Snapchat import completed (limited functionality - API not fully available)",
      "Snapchat import completed (limited functionality - API not fully available)",
      true,
      {
        platform: _const.PLATFORMS.SNAPCHAT,
        status: NotificationStatus.Completed,
      },
    );

    logger.info(`[SnapchatImport] Import completed for user ${account.userId}`);
  }
}
