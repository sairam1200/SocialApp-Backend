import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { Inject } from "@nestjs/common";
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { UserContent } from "../../../domain/entities/userContent.entity";
import { NotificationStatus, NotificationType } from "../../../domain/enums";
import { NotificationModel } from "../../../domain/contracts/notification.model";
import { mapToNotificationModel } from "../../../domain/mappers/notification.mapper";
import { INotificationService } from "../../../domain/services/inotification.service";
import { ImportGateway } from "../../../infrastructure/websocket/gateways/import.gateway";
import { IUserContentRepository } from "../../../domain/repositories/iuserContent.repository";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import { ApplicationException } from "../../../core/exceptions";
import BullMQConfig from "../../../core/config/bullmq.config";
import { mapToYouTubeContentModel } from "../../../domain/mappers/youtube.mapper";
import { IContentStreamRepository } from "../../../domain/repositories/icontentStream.repository";

interface CursorMap {
  [key: string]: string | null;
}

interface ProgressReport {
  totalItem: number;
  itemProcessed: number;
  progressPercent: number;
  status: NotificationStatus;
}

interface ProgressReports {
  [type: string]: ProgressReport;
}

interface YoutubeVideoStatistics {
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
}

interface YoutubeVideoContentDetails {
  duration?: string;
}

interface YoutubeVideoStats {
  statistics?: YoutubeVideoStatistics;
  duration?: string;
}

interface YoutubeApiVideoItem {
  id: string;
  statistics?: YoutubeVideoStatistics;
  contentDetails?: YoutubeVideoContentDetails;
}

interface YoutubeVideosListResponse {
  items?: YoutubeApiVideoItem[];
  pageInfo?: {
    totalResults?: number;
    resultsPerPage?: number;
  };
}

interface YoutubePlaylistItemSnippet {
  title?: string;
  description?: string;
  publishedAt?: string;
  thumbnails?: Record<string, { url: string }>;
  channelId?: string;
  channelTitle?: string;
}

interface YoutubePlaylistItemContentDetails {
  videoId?: string;
}

interface YoutubePlaylistItem {
  id: string;
  snippet?: YoutubePlaylistItemSnippet;
  contentDetails?: YoutubePlaylistItemContentDetails;
  _stats?: {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    duration: string;
  };
}

interface YoutubeApiListResponse {
  items?: Record<string, unknown>[];
  nextPageToken?: string;
  pageInfo?: {
    totalResults?: number;
    resultsPerPage?: number;
  };
}

interface YoutubePlaylistItemsPage {
  items: YoutubePlaylistItem[];
  nextPageToken: string | null;
}

interface YoutubeImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.YOUTUBE_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.YOUTUBE_IMPORT, 2))
export class YoutubeImportProcessor extends WorkerHost {
  private readonly NOTIFICATION_UPDATE_INTERVAL = 10;

  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,
    private readonly gateway: ImportGateway,
  ) {
    super();
    logger.info(`[YoutubeImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[YoutubeImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[YoutubeImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[YoutubeImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<YoutubeImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.YOUTUBE,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[YoutubeImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[YoutubeImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[YoutubeImport] Starting import for user ${account.userId}`);
    logger.debug(`[YoutubeImport] Using access token: ${accessToken.substring(0, 20)}...`);

    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];

    const fields: Record<string, { endpoint: string; type: string; params?: any; uploadsPlaylistExtractor?: (item: any) => string | null }> = {
      subscriptions: {
        endpoint: 'subscriptions',
        type: 'Subscriptions',
        params: { mine: true, part: 'snippet,contentDetails', maxResults: 50 }
      },
      playlists: {
        endpoint: 'playlists',
        type: 'Playlists',
        params: { mine: true, part: 'snippet,contentDetails' }
      },
      activities: {
        endpoint: 'activities',
        type: 'Activities',
        params: { mine: true, part: 'snippet,contentDetails', maxResults: 50 }
      },
      channels: {
        endpoint: 'channels',
        type: 'ChannelInfo',
        params: { mine: true, part: 'snippet,contentDetails,statistics' },
        uploadsPlaylistExtractor: (item: any) => item.contentDetails?.relatedPlaylists?.uploads || null
      }
    };

    let uploadsPlaylistId: string | null = null;
    let notification: NotificationModel;
    let encounteredError = false;
    let itemsProcessedSinceLastNotification = 0;

    for (const [key, { endpoint, type, params, uploadsPlaylistExtractor }] of Object.entries(fields)) {
      logger.debug(`[YoutubeImport] Fetching ${type} from /${endpoint}`);

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
            logger.debug(`[YoutubeImport] Resuming ${type} from token: ${nextPageToken.substring(0, 20)}...`);
          }

          logger.debug(`[YoutubeImport] Requesting page for ${type}`);
          const result = await this.callWithRetry({
            method: 'GET',
            url: `https://www.googleapis.com/youtube/v3/${endpoint}`,
            params: {
              ...params,
              pageToken: nextPageToken ?? undefined,
              access_token: accessToken,
            },
          });

          const items = result.data.items ?? [];
          const pageInfo = result.data.pageInfo ?? {};
          nextPageToken = result.data.nextPageToken ?? null;

          logger.debug(`[YoutubeImport] Retrieved ${items.length} items of ${type}`);

          if (!nextPageToken) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[type];
          }

          if (pageInfo.totalResults) {
            progressReports[type].totalItem = pageInfo.totalResults;
          }

          for (const item of items) {
            logger.debug(`[YoutubeImport] Mapping ${type} item: ${item.snippet?.title || item.id}`);

            if (uploadsPlaylistExtractor) {
              const playlistId = uploadsPlaylistExtractor(item);
              if (playlistId) {
                uploadsPlaylistId = playlistId;
                logger.debug(`[YoutubeImport] Found uploads playlist ID: ${uploadsPlaylistId}`);
              }
            }

            const content = this.mapContentByType(type, item, account.userId);
            if (content) {
              try {
                await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
                  _const.PLATFORMS.YOUTUBE,
                  content.externalId,
                );
                const savedContent = await this.userContentRepository.createAsync(content);
                importedExternalIds.push(savedContent.externalId);
                const mappedContent = mapToYouTubeContentModel(savedContent);
                this.gateway.emitNewImportContent(
                  account.userId,
                  _const.PLATFORMS.YOUTUBE,
                  mappedContent,
                );
                logger.info(
  `[ImportGateway] Emitting new-content to ${account.userId}`
);

                if (type === 'Playlists' && item.id) {
                  const playlistVideoIds = await this.importPlaylistVideos(accessToken, item.id, account.userId, importedExternalIds);
                  importedExternalIds.push(...playlistVideoIds);
                }
              } catch (err) {
                logger.error(`[YoutubeImport] Error saving ${type} content:`, err.message);
              }
            }

            progressReports[type].itemProcessed++;
            progressReports[type].progressPercent = progressReports[type].totalItem
              ? Math.round(
                (progressReports[type].itemProcessed / progressReports[type].totalItem) * 100,
              )
              : 0;

            itemsProcessedSinceLastNotification++;

            if (itemsProcessedSinceLastNotification >= this.NOTIFICATION_UPDATE_INTERVAL) {
              notification = await this.updateNotification(
                notification,
                account.userId,
                progressReports,
              );
              itemsProcessedSinceLastNotification = 0;
            }
          }

          if (nextPageToken) {
            lastCursors[type] = nextPageToken;
            await this.saveCursors(currentAccount, lastCursors);
          }

          if (!(await job.isActive())) {
            logger.info(`[YoutubeImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }
        } while (nextPageToken);

        progressReports[type].status = NotificationStatus.Completed;
        delete lastCursors[type];
        await this.saveCursors(currentAccount, lastCursors);
      } catch (err) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[YoutubeImport] Error occurred while importing ${type}:`, err.message);
        if (nextPageToken) {
          lastCursors[type] = nextPageToken;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (uploadsPlaylistId) {
      const type = "UploadedVideos";
      logger.debug(`[YoutubeImport] Processing uploaded videos from playlist ${uploadsPlaylistId}`);

      let nextPageToken: string | null = lastCursors[type] || null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        do {
          const videos = await this.fetchPlaylistVideosPage(accessToken, uploadsPlaylistId, nextPageToken);
          nextPageToken = videos.nextPageToken;

          if (videos.items.length === 0 && !nextPageToken) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[type];
            break;
          }

          for (const item of videos.items) {
            logger.debug(`[YoutubeImport] Processing uploaded video: ${item.snippet?.title || item.id}`);

            const duration = item._stats?.duration || 'PT0S';
            const durationSeconds = this.parseDurationToSeconds(duration);
            const isShort = durationSeconds <= 180;
            const content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.YOUTUBE,
              type: 'uploaded_video',
              title: item.snippet.title,
              externalId: item.id,
              metaData: {
                videoId: item.contentDetails.videoId,
                publishedAt: item.snippet.publishedAt,
                description: item.snippet.description,
                thumbnails: item.snippet.thumbnails,
                viewCount: item._stats?.viewCount || 0,
                likeCount: item._stats?.likeCount || 0,
                commentCount: item._stats?.commentCount || 0,
                duration,
                isShort,
              },
            });

            try {
              await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
                _const.PLATFORMS.YOUTUBE,
                content.externalId,
              );
              const savedContent = await this.userContentRepository.createAsync(content);
              importedExternalIds.push(savedContent.externalId);
              const mappedContent = mapToYouTubeContentModel(savedContent);
              this.gateway.emitNewImportContent(
                account.userId,
                _const.PLATFORMS.YOUTUBE,
                mappedContent,
              );
            } catch (err) {
              logger.error(`[YoutubeImport] Error saving uploaded video content:`, err.message);
            }

            progressReports[type].itemProcessed++;
            itemsProcessedSinceLastNotification++;

            if (itemsProcessedSinceLastNotification >= this.NOTIFICATION_UPDATE_INTERVAL) {
              notification = await this.updateNotification(
                notification,
                account.userId,
                progressReports,
              );
              itemsProcessedSinceLastNotification = 0;
            }
          }

          if (nextPageToken) {
            lastCursors[type] = nextPageToken;
            await this.saveCursors(currentAccount, lastCursors);
          }

          if (!(await job.isActive())) {
            logger.info(`[YoutubeImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }
        } while (nextPageToken);

        progressReports[type].status = NotificationStatus.Completed;
        delete lastCursors[type];
        await this.saveCursors(currentAccount, lastCursors);
      } catch (err) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[YoutubeImport] Error occurred while importing ${type}:`, err.message);
        if (nextPageToken) {
          lastCursors[type] = nextPageToken;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (!(await job.isActive())) {
      logger.info(`[YoutubeImport] Job ${job.id} was cancelled, rolling back imported content`);

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.YOUTUBE,
            importedExternalIds,
          );
          logger.info(`[YoutubeImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`);
        } catch (rollbackError) {
          logger.error(`[YoutubeImport] Error during rollback:`, rollbackError);
        }
      }

      if (notification) {
        const finalReportArray = Object.entries(progressReports).map(([type, report]) => ({
          type,
          ...report,
        }));
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Cancelled,
            reports: finalReportArray,
          },
          "❌ Youtube import was cancelled and rolled back",
        );
      }
      return;
    }

    const finalAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.YOUTUBE,
      account.userId,
    );

    const finalReportArray = Object.entries(progressReports).map(([type, report]) => ({
      type,
      ...report,
    }));

    if (notification) {
      if (encounteredError) {
        logger.warn(`[YoutubeImport] Completed with issues for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "⚠️ Youtube import completed with issues",
        );
      } else {
        logger.info(`[YoutubeImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.YOUTUBE,
          },
          "✅ Youtube import completed!",
        );
      }

      if (finalAccount) {
        finalAccount.allowImport = true;
        await this.clearCursors(finalAccount);
        await this.linkedAccountRepository.updateAsync(finalAccount);
      }

      logger.info(`[YoutubeImport] Import finished for user ${account.userId}`);
    } else {
      await this.notificationService.notifyAsync(
        account.userId,
        NotificationType.Import,
        "⚠️ Youtube import could not start",
        "Unable to initialize Youtube data import.",
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
        },
      );
      logger.warn(`[YoutubeImport] No notification initialized for user ${account.userId}`);
    }
  }

  private mapContentByType(type: string, item: any, userId: string): UserContent | null {
    const baseContent = new UserContent({
      userId,
      platform: _const.PLATFORMS.YOUTUBE,
    });

    switch (type) {
      case 'Subscriptions':
        baseContent.type = 'subscription';
        baseContent.title = item.snippet.title;
        baseContent.externalId = item.snippet.resourceId.channelId;
        baseContent.metaData = {
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          thumbnails: item.snippet.thumbnails,
        };
        return baseContent;

      case 'Playlists':
        baseContent.type = 'playlist';
        baseContent.title = item.snippet.title;
        baseContent.externalId = item.id;
        baseContent.metaData = {
          playlistId: item.id,
          description: item.snippet.description,
          itemCount: item.contentDetails?.itemCount,
          publishedAt: item.snippet.publishedAt,
          thumbnails: item.snippet.thumbnails,
        };
        return baseContent;

      case 'Activities':
        baseContent.type = 'activity';
        baseContent.title = item.snippet.title;
        baseContent.externalId = item.id;
        baseContent.metaData = {
          publishedAt: item.snippet.publishedAt,
          channelId: item.snippet.channelId,
          description: item.snippet.description,
          thumbnails: item.snippet.thumbnails,
          type: item.snippet.type,
        };
        return baseContent;

      case 'ChannelInfo':
        baseContent.type = 'channel';
        baseContent.title = item.snippet.title;
        baseContent.externalId = item.id;
        baseContent.metaData = {
          description: item.snippet.description,
          publishedAt: item.snippet.publishedAt,
          thumbnails: item.snippet.thumbnails,
          statistics: item.statistics,
        };
        return baseContent;

      default:
        return null;
    }
  }

  private async importPlaylistVideos(
    accessToken: string,
    playlistId: string,
    userId: string,
    importedExternalIds: string[],
  ): Promise<string[]> {
    const playlistVideoIds: string[] = [];
    try {
      logger.debug(`[YoutubeImport] Fetching videos from playlist ${playlistId}`);
      const videos = await this.fetchPlaylistVideos(accessToken, playlistId);
      logger.debug(`[YoutubeImport] Found ${videos.length} videos in playlist ${playlistId}`);

      for (const video of videos) {
        const videoContent = new UserContent({
          userId,
          platform: _const.PLATFORMS.YOUTUBE,
          type: 'playlist_video',
          title: video.snippet.title,
          externalId: video.id,
          metaData: {
            videoId: video.contentDetails.videoId,
            publishedAt: video.snippet.publishedAt,
            description: video.snippet.description,
            thumbnails: video.snippet.thumbnails,
            playlistId,
          },
        });

        try {
          await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
            _const.PLATFORMS.YOUTUBE,
            videoContent.externalId,
          );
          const savedContent = await this.userContentRepository.createAsync(videoContent);
          playlistVideoIds.push(savedContent.externalId);
          const mappedContent = mapToYouTubeContentModel(savedContent);
          this.gateway.emitNewImportContent(userId, _const.PLATFORMS.YOUTUBE, mappedContent);
        } catch (err) {
          logger.error(`[YoutubeImport] Error saving playlist video:`, err.message);
        }
      }
    } catch (err) {
      logger.error(`[YoutubeImport] Error fetching playlist videos for ${playlistId}:`, err.message);
    }
    return playlistVideoIds;
  }

  private async updateNotification(
    notification: NotificationModel | undefined,
    userId: string,
    progressReports: ProgressReports,
  ): Promise<NotificationModel> {
    const reportArray = Object.entries(progressReports).map(([type, report]) => ({
      type,
      ...report,
    }));

    if (!notification) {
      logger.debug(`[YoutubeImport] Creating initial notification`);
      const notificationResult = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        "Importing your Youtube data...",
        "",
        true,
        {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.YOUTUBE,
        },
      );
      return mapToNotificationModel(notificationResult);
    } else {
      logger.debug(`[YoutubeImport] Updating notification with progress`);
      await this.notificationService.updateAsync(notification.id, true, {
        metaData: {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.YOUTUBE,
        },
      });
      return notification;
    }
  }

  private loadCursors(account: any): CursorMap {
    return account.metaData?.importCursors || {};
  }

  private async saveCursors(account: any, cursors: CursorMap): Promise<void> {
    if (!account.metaData) {
      account.metaData = {};
    }
    account.metaData.importCursors = cursors;
    await this.linkedAccountRepository.updateAsync(account);
  }

  private async clearCursors(account: any): Promise<void> {
    if (account.metaData?.importCursors) {
      delete account.metaData.importCursors;
      await this.linkedAccountRepository.updateAsync(account);
    }
  }

  private async callWithRetry<T>(
    config: AxiosRequestConfig,
    retries: number = 5,
  ): Promise<{ data: any; headers: any }> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const url = config.url || '';
        const method = config.method || 'GET';
        logger.info(`[YoutubeImport] API call attempt ${attempt}/${retries}: ${method} ${url}`);

        const response = await axios({
          ...config,
          validateStatus: () => true,
        });

        const quotaHeaders = {
          quotaCost: response.headers['x-quota-cost'] || 'N/A',
          quotaUsage: response.headers['x-ratelimit-remaining'] || 'N/A',
          retryAfter: response.headers['retry-after'] || 'N/A',
        };

        logger.info(
          `[YoutubeImport] API response ${attempt}/${retries}: ${response.status} ` +
          `quotaCost=${quotaHeaders.quotaCost} quotaRemaining=${quotaHeaders.quotaUsage}`
        );

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers['retry-after'] || '0', 10);
          const delay = Math.max(retryAfter * 1000, Math.pow(2, attempt) * 1000);
          logger.warn(
            `[YoutubeImport] HTTP 429 on ${url} attempt ${attempt}/${retries}. ` +
            `Retrying in ${delay}ms. ` +
            `quotaCost=${quotaHeaders.quotaCost} quotaRemaining=${quotaHeaders.quotaUsage}`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          lastError = new Error(`HTTP 429: rate limited`);
          continue;
        }

        if (response.status >= 500) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(
            `[YoutubeImport] HTTP ${response.status} on ${url} attempt ${attempt}/${retries}. ` +
            `Retrying in ${delay}ms`
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        if (response.status >= 400) {
          const body = JSON.stringify(response.data).substring(0, 500);
          throw new Error(`HTTP ${response.status}: ${body}`);
        }

        return { data: response.data, headers: response.headers };
      } catch (err) {
        if (err instanceof AxiosError && err.code === 'ECONNRESET') {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`[YoutubeImport] Connection reset on attempt ${attempt}/${retries}. Retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          lastError = err;
          continue;
        }
        if (err instanceof AxiosError && err.code === 'ETIMEDOUT') {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`[YoutubeImport] Timeout on attempt ${attempt}/${retries}. Retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError || new Error(`Request failed after ${retries} retries`);
  }

  private parseDurationToSeconds(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  private async fetchPlaylistVideos(accessToken: string, playlistId: string): Promise<YoutubePlaylistItem[]> {
    const videos: YoutubePlaylistItem[] = [];
    let nextPageToken: string | null = null;

    logger.debug(`[YoutubeImport] Fetching all videos for playlist ID: ${playlistId}`);

    do {
      const pageResult = await this.fetchPlaylistVideosPage(accessToken, playlistId, nextPageToken);
      for (const item of pageResult.items) {
        videos.push(item);
      }
      nextPageToken = pageResult.nextPageToken;
    } while (nextPageToken);

    logger.debug(`[YoutubeImport] Retrieved ${videos.length} total videos for playlist ${playlistId}`);

    if (videos.length > 0) {
      const videoIds: string[] = [];
      for (const video of videos) {
        const videoId = video.contentDetails?.videoId;
        if (videoId) {
          videoIds.push(videoId);
        }
      }
      if (videoIds.length > 0) {
        for (let i = 0; i < videoIds.length; i += 50) {
          const batchIds = videoIds.slice(i, i + 50);
          const statsResponse = await this.callWithRetry<YoutubeVideosListResponse>({
            method: 'GET',
            url: 'https://www.googleapis.com/youtube/v3/videos',
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              part: 'statistics,contentDetails',
              id: batchIds.join(','),
            },
          });
          const statsItems = statsResponse.data.items ?? [];
          const statsMap = new Map<string, YoutubeVideoStats>();
          for (const statsItem of statsItems) {
            statsMap.set(statsItem.id, {
              statistics: statsItem.statistics,
              duration: statsItem.contentDetails?.duration,
            });
          }
          for (const video of videos) {
            const videoId = video.contentDetails?.videoId;
            if (!videoId) continue;
            const stats = statsMap.get(videoId);
            if (stats) {
              if (!video._stats) {
                video._stats = {
                  viewCount: 0,
                  likeCount: 0,
                  commentCount: 0,
                  duration: 'PT0S',
                };
              }
              video._stats.viewCount = Number(stats.statistics?.viewCount || 0);
              video._stats.likeCount = Number(stats.statistics?.likeCount || 0);
              video._stats.commentCount = Number(stats.statistics?.commentCount || 0);
              video._stats.duration = stats.duration || 'PT0S';
            }
          }
        }
      }
    }

    return videos;
  }

  private async fetchPlaylistVideosPage(
    accessToken: string,
    playlistId: string,
    pageToken: string | null = null,
  ): Promise<YoutubePlaylistItemsPage> {
    const result = await this.callWithRetry<YoutubeApiListResponse>({
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
    const items: YoutubePlaylistItem[] = [];
    for (const raw of rawItems) {
      const snippet = raw['snippet'] as Record<string, unknown> | undefined;
      const contentDetails = raw['contentDetails'] as Record<string, unknown> | undefined;
      items.push({
        id: typeof raw['id'] === 'string' ? raw['id'] : '',
        snippet: snippet ? {
          title: typeof snippet['title'] === 'string' ? snippet['title'] : undefined,
          description: typeof snippet['description'] === 'string' ? snippet['description'] : undefined,
          publishedAt: typeof snippet['publishedAt'] === 'string' ? snippet['publishedAt'] : undefined,
          thumbnails: typeof snippet['thumbnails'] === 'object' && snippet['thumbnails'] !== null
            ? snippet['thumbnails'] as Record<string, { url: string }>
            : undefined,
          channelId: typeof snippet['channelId'] === 'string' ? snippet['channelId'] : undefined,
          channelTitle: typeof snippet['channelTitle'] === 'string' ? snippet['channelTitle'] : undefined,
        } : undefined,
        contentDetails: contentDetails ? {
          videoId: typeof contentDetails['videoId'] === 'string' ? contentDetails['videoId'] : undefined,
        } : undefined,
      });
    }

    return {
      items,
      nextPageToken: typeof result.data.nextPageToken === 'string' ? result.data.nextPageToken : null,
    };
  }
}

