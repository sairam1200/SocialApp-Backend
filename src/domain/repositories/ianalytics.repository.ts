import { AnalyticsEvent } from '../entities/analyticsEvent.entity';

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
}
