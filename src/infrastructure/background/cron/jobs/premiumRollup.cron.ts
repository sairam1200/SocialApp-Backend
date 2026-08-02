import { Injectable, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import _const from '../../../../core/utils/const';
import { IAnalyticsRepository } from '../../../../domain/repositories/ianalytics.repository';
import { IPremiumRollupRepository } from '../../../../domain/repositories/ipremiumRollup.repository';
import { PremiumRollup } from '../../../../domain/entities/premiumRollup.entity';
import logger from '../../../../core/utils/winston.util';

@Injectable()
export class PremiumRollupCron {
  constructor(
    @Inject(_const.IANALYTICS_REPOSITORY)
    private readonly analyticsRepository: IAnalyticsRepository,
    @Inject(_const.IPREMIUMROLLUP_REPOSITORY)
    private readonly premiumRollupRepository: IPremiumRollupRepository,
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyRollup(): Promise<void> {
    try {
      logger.info('PremiumRollupCron: Starting weekly rollup...');

      // 1. Calculate the start of the last 7-day window
      const now = new Date();
      const weekStartDate = new Date(now);
      weekStartDate.setDate(now.getDate() - 7);
      weekStartDate.setHours(0, 0, 0, 0);

      // 2. Fetch pre-aggregated event counts via SQL GROUP BY
      //    Returns one row per (userId, eventName) instead of one row per event.
      const aggregatedRows =
        await this.analyticsRepository.getAggregatedEventsAsync(weekStartDate);

      // 3. Group the already-aggregated rows by userId in JS.
      //    The result set is orders of magnitude smaller than raw events.
      const grouped: Record<
        string,
        { counts: Record<string, number>; total: number }
      > = {};

      for (const row of aggregatedRows) {
        if (!grouped[row.userId]) {
          grouped[row.userId] = { counts: {}, total: 0 };
        }
        grouped[row.userId].counts[row.eventName] = row.count;
        grouped[row.userId].total += row.count;
      }

      // 4. Build the rollup objects
      const rollups: Partial<PremiumRollup>[] = Object.entries(grouped).map(
        ([userId, stats]) => ({
          userId,
          weekStartDate,
          totalInteractions: stats.total,
          topFeatureUsed:
            Object.entries(stats.counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
            null,
          interactionBreakdown: stats.counts,
        }),
      );

      // 5. Batch upsert — one find + one save instead of N individual upserts
      await this.premiumRollupRepository.batchUpsertRollupsAsync(rollups);

      logger.info(
        `PremiumRollupCron: Rollup complete. Processed ${rollups.length} users.`,
      );
    } catch (error) {
      logger.error('PremiumRollupCron: Error during weekly rollup', error);
    }
  }
}
