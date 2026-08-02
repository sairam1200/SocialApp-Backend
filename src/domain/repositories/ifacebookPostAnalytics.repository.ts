import { FacebookPostAnalytics } from '../entities/facebookPostAnalytics.entity';

export interface IFacebookPostAnalyticsRepository {
  createOrUpdateAsync(
    analytics: FacebookPostAnalytics,
  ): Promise<FacebookPostAnalytics>;
  getLatestByPostIdAsync(postId: string): Promise<FacebookPostAnalytics | null>;
  getLatestByPostIdAndUserIdAsync(
    postId: string,
    userId: string,
  ): Promise<FacebookPostAnalytics | null>;
  getLatestByUserIdAsync(userId: string): Promise<FacebookPostAnalytics[]>;
  getTrendsAsync(
    postId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FacebookPostAnalytics[]>;
  getTopPostsAsync(
    userId: string,
    limit: number,
  ): Promise<FacebookPostAnalytics[]>;
}
