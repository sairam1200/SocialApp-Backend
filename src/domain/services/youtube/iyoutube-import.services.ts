import { Job } from 'bullmq';
import { AxiosRequestConfig } from 'axios';

export interface ProgressReport {
  totalItem: number;
  itemProcessed: number;
  progressPercent: number;
  status: string;
}

export interface YoutubePlaylistItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url: string }>;
    channelId?: string;
    channelTitle?: string;
  };
  contentDetails?: {
    videoId?: string;
  };
  statistics?: any;
  _stats?: {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    duration: string;
  };
}

export interface IYoutubeImportService {
  importUploadsAsync(userId: string, accessToken: string): Promise<number>;

  importSubscriptionsAsync(
    userId: string,
    accessToken: string,
  ): Promise<number>;

  refreshChannelProfileAsync(
    userId: string,
    accessToken: string,
  ): Promise<void>;

  importFullAsync(account: any, accessToken: string, job?: Job): Promise<void>;

  parseDurationToSeconds(duration: string): number;

  callYouTubeApiWithRetry<T>(
    config: AxiosRequestConfig,
    retries?: number,
  ): Promise<{ data: T; headers: any }>;

  fetchPlaylistVideos(
    accessToken: string,
    playlistId: string,
  ): Promise<YoutubePlaylistItem[]>;

  fetchPlaylistVideosPage(
    accessToken: string,
    playlistId: string,
    pageToken?: string | null,
  ): Promise<{ items: YoutubePlaylistItem[]; nextPageToken: string | null }>;
}
