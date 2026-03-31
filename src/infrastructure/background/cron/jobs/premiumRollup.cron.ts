import { Injectable, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import _const from '../../../../core/utils/const';
import { IAnalyticsRepository } from '../../../../domain/repositories/ianalytics.repository';
import { IPremiumRollupRepository } from '../../../../domain/repositories/ipremiumRollup.repository';
import logger from '../../../../core/utils/winston.util';

@Injectable()
export class PremiumRollupCron {

  constructor(
    @Inject(_const.IANALYTICS_REPOSITORY)
    private readonly analyticsRepository: IAnalyticsRepository,
    @Inject(_const.IPREMIUMROLLUP_REPOSITORY)
    private readonly premiumRollupRepository: IPremiumRollupRepository,
  ) { }

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyRollup(): Promise<void> {
    try {
      logger.info('PremiumRollupCron: Starting weekly rollup...');

      // 1. Calculate the start of the last 7-day window
      const now = new Date();
      const weekStartDate = new Date(now);
      weekStartDate.setDate(now.getDate() - 7);
      weekStartDate.setHours(0, 0, 0, 0);

      // 2. Fetch all analytics events from the last 7 days
      const allRecentEvents = await this.analyticsRepository.getAllEventsAsync(weekStartDate);

      // 3. Group events by userId
      const grouped: Record<string, { counts: Record<string, number>; total: number }> = {};

      for (const event of allRecentEvents) {
        const uid = event.userId ?? 'anonymous';
        if (!grouped[uid]) {
          grouped[uid] = { counts: {}, total: 0 };
        }
        grouped[uid].total += 1;
        grouped[uid].counts[event.eventName] = (grouped[uid].counts[event.eventName] ?? 0) + 1;
      }

      // 4. Upsert a PremiumRollup row for each userId
      for (const [userId, stats] of Object.entries(grouped)) {
        const topFeatureUsed = Object.entries(stats.counts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        await this.premiumRollupRepository.upsertRollupAsync({
          userId,
          weekStartDate,
          totalInteractions: stats.total,
          topFeatureUsed,
          interactionBreakdown: stats.counts,
        });
      }

      logger.info(`PremiumRollupCron: Rollup complete. Processed ${Object.keys(grouped).length} users.`);
    } catch (error) {
      logger.error('PremiumRollupCron: Error during weekly rollup', error);
    }
  }
}
