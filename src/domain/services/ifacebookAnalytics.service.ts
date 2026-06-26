export interface IFacebookAnalyticsService {
  syncAccountAnalyticsAsync(userId: string): Promise<void>;
  syncAllAccountsAnalyticsAsync(): Promise<void>;
}
