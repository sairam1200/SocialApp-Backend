export interface IYoutubeAnalyticsService {
  syncAccountAnalyticsAsync(userId: string): Promise<void>;
  syncAllAccountsAnalyticsAsync(): Promise<void>;
}
