export interface IYoutubeAnalyticsService {
  syncAccountAnalyticsAsync(userId: string, options?: { forceRefresh?: boolean }): Promise<void>;
  syncAllAccountsAnalyticsAsync(): Promise<void>;
}
