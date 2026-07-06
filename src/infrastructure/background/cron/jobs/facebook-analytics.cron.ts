import { Injectable, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import _const from '../../../../core/utils/const';
import { IFacebookAnalyticsService } from '../../../../domain/services/ifacebookAnalytics.service';
import logger from '../../../../core/utils/winston.util';

@Injectable()
export class FacebookAnalyticsCron {
  constructor(
    @Inject(_const.IFACEBOOKANALYTICS_SERVICE)
    private readonly facebookAnalyticsService: IFacebookAnalyticsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySync(): Promise<void> {
    logger.info(
      '[FacebookAnalyticsCron] Starting scheduled Facebook Analytics daily sync job',
    );
    try {
      await this.facebookAnalyticsService.syncAllAccountsAnalyticsAsync();
      logger.info(
        '[FacebookAnalyticsCron] Scheduled Facebook Analytics daily sync job completed successfully',
      );
    } catch (error) {
      logger.error(
        '[FacebookAnalyticsCron] Error occurred during scheduled Facebook Analytics sync:',
        error,
      );
    }
  }
}
