import { FacebookVideoAnalytics } from '../entities/facebookVideoAnalytics.entity';

export interface IFacebookVideoAnalyticsRepository {
  createOrUpdateAsync(analytics: FacebookVideoAnalytics): Promise<FacebookVideoAnalytics>;
  getLatestByVideoIdAsync(videoId: string): Promise<FacebookVideoAnalytics | null>;
  getLatestByUserIdAsync(userId: string): Promise<FacebookVideoAnalytics[]>;
  getTrendsAsync(videoId: string, startDate: Date, endDate: Date): Promise<FacebookVideoAnalytics[]>;
  getTopVideosAsync(userId: string, limit: number): Promise<FacebookVideoAnalytics[]>;
}
