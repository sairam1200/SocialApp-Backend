import { YoutubeVideoAnalytics } from '../entities/youtubeVideoAnalytics.entity';

export interface IYoutubeVideoAnalyticsRepository {
  createOrUpdateAsync(analytics: YoutubeVideoAnalytics): Promise<YoutubeVideoAnalytics>;
  getLatestByVideoIdAsync(videoId: string): Promise<YoutubeVideoAnalytics | null>;
  getLatestByUserIdAndVideoIdAsync(userId: string, videoId: string): Promise<YoutubeVideoAnalytics | null>;
  getLatestByUserIdAsync(userId: string): Promise<YoutubeVideoAnalytics[]>;
  getTrendsAsync(videoId: string, startDate: Date, endDate: Date): Promise<YoutubeVideoAnalytics[]>;
  getTrendsByUserIdAndVideoIdAsync(userId: string, videoId: string, startDate: Date, endDate: Date): Promise<YoutubeVideoAnalytics[]>;
  getTopVideosAsync(userId: string, limit: number): Promise<YoutubeVideoAnalytics[]>;
  getTopVideosByVideoIdsAsync(userId: string, videoIds: string[], limit: number): Promise<YoutubeVideoAnalytics[]>;
}
