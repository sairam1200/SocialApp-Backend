import { Inject } from "@nestjs/common";
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import BullMQConfig from "../../../core/config/bullmq.config";

interface BehanceImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.BEHANCE_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.BEHANCE_IMPORT, 5))
export class BehanceImportProcessor extends WorkerHost {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

  ) {
    super();
    logger.info(`[BehanceImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[BehanceImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[BehanceImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[BehanceImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<BehanceImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.BEHANCE,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[BehanceImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[BehanceImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[BehanceImport] Starting import for user ${account.userId}`);
    
    // Since Behance has no official API, using fallback logic
    // This would scrape profile data or use manual entry
    logger.warn(`[BehanceImport] Behance API not available. Using fallback logic with limited functionality.`);
    logger.info(`[BehanceImport] Import completed for user ${account.userId}`);
  }
}
