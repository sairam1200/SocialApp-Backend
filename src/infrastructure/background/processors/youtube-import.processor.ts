import axios from "axios";
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

interface YoutubeImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.YOUTUBE_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.YOUTUBE_IMPORT, 5))
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
        params: { mine: true, part: 'snippet,contentDetails' }
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
          const response = await axios.get(
            `https://www.googleapis.com/youtube/v3/${endpoint}`,
            {
              params: {
                ...params,
                pageToken: nextPageToken ?? undefined,
                access_token: accessToken,
              },
            },
          );

          const items = response.data.items ?? [];
          const pageInfo = response.data.pageInfo ?? {};
          nextPageToken = response.data.nextPageToken ?? null;

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

  private async fetchPlaylistVideos(accessToken: string, playlistId: string): Promise<any[]> {
    let videos: any[] = [];
    let nextPageToken: string | null = null;

    logger.debug(`[YoutubeImport] Fetching all videos for playlist ID: ${playlistId}`);

    do {
      const pageResult = await this.fetchPlaylistVideosPage(accessToken, playlistId, nextPageToken);
      videos = videos.concat(pageResult.items);
      nextPageToken = pageResult.nextPageToken;
    } while (nextPageToken);

    logger.debug(`[YoutubeImport] Retrieved ${videos.length} total videos for playlist ${playlistId}`);
    return videos;
  }

  private async fetchPlaylistVideosPage(
    accessToken: string,
    playlistId: string,
    pageToken: string | null = null,
  ): Promise<{ items: any[]; nextPageToken: string | null }> {
    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
        params: {
          part: 'snippet,contentDetails',
          playlistId,
          maxResults: 50,
          pageToken: pageToken ?? undefined,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return {
        items: response.data.items || [],
        nextPageToken: response.data.nextPageToken || null,
      };
    } catch (err) {
      logger.error(`[YoutubeImport] Error fetching videos for playlist ${playlistId}:`, err);
      throw new ApplicationException(`Failed to fetch videos for playlist ${playlistId}`);
    }
  }
}

