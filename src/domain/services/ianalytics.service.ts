export interface IAnalyticsService {
  trackEvent(
    eventName: string,
    properties?: Record<string, any>,
  ): Promise<void>;
}
