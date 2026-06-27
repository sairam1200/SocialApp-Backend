import { Injectable, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import _const from '../../../../core/utils/const';
import { IYoutubeAnalyticsService } from '../../../../domain/services/iyoutubeAnalytics.service';
import logger from '../../../../core/utils/winston.util';

@Injectable()
export class YoutubeAnalyticsCron {
  constructor(
    @Inject(_const.IYOUTUBEANALYTICS_SERVICE)
    private readonly youtubeAnalyticsService: IYoutubeAnalyticsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailySync(): Promise<void> {
    logger.info('[YoutubeAnalyticsCron] Starting scheduled YouTube Analytics daily sync job');
    try {
      await this.youtubeAnalyticsService.syncAllAccountsAnalyticsAsync();
      logger.info('[YoutubeAnalyticsCron] Scheduled YouTube Analytics daily sync job completed successfully');
    } catch (error) {
      logger.error('[YoutubeAnalyticsCron] Error occurred during scheduled YouTube Analytics sync:', error);
    }
  }
}
