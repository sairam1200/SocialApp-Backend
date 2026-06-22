import { YoutubeAnalytic } from "../entities";

export interface IYoutubeAnalyticRepository {
  createAsync(analytic: YoutubeAnalytic): Promise<YoutubeAnalytic>;
  createManyAsync(analytics: YoutubeAnalytic[]): Promise<YoutubeAnalytic[]>;
  getByVideoIdAsync(videoId: string): Promise<YoutubeAnalytic[]>;
  getLatestByVideoIdAsync(videoId: string): Promise<YoutubeAnalytic | null>;
  getByVideoIdAndDateRangeAsync(videoId: string, startDate: Date, endDate: Date): Promise<YoutubeAnalytic[]>;
  deleteByVideoIdsAsync(videoIds: string[]): Promise<void>;
}
