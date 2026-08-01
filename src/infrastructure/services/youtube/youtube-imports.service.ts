import { Injectable, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IYoutubeImportService,
  YoutubePlaylistItem,
} from 'domain/services/youtube/iyoutube-import.services';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IContentStreamRepository } from '../../../domain/repositories/icontentStream.repository';
import { INotificationService } from '../../../domain/services/inotification.service';
import { IOwnershipResolver } from '../../../domain/services/iownership-resolver.service';
import { IYoutubeAnalyticsService } from '../../../domain/services/iyoutubeAnalytics.service';
import { IContentStreamIndexService } from '../../../domain/services/icontentStreamIndex.service';
import { NotificationStatus, NotificationType } from '../../../domain/enums';
import { NotificationModel } from '../../../domain/contracts/notification.model';
import { mapToNotificationModel } from '../../../domain/mappers/notification.mapper';
import { mapToYouTubeContentModel } from '../../../domain/mappers/youtube.mapper';
import { UserContent } from '../../../domain/entities/userContent.entity';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';

interface CursorMap {
  [key: string]: string | null;
}

interface YoutubeVideoStatistics {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
}

interface YoutubeVideoStats {
  statistics?: YoutubeVideoStatistics;
  duration?: string;
}

interface YoutubeApiVideoItem {
  id: string;
  statistics?: YoutubeVideoStatistics;
  contentDetails?: { duration?: string };
}

interface YoutubeVideosListResponse {
  items?: YoutubeApiVideoItem[];
  pageInfo?: { totalResults?: number; resultsPerPage?: number };
}

interface YoutubeApiListResponse {
  items?: Record<string, unknown>[];
  nextPageToken?: string;
  pageInfo?: { totalResults?: number; resultsPerPage?: number };
}

const NOTIFICATION_UPDATE_INTERVAL = 10;

@Injectable()
export class YoutubeImportService implements IYoutubeImportService {
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
    @Inject(_const.IOWNERSHIP_RESOLVER)
    private readonly ownershipResolver: IOwnershipResolver,
    @Inject(_const.IYOUTUBEANALYTICS_SERVICE)
    private readonly youtubeAnalyticsService: IYoutubeAnalyticsService,
    @Inject(_const.ICONTENTSTREAM_INDEX_SERVICE)
    private readonly contentStreamIndexService: IContentStreamIndexService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  parseDurationToSeconds(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    return (
      Number(match[1] || 0) * 3600 +
      Number(match[2] || 0) * 60 +
      Number(match[3] || 0)
    );
  }

  async callYouTubeApiWithRetry<T>(
    config: AxiosRequestConfig,
    retries: number = 5,
  ): Promise<{ data: T; headers: any }> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const url = config.url || '';
        logger.info(
          `[YoutubeImport] API call attempt ${attempt}/${retries}: ${config.method || 'GET'} ${url}`,
        );
        const response = await axios({ ...config, validateStatus: () => true });
        logger.info(
          `[YoutubeImport] API response ${attempt}/${retries}: ${response.status} ` +
            `quotaCost=${response.headers['x-quota-cost'] || 'N/A'} ` +
            `quotaRemaining=${response.headers['x-ratelimit-remaining'] || 'N/A'}`,
        );
        if (response.status === 429) {
          const retryAfter = parseInt(
            response.headers['retry-after'] || '0',
            10,
          );
          const delay = Math.max(
            retryAfter * 1000,
            Math.pow(2, attempt) * 1000,
          );
          logger.warn(
            `[YoutubeImport] HTTP 429 on ${url} attempt ${attempt}/${retries}. Retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          lastError = new Error('HTTP 429: rate limited');
          continue;
        }
        if (response.status >= 500) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(
            `[YoutubeImport] HTTP ${response.status} on ${url} attempt ${attempt}/${retries}. Retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
        if (response.status >= 400) {
          const body = JSON.stringify(response.data).substring(0, 500);
          throw new Error(`HTTP ${response.status}: ${body}`);
        }
        return { data: response.data as T, headers: response.headers };
      } catch (err) {
        if (
          err instanceof AxiosError &&
          (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')
        ) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(
            `[YoutubeImport] ${err.code} on attempt ${attempt}/${retries}. Retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError || new Error(`Request failed after ${retries} retries`);
  }

  async fetchPlaylistVideosPage(
    accessToken: string,
    playlistId: string,
    pageToken: string | null = null,
  ): Promise<{ items: YoutubePlaylistItem[]; nextPageToken: string | null }> {
    const result = await this.callYouTubeApiWithRetry<YoutubeApiListResponse>({
      method: 'GET',
      url: 'https://www.googleapis.com/youtube/v3/playlistItems',
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        part: 'snippet,contentDetails',
        playlistId,
        maxResults: 50,
        pageToken: pageToken ?? undefined,
      },
    });
    const rawItems = result.data.items ?? [];
    const items: YoutubePlaylistItem[] = rawItems.map((raw: any) => ({
      id: typeof raw.id === 'string' ? raw.id : '',
      snippet: raw.snippet
        ? {
            title: raw.snippet.title,
            description: raw.snippet.description,
            publishedAt: raw.snippet.publishedAt,
            thumbnails: raw.snippet.thumbnails,
            channelId: raw.snippet.channelId,
            channelTitle: raw.snippet.channelTitle,
          }
        : undefined,
      contentDetails: raw.contentDetails
        ? { videoId: raw.contentDetails.videoId }
        : undefined,
    }));
    return {
      items,
      nextPageToken:
        typeof result.data.nextPageToken === 'string'
          ? result.data.nextPageToken
          : null,
    };
  }

  async fetchPlaylistVideos(
    accessToken: string,
    playlistId: string,
  ): Promise<YoutubePlaylistItem[]> {
    const videos: YoutubePlaylistItem[] = [];
    let nextPageToken: string | null = null;
    do {
      const page = await this.fetchPlaylistVideosPage(
        accessToken,
        playlistId,
        nextPageToken,
      );
      for (const item of page.items) videos.push(item);
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);

    if (videos.length > 0) {
      const videoIds: string[] = [];
      for (const v of videos) {
        const vid = v.contentDetails?.videoId;
        if (vid) videoIds.push(vid);
      }
      if (videoIds.length > 0) {
        for (let i = 0; i < videoIds.length; i += 50) {
          const batch = videoIds.slice(i, i + 50);
          const statsRes =
            await this.callYouTubeApiWithRetry<YoutubeVideosListResponse>({
              method: 'GET',
              url: 'https://www.googleapis.com/youtube/v3/videos',
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                part: 'statistics,contentDetails',
                id: batch.join(','),
              },
            });
          const statsMap = new Map<string, YoutubeVideoStats>();
          for (const item of statsRes.data.items ?? []) {
            statsMap.set(item.id, {
              statistics: item.statistics,
              duration: item.contentDetails?.duration,
            });
          }
          for (const video of videos) {
            const vid = video.contentDetails?.videoId;
            if (!vid) continue;
            const s = statsMap.get(vid);
            if (s) {
              video._stats = {
                viewCount: Number(s.statistics?.viewCount || 0),
                likeCount: Number(s.statistics?.likeCount || 0),
                commentCount: Number(s.statistics?.commentCount || 0),
                duration: s.duration || 'PT0S',
              };
            }
          }
        }
      }
    }
    return videos;
  }

  private mapContentByType(
    type: string,
    item: any,
    userId: string,
    linkedAccountId: string,
    userChannel: any,
  ): UserContent | null {
    const base = new UserContent({
      userId,
      linkedAccountId,
      platform: _const.PLATFORMS.YOUTUBE,
    });

    switch (type) {
      case 'Subscriptions':
        base.type = 'subscription';
        base.title = item.snippet.title;
        base.externalId = item.snippet.resourceId.channelId;
        base.text = item.snippet.description;
        base.publishedAt = item.snippet.publishedAt
          ? new Date(item.snippet.publishedAt)
          : undefined;
        base.sourceUrl = `https://www.youtube.com/channel/${item.snippet.resourceId.channelId}`;
        base.media = [
          {
            url:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.default?.url,
            type: 'channel',
            thumbnail: item.snippet.thumbnails?.high?.url,
          },
        ];
        base.metaData = {
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          thumbnails: item.snippet.thumbnails,
          ...this.resolveChannelIdentity('subscription', item, userChannel),
        };
        return base;

      case 'Playlists':
        base.type = 'playlist';
        base.title = item.snippet.title;
        base.externalId = item.id;
        base.text = item.snippet.description;
        base.publishedAt = item.snippet.publishedAt
          ? new Date(item.snippet.publishedAt)
          : undefined;
        base.sourceUrl = `https://www.youtube.com/playlist?list=${item.id}`;
        base.media = [
          {
            url:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.default?.url,
            type: 'playlist',
            thumbnail: item.snippet.thumbnails?.high?.url,
          },
        ];
        base.metaData = {
          playlistId: item.id,
          description: item.snippet.description,
          itemCount: item.contentDetails?.itemCount,
          publishedAt: item.snippet.publishedAt,
          thumbnails: item.snippet.thumbnails,
          ...this.resolveChannelIdentity('playlist', item, userChannel),
        };
        return base;

      case 'Activities':
        base.type = 'activity';
        base.title = item.snippet.title;
        base.externalId = item.id;
        base.text = item.snippet.description;
        base.publishedAt = item.snippet.publishedAt
          ? new Date(item.snippet.publishedAt)
          : undefined;
        base.sourceUrl = `https://www.youtube.com/watch?v=${item.contentDetails?.upload?.videoId || item.id}`;
        base.media = [
          {
            url:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.default?.url,
            type: 'activity',
            thumbnail: item.snippet.thumbnails?.high?.url,
          },
        ];
        base.metaData = {
          publishedAt: item.snippet.publishedAt,
          description: item.snippet.description,
          thumbnails: item.snippet.thumbnails,
          type: item.snippet.type,
          ...this.resolveChannelIdentity('activity', item, userChannel),
          channelId: item.snippet.channelId,
        };
        return base;

      case 'ChannelInfo':
        base.type = 'channel';
        base.title = item.snippet.title;
        base.externalId = item.id;
        base.text = item.snippet.description;
        base.publishedAt = item.snippet.publishedAt
          ? new Date(item.snippet.publishedAt)
          : undefined;
        base.sourceUrl = `https://www.youtube.com/channel/${item.id}`;
        base.media = [
          {
            url:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.default?.url,
            type: 'channel',
            thumbnail: item.snippet.thumbnails?.high?.url,
          },
        ];
        if (item.statistics) {
          base.engagement = {
            views: item.statistics.viewCount,
            subscribers: item.statistics.subscriberCount,
            videos: item.statistics.videoCount,
          };
        }
        base.metaData = {
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          thumbnails: item.snippet.thumbnails,
          statistics: item.statistics,
          ...this.resolveChannelIdentity('channel', item, userChannel),
        };
        return base;

      default:
        return null;
    }
  }

  private resolveChannelIdentity(
    type: string,
    item: any,
    userChannel: any,
  ):
    | {
        channelId?: string;
        channelTitle?: string;
        channelProfileImage?: string;
      }
    | undefined {
    const representsChannel = type === 'subscription' || type === 'channel';
    const channel = representsChannel ? item : userChannel;
    if (!channel?.snippet) return undefined;
    return {
      channelId:
        type === 'subscription'
          ? item?.snippet?.resourceId?.channelId
          : channel?.id,
      channelTitle: channel.snippet?.title,
      channelProfileImage: channel.snippet?.thumbnails?.default?.url,
    };
  }

  private buildUploadedVideoContent(
    item: any,
    userId: string,
    linkedAccountId: string,
    externalId: string,
    channelIdentity?: {
      channelId?: string;
      channelTitle?: string;
      channelProfileImage?: string;
    },
    stats?: {
      viewCount: number;
      likeCount: number;
      commentCount: number;
      duration: string;
    },
  ): UserContent {
    const duration = stats?.duration || item._stats?.duration || 'PT0S';
    const durationSeconds = this.parseDurationToSeconds(duration);
    const isShort = durationSeconds <= 180;
    const viewCount = stats?.viewCount ?? item._stats?.viewCount;
    const likeCount = stats?.likeCount ?? item._stats?.likeCount;
    const commentCount = stats?.commentCount ?? item._stats?.commentCount;
    const hasEngagement =
      !!item.statistics ||
      viewCount != null ||
      likeCount != null ||
      commentCount != null;

    return new UserContent({
      userId,
      linkedAccountId,
      platform: _const.PLATFORMS.YOUTUBE,
      type: 'uploaded_video',
      title: item.snippet?.title || 'Untitled',
      externalId,
      text: item.snippet?.description,
      publishedAt: item.snippet?.publishedAt
        ? new Date(item.snippet.publishedAt)
        : undefined,
      sourceUrl: `https://www.youtube.com/watch?v=${item.contentDetails?.videoId}`,
      media: [
        {
          url:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.default?.url,
          type: 'video',
          thumbnail: item.snippet?.thumbnails?.high?.url,
        },
      ],
      engagement: hasEngagement
        ? {
            views: item.statistics?.viewCount ?? viewCount ?? 0,
            likes: item.statistics?.likeCount ?? likeCount ?? 0,
            comments: item.statistics?.commentCount ?? commentCount ?? 0,
          }
        : undefined,
      metaData: {
        videoId: item.contentDetails?.videoId,
        publishedAt: item.snippet?.publishedAt,
        description: item.snippet?.description,
        thumbnails: item.snippet?.thumbnails,
        viewCount,
        likeCount,
        commentCount,
        duration,
        isShort,
        statistics: item.statistics,
        ...(channelIdentity || {}),
      },
    });
  }

  private async saveAndEmitContent(
    content: UserContent,
    userId: string,
  ): Promise<UserContent> {
    await this.preserveExistingEngagement(content);
    const saved = await this.userContentRepository.createAsync(content);
    const mapped = mapToYouTubeContentModel(saved);
    this.eventEmitter.emit('content.imported', {
      userId,
      platform: _const.PLATFORMS.YOUTUBE,
      data: mapped,
    });

    await this.indexImportedContent(saved);

    return saved;
  }

  private async preserveExistingEngagement(
    content: UserContent,
  ): Promise<void> {
    if (this.hasRealEngagement(content.engagement)) return;
    const existing = await this.fetchExistingEngagement(content.externalId);
    if (!existing) return;
    content.engagement = {
      ...(existing.views != null ? { views: existing.views } : {}),
      ...(existing.likes != null ? { likes: existing.likes } : {}),
      ...(existing.comments != null ? { comments: existing.comments } : {}),
      ...(existing.shares != null ? { shares: existing.shares } : {}),
    };
    content.metaData = {
      ...(content.metaData ?? {}),
      ...(existing.views != null ? { viewCount: existing.views } : {}),
      ...(existing.likes != null ? { likeCount: existing.likes } : {}),
      ...(existing.comments != null ? { commentCount: existing.comments } : {}),
      ...(existing.shares != null ? { shareCount: existing.shares } : {}),
    };
  }

  private hasRealEngagement(engagement: any): boolean {
    if (!engagement || typeof engagement !== 'object') return false;
    return [engagement.views, engagement.likes, engagement.comments].some(
      (value) => Number(value) > 0,
    );
  }

  private async fetchExistingEngagement(externalId: string): Promise<{
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  } | null> {
    try {
      const [rows] = await this.contentStreamRepository.getEntriesAsync({
        page: 1,
        pageSize: 1,
        filter: { platform: _const.PLATFORMS.YOUTUBE, externalId },
      });
      const existing = rows?.[0]?.metaData?.engagement as
        Record<string, any> | undefined;
      if (!existing || typeof existing !== 'object') return null;
      const toNum = (value: unknown): number | undefined => {
        if (value == null) return undefined;
        const n = Number(value);
        return Number.isNaN(n) ? undefined : n;
      };
      return {
        views: toNum(existing.viewCount ?? existing.views),
        likes: toNum(existing.likeCount ?? existing.likes),
        comments: toNum(existing.commentCount ?? existing.comments),
        shares: toNum(existing.shareCount ?? existing.shares),
      };
    } catch {
      return null;
    }
  }

  private async indexImportedContent(content: UserContent): Promise<void> {
    try {
      await this.contentStreamIndexService.upsertFromUserContent(content);
    } catch (error) {
      logger.warn(
        `[YoutubeImport] Failed to index content ${content.externalId} in unified search: ${(error as Error).message}`,
      );
    }
  }

  private async upsertNotification(
    notification: NotificationModel | undefined,
    userId: string,
    reports: Array<{
      type: string;
      totalItem: number;
      itemProcessed: number;
      progressPercent: number;
      status: string;
    }>,
  ): Promise<NotificationModel> {
    if (!notification) {
      const result = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        'Importing your Youtube data...',
        '',
        true,
        {
          status: NotificationStatus.InProgress,
          reports,
          platform: _const.PLATFORMS.YOUTUBE,
        },
      );
      return mapToNotificationModel(result);
    }
    await this.notificationService.updateAsync(notification.id, true, {
      metaData: {
        status: NotificationStatus.InProgress,
        reports,
        platform: _const.PLATFORMS.YOUTUBE,
      },
    });
    return notification;
  }

  private loadCursors(account: any): CursorMap {
    return account.metaData?.importCursors || {};
  }

  private async saveCursors(account: any, cursors: CursorMap): Promise<void> {
    if (!account.metaData) account.metaData = {};
    account.metaData.importCursors = cursors;
    await this.linkedAccountRepository.updateAsync(account);
  }

  private async clearCursors(account: any): Promise<void> {
    if (account.metaData?.importCursors) {
      delete account.metaData.importCursors;
      await this.linkedAccountRepository.updateAsync(account);
    }
  }

  async importUploadsAsync(
    userId: string,
    accessToken: string,
  ): Promise<number> {
    let importedCount = 0;

    const linkedAccountId = (
      await this.ownershipResolver.resolveAsync(
        userId,
        _const.PLATFORMS.YOUTUBE,
      )
    ).id;

    try {
      const channelRes = await this.callYouTubeApiWithRetry<any>({
        method: 'GET',
        url: 'https://www.googleapis.com/youtube/v3/channels',
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { part: 'snippet,contentDetails', mine: true },
      });

      const channel = channelRes.data?.items?.[0];
      if (!channel) return 0;

      const uploadsPlaylistId =
        channel.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) return 0;

      const channelIdentity = this.resolveChannelIdentity(
        'uploaded_video',
        undefined,
        channel,
      );
      let nextPageToken: string | null = null;

      do {
        let page: {
          items: YoutubePlaylistItem[];
          nextPageToken: string | null;
        };
        try {
          page = await this.fetchPlaylistVideosPage(
            accessToken,
            uploadsPlaylistId,
            nextPageToken,
          );
        } catch {
          break;
        }
        nextPageToken = page.nextPageToken;

        const videoIds = page.items
          .map((v) => v.contentDetails?.videoId)
          .filter(Boolean);
        if (videoIds.length === 0) continue;

        let statsResponse: { data: YoutubeVideosListResponse; headers: any };
        try {
          statsResponse =
            await this.callYouTubeApiWithRetry<YoutubeVideosListResponse>({
              method: 'GET',
              url: 'https://www.googleapis.com/youtube/v3/videos',
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                part: 'statistics,contentDetails',
                id: videoIds.join(','),
              },
            });
        } catch {
          break;
        }

        const detailsMap = new Map(
          (statsResponse.data?.items ?? []).map((item) => [
            item.id,
            {
              statistics: item.statistics,
              duration: item.contentDetails?.duration,
            },
          ]),
        );

        for (const item of page.items) {
          const videoId = item.contentDetails?.videoId;
          if (!videoId) continue;

          const details = detailsMap.get(videoId) as any;
          try {
            const content = this.buildUploadedVideoContent(
              item,
              userId,
              linkedAccountId,
              videoId,
              channelIdentity,
              {
                viewCount: Number(details?.statistics?.viewCount ?? 0),
                likeCount: Number(details?.statistics?.likeCount ?? 0),
                commentCount: Number(details?.statistics?.commentCount ?? 0),
                duration: details?.duration ?? 'PT0S',
              },
            );
            await this.saveAndEmitContent(content, userId);
            importedCount++;
          } catch {
            continue;
          }
        }
      } while (nextPageToken);

      return importedCount;
    } catch {
      throw new Error('YouTube import uploads failed');
    }
  }

  async importSubscriptionsAsync(
    userId: string,
    accessToken: string,
  ): Promise<number> {
    let importedCount = 0;

    const linkedAccountId = (
      await this.ownershipResolver.resolveAsync(
        userId,
        _const.PLATFORMS.YOUTUBE,
      )
    ).id;

    await this.userContentRepository.deleteByUserIdAndPlatformAsync(
      userId,
      _const.PLATFORMS.YOUTUBE,
    );

    const feedRes = await axios.get(
      'https://www.googleapis.com/youtube/v3/subscriptions',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { part: 'snippet', mine: true, maxResults: 50 },
      },
    );

    for (const sub of feedRes.data?.items ?? []) {
      const channelId = sub.snippet?.resourceId?.channelId;
      if (!channelId) continue;

      const searchRes = await axios.get(
        'https://www.googleapis.com/youtube/v3/search',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            part: 'snippet',
            channelId,
            order: 'date',
            type: 'video',
            maxResults: 5,
          },
        },
      );

      const videoIds = (searchRes.data?.items ?? [])
        .map((v: any) => v.id?.videoId)
        .filter(Boolean);
      if (videoIds.length === 0) continue;

      const statsRes = await axios.get(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { part: 'statistics,contentDetails', id: videoIds.join(',') },
        },
      );

      const detailsMap = new Map(
        (statsRes.data?.items ?? []).map((item: any) => [
          item.id,
          {
            statistics: item.statistics,
            duration: item.contentDetails?.duration,
          },
        ]),
      );

      for (const video of searchRes.data?.items ?? []) {
        const videoId = video.id?.videoId;
        if (!videoId) continue;

        const details = detailsMap.get(videoId) as any;
        const duration = details?.duration ?? 'PT0S';
        const isShort = this.parseDurationToSeconds(duration) <= 180;

        await this.userContentRepository.createAsync(
          new UserContent({
            userId,
            linkedAccountId,
            platform: _const.PLATFORMS.YOUTUBE,
            type: 'subscription_video',
            externalId: videoId,
            title: video.snippet?.title ?? 'Untitled Video',
            sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
            text: video.snippet?.description || undefined,
            media: [
              {
                url:
                  video.snippet?.thumbnails?.high?.url ??
                  video.snippet?.thumbnails?.medium?.url ??
                  video.snippet?.thumbnails?.default?.url,
                type: 'video',
                thumbnail:
                  video.snippet?.thumbnails?.high?.url ??
                  video.snippet?.thumbnails?.medium?.url ??
                  video.snippet?.thumbnails?.default?.url,
              },
            ],
            publishedAt: video.snippet?.publishedAt
              ? new Date(video.snippet.publishedAt)
              : undefined,
            engagement: {
              views: Number(details?.statistics?.viewCount ?? 0),
              likes: Number(details?.statistics?.likeCount ?? 0),
              comments: Number(details?.statistics?.commentCount ?? 0),
            },
            metaData: {
              videoId,
              isShort,
              duration,
              description: video.snippet?.description,
              publishedAt: video.snippet?.publishedAt,
              viewCount: Number(details?.statistics?.viewCount ?? 0),
              likeCount: Number(details?.statistics?.likeCount ?? 0),
              commentCount: Number(details?.statistics?.commentCount ?? 0),
              thumbnail:
                video.snippet?.thumbnails?.high?.url ??
                video.snippet?.thumbnails?.medium?.url ??
                video.snippet?.thumbnails?.default?.url,
              channelId: video.snippet?.channelId,
              channelTitle: video.snippet?.channelTitle,
              youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
              importedAt: new Date().toISOString(),
            },
          }),
        );
        importedCount++;
      }
    }
    return importedCount;
  }

  async refreshChannelProfileAsync(
    userId: string,
    accessToken: string,
  ): Promise<void> {
    // Channel profile refresh is not yet implemented
  }

  async importFullAsync(
    account: any,
    accessToken: string,
    job?: Job,
  ): Promise<void> {
    const currentAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.YOUTUBE,
        account.userId,
      );
    if (!currentAccount) {
      logger.error(
        `[YoutubeImport] Account not found for user ${account.userId}`,
      );
      return;
    }

    if (job && !(await job.isActive())) {
      logger.info(
        `[YoutubeImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`,
      );
      return;
    }

    logger.info(
      `[YoutubeImport] Starting full import for user ${account.userId}`,
    );

    const progressReports: Record<
      string,
      {
        totalItem: number;
        itemProcessed: number;
        progressPercent: number;
        status: string;
      }
    > = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];

    const fields: Record<
      string,
      {
        endpoint: string;
        type: string;
        params?: any;
        uploadsPlaylistExtractor?: (item: any) => string | null;
      }
    > = {
      channels: {
        endpoint: 'channels',
        type: 'ChannelInfo',
        params: { mine: true, part: 'snippet,contentDetails,statistics' },
        uploadsPlaylistExtractor: (item: any) =>
          item.contentDetails?.relatedPlaylists?.uploads || null,
      },
      subscriptions: {
        endpoint: 'subscriptions',
        type: 'Subscriptions',
        params: { mine: true, part: 'snippet,contentDetails', maxResults: 50 },
      },
      playlists: {
        endpoint: 'playlists',
        type: 'Playlists',
        params: { mine: true, part: 'snippet,contentDetails' },
      },
      activities: {
        endpoint: 'activities',
        type: 'Activities',
        params: { mine: true, part: 'snippet,contentDetails', maxResults: 50 },
      },
    };

    let uploadsPlaylistId: string | null = null;
    let userChannel: any = null;
    let notification: NotificationModel | undefined;
    let encounteredError = false;
    let itemsSinceLastNotify = 0;

    for (const [
      key,
      { endpoint, type, params, uploadsPlaylistExtractor },
    ] of Object.entries(fields)) {
      let nextPageToken: string | null = lastCursors[type] || null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        do {
          if (nextPageToken) {
            logger.debug(
              `[YoutubeImport] Resuming ${type} from token: ${nextPageToken.substring(0, 20)}...`,
            );
          }

          const result = await this.callYouTubeApiWithRetry<any>({
            method: 'GET',
            url: `https://www.googleapis.com/youtube/v3/${endpoint}`,
            params: {
              ...params,
              pageToken: nextPageToken ?? undefined,
              access_token: accessToken,
            },
          });

          const items: any[] = result.data.items ?? [];
          const pageInfo = result.data.pageInfo ?? {};
          nextPageToken = result.data.nextPageToken ?? null;

          if (!nextPageToken) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[type];
          }

          if (pageInfo.totalResults) {
            progressReports[type].totalItem = pageInfo.totalResults;
          }

          for (const item of items) {
            if (uploadsPlaylistExtractor) {
              const pid = uploadsPlaylistExtractor(item);
              if (pid) uploadsPlaylistId = pid;
            }

            if (key === 'channels') {
              userChannel = item;
            }

            const content = this.mapContentByType(
              type,
              item,
              account.userId,
              account.id,
              userChannel,
            );
            if (content) {
              try {
                const saved = await this.saveAndEmitContent(
                  content,
                  account.userId,
                );
                importedExternalIds.push(saved.externalId);

                if (type === 'Playlists' && item.id) {
                  const playlistVideoIds = await this.importPlaylistVideosAsync(
                    accessToken,
                    item.id,
                    account.userId,
                    userChannel,
                  );
                  importedExternalIds.push(...playlistVideoIds);
                }
              } catch (err: any) {
                logger.error(
                  `[YoutubeImport] Error saving ${type} content: ${err.message}`,
                );
              }
            }

            progressReports[type].itemProcessed++;
            progressReports[type].progressPercent = progressReports[type]
              .totalItem
              ? Math.round(
                  (progressReports[type].itemProcessed /
                    progressReports[type].totalItem) *
                    100,
                )
              : 0;

            itemsSinceLastNotify++;
            if (itemsSinceLastNotify >= NOTIFICATION_UPDATE_INTERVAL) {
              const reportArray = Object.entries(progressReports).map(
                ([t, r]) => ({ type: t, ...r }),
              );
              notification = await this.upsertNotification(
                notification,
                account.userId,
                reportArray,
              );
              itemsSinceLastNotify = 0;
            }
          }

          if (nextPageToken) {
            lastCursors[type] = nextPageToken;
            await this.saveCursors(currentAccount, lastCursors);
          }

          if (job && !(await job.isActive())) {
            logger.info(
              `[YoutubeImport] Job ${job.id} cancelled during ${type}`,
            );
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }
        } while (nextPageToken);

        progressReports[type].status = NotificationStatus.Completed;
        delete lastCursors[type];
        await this.saveCursors(currentAccount, lastCursors);
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[YoutubeImport] Error importing ${type}: ${err.message}`);
        if (nextPageToken) {
          lastCursors[type] = nextPageToken;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (uploadsPlaylistId) {
      const type = 'UploadedVideos';
      let nextPageToken: string | null = lastCursors[type] || null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        do {
          const videos = await this.fetchPlaylistVideosPage(
            accessToken,
            uploadsPlaylistId,
            nextPageToken,
          );
          nextPageToken = videos.nextPageToken;

          if (videos.items.length === 0 && !nextPageToken) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[type];
            break;
          }

          const videoIds = videos.items
            .map((video) => video.contentDetails?.videoId)
            .filter(Boolean);
          let detailsMap: Map<string, { statistics?: any; duration?: string }> =
            new Map();
          if (videoIds.length > 0) {
            try {
              const statsResponse =
                await this.callYouTubeApiWithRetry<YoutubeVideosListResponse>({
                  method: 'GET',
                  url: 'https://www.googleapis.com/youtube/v3/videos',
                  headers: { Authorization: `Bearer ${accessToken}` },
                  params: {
                    part: 'statistics,contentDetails',
                    id: videoIds.join(','),
                  },
                });
              detailsMap = new Map(
                (statsResponse.data?.items ?? []).map((item) => [
                  item.id,
                  {
                    statistics: item.statistics,
                    duration: item.contentDetails?.duration,
                  },
                ]),
              );
            } catch {
              // Statistics unavailable; zero-overwrite guard preserves existing engagement.
            }
          }

          for (const item of videos.items) {
            const videoId = item.contentDetails?.videoId;
            if (!videoId) continue;
            const details = detailsMap.get(videoId);

            const content = this.buildUploadedVideoContent(
              item,
              account.userId,
              account.id,
              item.id,
              this.resolveChannelIdentity('uploaded_video', item, userChannel),
              details
                ? {
                    viewCount: Number(details.statistics?.viewCount ?? 0),
                    likeCount: Number(details.statistics?.likeCount ?? 0),
                    commentCount: Number(details.statistics?.commentCount ?? 0),
                    duration: details.duration ?? 'PT0S',
                  }
                : undefined,
            );

            try {
              await this.saveAndEmitContent(content, account.userId);
              importedExternalIds.push(content.externalId!);
            } catch (err: any) {
              logger.error(
                `[YoutubeImport] Error saving uploaded video: ${err.message}`,
              );
            }

            progressReports[type].itemProcessed++;
            itemsSinceLastNotify++;

            if (itemsSinceLastNotify >= NOTIFICATION_UPDATE_INTERVAL) {
              const reportArray = Object.entries(progressReports).map(
                ([t, r]) => ({ type: t, ...r }),
              );
              notification = await this.upsertNotification(
                notification,
                account.userId,
                reportArray,
              );
              itemsSinceLastNotify = 0;
            }
          }

          if (nextPageToken) {
            lastCursors[type] = nextPageToken;
            await this.saveCursors(currentAccount, lastCursors);
          }

          if (job && !(await job.isActive())) {
            logger.info(
              `[YoutubeImport] Job ${job.id} cancelled during ${type}`,
            );
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }
        } while (nextPageToken);

        progressReports[type].status = NotificationStatus.Completed;
        delete lastCursors[type];
        await this.saveCursors(currentAccount, lastCursors);
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(
          `[YoutubeImport] Error importing uploaded videos: ${err.message}`,
        );
        if (nextPageToken) {
          lastCursors[type] = nextPageToken;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (job && !(await job.isActive())) {
      logger.info(
        `[YoutubeImport] Job ${job.id} was cancelled, rolling back imported content`,
      );
      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.YOUTUBE,
            importedExternalIds,
          );
          logger.info(
            `[YoutubeImport] Rolled back ${importedExternalIds.length} items for user ${account.userId}`,
          );
        } catch (rollbackError: any) {
          logger.error(
            `[YoutubeImport] Error during rollback: ${rollbackError.message}`,
          );
        }
      }
      if (notification) {
        const finalReports = Object.entries(progressReports).map(([t, r]) => ({
          type: t,
          ...r,
        }));
        await this.notificationService.updateAsync(
          notification.id,
          false,
          { status: NotificationStatus.Cancelled, reports: finalReports },
          'YouTube import was cancelled and rolled back',
        );
      }
      return;
    }

    const finalAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.YOUTUBE,
        account.userId,
      );
    const finalReports = Object.entries(progressReports).map(([t, r]) => ({
      type: t,
      ...r,
    }));

    if (notification) {
      if (encounteredError) {
        await this.notificationService.updateAsync(
          notification.id,
          false,
          { status: NotificationStatus.Completed, reports: finalReports },
          'YouTube import completed with issues',
        );
      } else {
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReports,
            platform: _const.PLATFORMS.YOUTUBE,
          },
          'YouTube import completed!',
        );
      }

      if (finalAccount) {
        finalAccount.allowImport = true;
        await this.clearCursors(finalAccount);
        await this.linkedAccountRepository.updateAsync(finalAccount);
      }

      try {
        await this.youtubeAnalyticsService.syncAccountAnalyticsAsync(
          account.userId,
          { forceRefresh: true },
        );
        logger.info(
          `[YoutubeImport] Analytics sync completed for user ${account.userId}`,
        );
      } catch (analyticsError: any) {
        logger.warn(
          `[YoutubeImport] Analytics sync failed after import: ${analyticsError.message}`,
        );
      }
    } else {
      await this.notificationService.notifyAsync(
        account.userId,
        NotificationType.Import,
        'YouTube import could not start',
        'Unable to initialize YouTube data import.',
        false,
        { status: NotificationStatus.Cancelled, reports: finalReports },
      );
    }
  }

  private async importPlaylistVideosAsync(
    accessToken: string,
    playlistId: string,
    userId: string,
    userChannel: any,
  ): Promise<string[]> {
    const ids: string[] = [];

    const linkedAccountId = (
      await this.ownershipResolver.resolveAsync(
        userId,
        _const.PLATFORMS.YOUTUBE,
      )
    ).id;

    try {
      const videos = await this.fetchPlaylistVideos(accessToken, playlistId);
      for (const video of videos) {
        const content = new UserContent({
          userId,
          linkedAccountId,
          platform: _const.PLATFORMS.YOUTUBE,
          type: 'playlist_video',
          title: video.snippet?.title || 'Untitled',
          externalId: video.id,
          sourceUrl: `https://www.youtube.com/watch?v=${video.contentDetails?.videoId ?? video.id}`,
          text: video.snippet?.description || undefined,
          media: video.snippet?.thumbnails
            ? [
                {
                  url:
                    video.snippet.thumbnails.high?.url ||
                    video.snippet.thumbnails.default?.url,
                  type: 'video',
                  thumbnail:
                    video.snippet.thumbnails.high?.url ||
                    video.snippet.thumbnails.default?.url,
                },
              ]
            : undefined,
          publishedAt: video.snippet?.publishedAt
            ? new Date(video.snippet.publishedAt)
            : undefined,
          engagement: video._stats
            ? {
                views: video._stats.viewCount,
                likes: video._stats.likeCount,
                comments: video._stats.commentCount,
              }
            : undefined,
          metaData: {
            videoId: video.contentDetails?.videoId,
            publishedAt: video.snippet?.publishedAt,
            description: video.snippet?.description,
            thumbnails: video.snippet?.thumbnails,
            playlistId,
            viewCount: video._stats?.viewCount,
            likeCount: video._stats?.likeCount,
            commentCount: video._stats?.commentCount,
            duration: video._stats?.duration,
            ...this.resolveChannelIdentity(
              'playlist_video',
              video,
              userChannel,
            ),
          },
        });
        try {
          const saved = await this.saveAndEmitContent(content, userId);
          ids.push(saved.externalId);
        } catch (err: any) {
          logger.error(
            `[YoutubeImport] Error saving playlist video: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      logger.error(
        `[YoutubeImport] Error fetching playlist videos for ${playlistId}: ${err.message}`,
      );
    }
    return ids;
  }
}
