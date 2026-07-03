import { YoutubeChannelAnalytics } from '../entities/youtubeChannelAnalytics.entity';

export interface ChannelMetricsAggregate {
  estimatedMinutesWatched: number;
  averageViewDurationSeconds: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
  estimatedRevenueUsd: number;
  estimatedAdRevenueUsd: number;
  snapshotCount: number;
}

export interface IYoutubeChannelAnalyticsRepository {
  createOrUpdateAsync(analytics: YoutubeChannelAnalytics): Promise<YoutubeChannelAnalytics>;
  getLatestByChannelIdAsync(channelId: string): Promise<YoutubeChannelAnalytics | null>;
  getByChannelIdAndDateAsync(channelId: string, snapshotDate: Date): Promise<YoutubeChannelAnalytics | null>;
  getLatestByUserIdAsync(userId: string): Promise<YoutubeChannelAnalytics | null>;
  getTrendsAsync(channelId: string, startDate: Date, endDate: Date): Promise<YoutubeChannelAnalytics[]>;
  getLatestSnapshotDateByChannelIdAsync(channelId: string): Promise<Date | null>;
  getLatestSnapshotDateByUserIdAsync(userId: string): Promise<Date | null>;
  getAggregatedMetricsAsync(channelId: string, startDate: Date, endDate: Date): Promise<ChannelMetricsAggregate>;
}
