import { YoutubeChannelAnalytics } from '../entities/youtubeChannelAnalytics.entity';

export interface IYoutubeChannelAnalyticsRepository {
  createOrUpdateAsync(analytics: YoutubeChannelAnalytics): Promise<YoutubeChannelAnalytics>;
  getLatestByChannelIdAsync(channelId: string): Promise<YoutubeChannelAnalytics | null>;
  getLatestByUserIdAsync(userId: string): Promise<YoutubeChannelAnalytics | null>;
  getTrendsAsync(channelId: string, startDate: Date, endDate: Date): Promise<YoutubeChannelAnalytics[]>;
}
