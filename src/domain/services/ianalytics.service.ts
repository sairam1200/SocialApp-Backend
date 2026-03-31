export interface IAnalyticsService {
  trackEvent(
    eventName: string,
    userId?: string,
    properties?: Record<string, any>,
  ): Promise<void>;
}
