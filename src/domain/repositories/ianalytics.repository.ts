import { AnalyticsEvent } from '../entities/analyticsEvent.entity';

export interface AggregatedEventRow {
  userId: string;
  eventName: string;
  count: number;
}

export interface IAnalyticsRepository {
  trackEventAsync(
    eventName: string,
    userId?: string,
    metadata?: Record<string, any>,
  ): Promise<AnalyticsEvent>;
  getEventsByUserAsync(
    userId: string,
    fromDate: Date,
  ): Promise<AnalyticsEvent[]>;
  getAllEventsAsync(fromDate: Date): Promise<AnalyticsEvent[]>;

  /**
   * Returns pre-aggregated event counts grouped by (userId, eventName)
   * since the given date. One row per user per event type — orders of
   * magnitude smaller than loading every individual event into memory.
   */
  getAggregatedEventsAsync(
    since: Date,
  ): Promise<AggregatedEventRow[]>;
}
