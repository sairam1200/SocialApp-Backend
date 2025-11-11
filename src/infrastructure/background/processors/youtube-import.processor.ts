import axios from "axios";
import { Job } from "bullmq";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { UserContent } from "../../../domain/entities/userContent.entity";
import { NotificationStatus, NotificationType } from "../../../domain/enums";
import { LinkedAccount } from "../../../domain/entities/linkedAccount.entity";
import { NotificationModel } from "../../../domain/contracts/notification.model";
import { mapToNotificationModel } from "../../../domain/mappers/notification.mapper";
import { INotificationService } from "../../../domain/services/inotification.service";
import { ImportGateway } from "../../../infrastructure/websocket/gateways/import.gateway";
import { IUserContentRepository } from "../../../domain/repositories/iuserContent.repository";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import { console } from "inspector";

interface CursorMap {
  [key: string]: string | null;
}

export const InjectYoutubeImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.YOUTUBE_IMPORT);

@Processor(_const.BULL_QUEUES.YOUTUBE_IMPORT)
export class YoutubeImportProcessor extends WorkerHost {

  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
    private readonly gateway: ImportGateway,
  ) {
    super()
    logger.info(`[YoutubeImport] Processor initialized`);
  }

  async process(job: Job<{ account: LinkedAccount, accessToken: string }>): Promise<void> {
    console.log("helo:", job)
    const { account, accessToken } = job.data
    const lastCursors: CursorMap = {};

    logger.info(`[RedditImport] Starting import for user ${account.userId}`);
    logger.debug(`[RedditImport] Using access token: ${accessToken}`);

    const progressReports: {
      [type: string]: {
        totalItem: number;
        itemProcessed: number;
        progressPercent: number;
        status: NotificationStatus;
      };
    } = {};

    const fields: Record<string, { endpoint: string; type: string; params?: any }> = {
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
        params: { mine: true, part: 'snippet,contentDetails,statistics' }
      }
    };

    let uploadsPlaylistId: string | null = null;
    let notification: NotificationModel;
    let encounteredError = false;

    for (const [key, { endpoint, type, params }] of Object.entries(fields)) {

      logger.debug(`📥 Fetching ${type} from /${endpoint}`);

      let nextPageToken: string | null = null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        do {

          logger.debug(`🔄 Requesting page with token: ${nextPageToken}`);
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

          logger.debug(`✅ Retrieved ${items.length} items of ${type}`);

          if (!nextPageToken) {
            progressReports[type].status = NotificationStatus.Completed;
          }

          if (pageInfo.totalResults) {
            progressReports[type].totalItem = pageInfo.totalResults;
          }

          for (const item of items) {

            logger.debug(`🧩 Mapping ${type} item: ${item.snippet?.title}`);

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.YOUTUBE,
            });

            // Parsing data by type
            if (type === 'Subscriptions') {
              content.type = 'subscription';
              content.title = item.snippet.title;
              content.externalId = item.snippet.resourceId.channelId;
              content.metaData = {
                description: item.snippet.description,
                publishedAt: item.snippet.publishedAt,
                thumbnails: item.snippet.thumbnails,
              };
            } else if (type === 'Playlists') {
              //logger.debug(JSON.stringify(item, null, 2));
              content.type = 'playlist';
              content.title = item.snippet.title;
              content.externalId = item.id;
              content.metaData = {
                playlistId: item.id,
                description: item.snippet.description,
                itemCount: item.contentDetails?.itemCount,
                publishedAt: item.snippet.publishedAt,
                thumbnails: item.snippet.thumbnails,
              };
              logger.debug(`▶️ Fetching videos from playlist ${item.id}`);
              // Fetch videos for this playlist
              const videos = await this.fetchPlaylistVideos(accessToken, item.id);
              logger.debug(`📹 Found ${videos.length} videos in playlist`);
              for (const video of videos) {
                //logger.debug(`🎥 Processing video: ${JSON.stringify(video, null, 2)}`);
                let videoContent = new UserContent({
                  userId: account.userId,
                  platform: _const.PLATFORMS.YOUTUBE,
                  type: 'playlist_video',
                  title: video.snippet.title,
                  externalId: video.id,
                  metaData: {
                    videoId: video.contentDetails.videoId,
                    publishedAt: video.snippet.publishedAt,
                    description: video.snippet.description,
                    thumbnails: video.snippet.thumbnails,
                    playlistId: item.id,
                  },
                });
                try {
                  videoContent = await this.userContentRepository.createAsync(videoContent);
                  logger.debug("this is the video content: ");
                  //logger.debug(JSON.stringify(videoContent, null, 2));
                  this.gateway.emitNewImportContent(
                    account.userId,
                    _const.PLATFORMS.YOUTUBE,
                    videoContent,
                  );
                } catch (err) {
                  logger.error(`Error saving video content for playlist ${item.id}:`, err.message);
                }
              }
            } else if (type === 'Activities') {
              //logger.debug(`Processing activity item: ${JSON.stringify(item, null, 2)}`);
              content.type = 'activity';
              content.title = item.snippet.title;
              content.externalId = item.id;
              content.metaData = {
                publishedAt: item.snippet.publishedAt,
                channelId: item.snippet.channelId,
                description: item.snippet.description,
                thumbnails: item.snippet.thumbnails,
                type: item.snippet.type,
              };
            } else if (type === 'ChannelInfo') {
              //logger.debug("channel item: ",JSON.stringify(item, null, 2));
              content.type = 'channel';
              content.title = item.snippet.title;
              content.externalId = item.id;
              content.metaData = {
                description: item.snippet.description,
                publishedAt: item.snippet.publishedAt,
                thumbnails: item.snippet.thumbnails,
                statistics: item.statistics,
              };
              uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads || null;
              logger.debug(`📥 the new Uploads playlist ID: ${uploadsPlaylistId}`);
            }
            try {
              content = await this.userContentRepository.createAsync(content);
              this.gateway.emitNewImportContent(
                account.userId,
                _const.PLATFORMS.YOUTUBE,
                content,
              );
            } catch (err) {
              logger.error(`Error saving content for ${type}:`, err.message);
            }

            // Update progress
            progressReports[type].itemProcessed++;
            progressReports[type].progressPercent = progressReports[type].totalItem
              ? Math.round(
                (progressReports[type].itemProcessed /
                  progressReports[type].totalItem) *
                100,
              )
              : 0;

            const reportArray = Object.entries(progressReports).map(([type, report]) => ({
              type,
              ...report,
            }));

            if (!notification) {
              logger.debug(`[yOUTUBEImport] Creating initial notification`);
              logger.debug(`NotificationType.Import: ${NotificationType.Import}`);
              const notificationResult = await this.notificationService.notifyAsync(
                account.userId,
                NotificationType.Import,
                "📥 Importing your Youtube data...",
                "",
                true,
                {
                  status: NotificationStatus.InProgress,
                  reports: reportArray
                }
              );

              notification = mapToNotificationModel(notificationResult);
            } else {
              logger.debug(`[YoutubeImport] Updating notification with progress`);
              await this.notificationService.updateAsync(notification.id, true, {
                metaData: {
                  status: NotificationStatus.InProgress,
                  reports: reportArray,
                },
              });
            }
          }
        } while (nextPageToken);
      } catch (err) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`Error occured while importing Youtube user ${type}:`, err.message);
        if (nextPageToken) {
          lastCursors[type] = nextPageToken;
        }
      }
    }

    // # TODO #: Figure out how to merge this into the main flow
    if (uploadsPlaylistId) {

      const type = "UploadedVideos";
      logger.debug(`🎞️ Processing uploaded videos from playlist ${uploadsPlaylistId}`);

      try {
        const items = await this.fetchPlaylistVideos(accessToken, uploadsPlaylistId);
        progressReports[type] = {
          totalItem: 0,
          itemProcessed: 0,
          progressPercent: 0,
          status: NotificationStatus.InProgress,
        };

        for (const item of items) {
          logger.debug("this is teh item")
          //logger.debug(JSON.stringify(item, null, 2));
          let content = new UserContent({
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
            //logger.debug(JSON.stringify(content, null, 2));
            content = await this.userContentRepository.createAsync(content);
            //logger.debug(JSON.stringify(content, null, 2));
            this.gateway.emitNewImportContent(
              account.userId,
              _const.PLATFORMS.YOUTUBE,
              content,
            );
          } catch (err) {
            logger.error(`Error saving uploaded video content:`, err.message);
          }


          // Update progress
          progressReports[type].itemProcessed++;
          progressReports[type].progressPercent = progressReports[type].totalItem
            ? Math.round(
              (progressReports[type].itemProcessed /
                progressReports[type].totalItem) *
              100,
            )
            : 0;

          const reportArray = Object.entries(progressReports).map(([type, report]) => ({
            type,
            ...report,
          }));

          if (!notification) {
            logger.debug(`[YoutubeImport] Creating initial notification`);
            logger.debug(`NotificationType.Import: ${NotificationType.Import}`);
            const notificationResult = await this.notificationService.notifyAsync(
              account.userId,
              NotificationType.Import,
              "📥 Importing your Youtube data...",
              "",
              true,
              {
                status: NotificationStatus.InProgress,
                reports: reportArray
              }
            );

            notification = mapToNotificationModel(notificationResult);
          } else {
            logger.debug(`[YoutubeImport] Updating notification with progress`);
            await this.notificationService.updateAsync(notification.id, true, {
              metaData: {
                status: NotificationStatus.InProgress,
                reports: reportArray,
              },
            });
          }
        }
      } catch (err) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`Error occured while importing Youtube user ${type}:`, err.message);
      }
    }

    const finalReportArray = Object.entries(progressReports).map(([type, report]) => ({
      type,
      ...report,
    }));

    if (notification) {

      if (encounteredError) {
        logger.warn(`[YoutubeImport] Completed with issues for user ${account.userId}`);
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "⚠️ Youtube import completed with issues",
        );
      } else {
        logger.info(`[YoutubeImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "✅ Youtube import completed!",
        );
      }

      account.allowImport = true;
      await this.linkedAccountRepository.updateAsync(account);

      logger.info(`✔️ YouTube import finished for user ${account.userId}`);

    } else {
      // # TODO #: Handle failed
      await this.notificationService.updateAsync(notification.id,
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
        },
        "⚠️ Youtube import could not start",
      );
      logger.warn(`⚠️ No notification initialized during YouTube import for user ${account.userId}`);
    }
  }

  private async fetchPlaylistVideos(accessToken: string, playlistId: string) {
    let videos: any[] = [];
    let nextPageToken: string | null = null;

    logger.debug(`📡 Fetching videos for playlist ID: ${playlistId}`);

    do {
      try {


        const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
          params: {
            part: 'snippet,contentDetails',
            playlistId,
            maxResults: 50,
            pageToken: nextPageToken ?? undefined,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        videos = videos.concat(response.data.items);
        nextPageToken = response.data.nextPageToken ?? null;
      } catch (err) {
        console.log(`Error fetching videos for playlist ${playlistId}:`, err);
        throw new Error(`Failed to fetch videos for playlist ${playlistId}`);
      }

    } while (nextPageToken);
    logger.debug(`📥 Retrieved ${videos.length} total videos for playlist ${playlistId}`);
    return videos;
  }
}