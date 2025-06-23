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
  ) { super() }

  async process(job: Job<{ account: LinkedAccount, accessToken: string }>): Promise<void> {
    const { account, accessToken } = job.data
    const lastCursors: CursorMap = {};

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

    let uploadsPlaylistId: string | null = account.metaData?.channel?.id;
    let notification: NotificationModel;
    let encounteredError = false;

    for (const [key, { endpoint, type, params }] of Object.entries(fields)) {
      let nextPageToken: string | null = null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        do {
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

          if (!nextPageToken) {
            progressReports[type].status = NotificationStatus.Completed;
          }

          if (pageInfo.totalResults) {
            progressReports[type].totalItem = pageInfo.totalResults;
          }

          for (const item of items) {
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
              content.type = 'playlist';
              content.title = item.snippet.title;
              content.externalId
              content.metaData = {
                playlistId: item.id,
                description: item.snippet.description,
                itemCount: item.contentDetails?.itemCount,
                publishedAt: item.snippet.publishedAt,
                thumbnails: item.snippet.thumbnails,
              };

              // Fetch videos for this playlist
              const videos = await this.fetchPlaylistVideos(accessToken, item.id);
              for (const video of videos) {
                let videoContent = new UserContent({
                  userId: account.userId,
                  platform: _const.PLATFORMS.YOUTUBE,
                  type: 'playlist_video',
                  title: video.snippet.title,
                  metaData: {
                    videoId: video.contentDetails.videoId,
                    publishedAt: video.snippet.publishedAt,
                    description: video.snippet.description,
                    thumbnails: video.snippet.thumbnails,
                    playlistId: item.id,
                  },
                });
                // Save videoContent
                await this.userContentRepository.createAsync(videoContent);
                this.gateway.emitNewImportContent(
                  account.userId,
                  _const.PLATFORMS.YOUTUBE,
                  videoContent,
                );
              }
            } else if (type === 'Activities') {
              content.type = 'activity';
              content.title = item.snippet.title;
              content.metaData = {
                publishedAt: item.snippet.publishedAt,
                channelId: item.snippet.channelId,
                description: item.snippet.description,
                thumbnails: item.snippet.thumbnails,
                type: item.snippet.type,
              };
            } else if (type === 'ChannelInfo') {
              content.type = 'channel';
              content.title = item.snippet.title;
              content.metaData = {
                description: item.snippet.description,
                publishedAt: item.snippet.publishedAt,
                thumbnails: item.snippet.thumbnails,
                statistics: item.statistics,
              };
            }

            content = await this.userContentRepository.createAsync(content);
            this.gateway.emitNewImportContent(
              account.userId,
              _const.PLATFORMS.YOUTUBE,
              content,
            );

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

      try {
        const items = await this.fetchPlaylistVideos(accessToken, uploadsPlaylistId);
        progressReports[type] = {
          totalItem: 0,
          itemProcessed: 0,
          progressPercent: 0,
          status: NotificationStatus.InProgress,
        };

        for (const item of items) {
          let content = new UserContent({
            userId: account.userId,
            platform: _const.PLATFORMS.YOUTUBE,
            type: 'uploaded_video',
            title: item.snippet.title,
            metaData: {
              videoId: item.contentDetails.videoId,
              publishedAt: item.snippet.publishedAt,
              description: item.snippet.description,
              thumbnails: item.snippet.thumbnails,
            },
          });

          content = await this.userContentRepository.createAsync(content);
          this.gateway.emitNewImportContent(
            account.userId,
            _const.PLATFORMS.YOUTUBE,
            content,
          );

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
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "⚠️ Youtube import completed with issues",
        );
      } else {
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
    }
  }

  private async fetchPlaylistVideos(accessToken: string, playlistId: string) {
    let videos: any[] = [];
    let nextPageToken: string | null = null;

    do {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
        params: {
          part: 'snippet,contentDetails',
          playlistId,
          maxResults: 50,
          pageToken: nextPageToken ?? undefined,
          access_token: accessToken,
        },
      });

      videos = videos.concat(response.data.items);
      nextPageToken = response.data.nextPageToken ?? null;
    } while (nextPageToken);

    return videos;
  }
}