import { FacebookPageAnalytics } from '../entities/facebookPageAnalytics.entity';

export interface IFacebookPageAnalyticsRepository {
  createOrUpdateAsync(
    analytics: FacebookPageAnalytics,
  ): Promise<FacebookPageAnalytics>;
  getLatestByPageIdAsync(pageId: string): Promise<FacebookPageAnalytics | null>;
  getLatestByUserIdAsync(userId: string): Promise<FacebookPageAnalytics | null>;
  getTrendsAsync(
    pageId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FacebookPageAnalytics[]>;
}
