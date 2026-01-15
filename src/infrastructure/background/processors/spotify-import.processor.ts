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
import { mapToSpotifyAlbumModel, mapToSpotifyPlaylistModel, mapToSpotifyShowModel, mapToSpotifyTrackModel } from "../../../domain/mappers/spotify.mapper";
import BullMQConfig from "../../../core/config/bullmq.config";

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

interface SpotifyImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.SPOTIFY_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.SPOTIFY_IMPORT, 5))
export class SpotifyImportProcessor extends WorkerHost {
  private readonly NOTIFICATION_UPDATE_INTERVAL = 10;

  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
    private readonly gateway: ImportGateway,
  ) {
    super();
    logger.info(`[SpotifyImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[SpotifyImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[SpotifyImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[SpotifyImport] Job ${job.id} failed:`, error);
  }

  async process(job: Job<SpotifyImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.SPOTIFY,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[SpotifyImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[SpotifyImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[SpotifyImport] Starting import for user ${account.userId}`);

    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];
    const fields: Record<string, { endpoint: string; type: string }> = {
      playlists: { endpoint: '/v1/me/playlists', type: 'Playlists' },
      tracks: { endpoint: '/v1/me/top/artists', type: 'Tracks' },
      albums: { endpoint: '/v1/me/albums', type: 'Albums' },
      shows: { endpoint: '/v1/me/shows', type: 'Shows' },
    };

    let notification: NotificationModel | undefined;
    let encounteredError = false;
    let itemsProcessedSinceLastNotification = 0;

    for (const [key, { endpoint, type }] of Object.entries(fields)) {
      let offset = parseInt(lastCursors[key] || '0');
      const limit = 50;
      let totalItemsProcessed = 0;
      let total = 0;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        while (true) {
          if (!(await job.isActive())) {
            logger.info(`[SpotifyImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          logger.debug(`[SpotifyImport] Fetching ${type} items with offset ${offset} and limit ${limit}`);

          const response = await axios.get(`https://api.spotify.com${endpoint}`, {
            params: {
              limit,
              offset,
            },
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          const items = response.data.items || [];
          total = response.data.total || 0;

          logger.debug(`[SpotifyImport] Received ${items.length} ${type} items (total: ${total})`);

          if (totalItemsProcessed === 0) {
            progressReports[type].totalItem = total;
          }

          if (items.length === 0) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            break;
          }

          for (const item of items) {
            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.SPOTIFY,
              externalId: item.id,
            });

            logger.debug(`[SpotifyImport] Mapping ${type} item: ${item.name} (${item.id})`);

            if (type === 'Playlists') {
              content.type = 'playlist';
              content.title = item.name;
              content.metaData = {
                description: item.description,
                owner: {
                  name: item.owner?.display_name,
                  id: item.owner?.id,
                  type: item.owner?.type,
                  href: item.owner?.href,
                  externalUrl: item.owner?.external_urls?.spotify,
                },
                public: item.public,
                externalUrl: item.external_urls?.spotify,
                trackCount: item.tracks?.total,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                imageUrl: item.images?.[0]?.url,
              };

              try {
                const savedContent = await this.userContentRepository.createAsync(content);
                importedExternalIds.push(savedContent.externalId);
                const playlist = mapToSpotifyPlaylistModel(savedContent);
                this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.SPOTIFY, playlist);
              } catch (err) {
                logger.error(`[SpotifyImport] Error saving playlist content:`, err.message);
              }

            } else if (type === 'Tracks') {
              content.type = 'track';
              content.title = item.name;
              content.metaData = {
                releaseDate: item.album?.release_date,
                popularity: item.popularity,
                durationMs: item.duration_ms,
                previewUrl: item.preview_url,
                explicit: item.explicit,
                artists: item.artists?.map((artist: any) => ({
                  name: artist.name,
                  type: artist.type,
                  href: artist.href,
                })) || [],
                album: {
                  id: item.album?.id,
                  name: item.album?.name,
                  href: item.album?.href,
                  imageUrl: item.album?.images?.[0]?.url,
                },
                url: item.href,
              };

              try {
                const savedContent = await this.userContentRepository.createAsync(content);
                importedExternalIds.push(savedContent.externalId);
                const track = mapToSpotifyTrackModel(savedContent);
                this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.SPOTIFY, track);
              } catch (err) {
                logger.error(`[SpotifyImport] Error saving track content:`, err.message);
              }

            } else if (type === 'Albums') {
              content.type = 'album';
              content.title = item.name;
              content.metaData = {
                artists: item.artists?.map((artist: any) => ({
                  name: artist.name,
                  type: artist.type,
                  href: artist.href,
                })) || [],
                releaseDate: item.release_date,
                totalTracks: item.total_tracks,
                imageUrl: item.images?.[0]?.url,
                url: item.href,
                externalUrl: item.external_urls?.spotify,
              };

              try {
                const savedContent = await this.userContentRepository.createAsync(content);
                importedExternalIds.push(savedContent.externalId);
                const album = mapToSpotifyAlbumModel(savedContent);
                this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.SPOTIFY, album);
              } catch (err) {
                logger.error(`[SpotifyImport] Error saving album content:`, err.message);
              }

            } else if (type === 'Shows') {
              content.type = 'show';
              content.title = item.name;
              content.externalId = item.id;
              content.metaData = {
                description: item.description,
                explicit: item.explicit,
                htmlDescription: item.html_description,
                show: {
                  availableMarkets: item.show?.available_markets || item.available_markets,
                  copyRights: item.show?.copyrights || item.copyrights || [],
                },
                languages: item.languages,
                mediaType: item.media_type,
                publisher: item.publisher,
                addedOn: item.added_at,
                externalUrl: item.external_urls?.spotify,
                imageUrl: item.images?.[0]?.url,
                totalEpisodes: item.total_episodes,
              };

              try {
                const savedContent = await this.userContentRepository.createAsync(content);
                importedExternalIds.push(savedContent.externalId);
                const show = mapToSpotifyShowModel(savedContent);
                this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.SPOTIFY, show);
              } catch (err) {
                logger.error(`[SpotifyImport] Error saving show content:`, err.message);
              }
            }

            totalItemsProcessed++;
            progressReports[type].itemProcessed = totalItemsProcessed;
            progressReports[type].progressPercent = total > 0
              ? Math.round((totalItemsProcessed / total) * 100)
              : 0;

            itemsProcessedSinceLastNotification++;

            if (itemsProcessedSinceLastNotification >= this.NOTIFICATION_UPDATE_INTERVAL) {
              notification = await this.updateNotification(notification, account.userId, progressReports);
              itemsProcessedSinceLastNotification = 0;
            }
          }

          if (totalItemsProcessed < total) {
            offset += limit;
            lastCursors[key] = offset.toString();
            await this.saveCursors(currentAccount, lastCursors);
          } else {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            logger.debug(`[SpotifyImport] Finished importing all ${type}`);
            break;
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[SpotifyImport] Error occurred while importing ${type}:`, err.message);
        if (offset > 0) {
          lastCursors[key] = offset.toString();
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (!(await job.isActive())) {
      logger.info(`[SpotifyImport] Job ${job.id} was cancelled, rolling back imported content`);

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.SPOTIFY,
            importedExternalIds,
          );
          logger.info(`[SpotifyImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`);
        } catch (rollbackError) {
          logger.error(`[SpotifyImport] Error during rollback:`, rollbackError);
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
            platform: _const.PLATFORMS.SPOTIFY,
          },
          "Spotify import was cancelled and rolled back",
        );
      }
      return;
    }

    const finalAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.SPOTIFY,
      account.userId,
    );

    const finalReportArray = Object.entries(progressReports).map(([type, report]) => ({
      type,
      ...report,
    }));

    if (notification) {
      if (encounteredError) {
        logger.warn(`[SpotifyImport] Completed with issues for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.SPOTIFY,
          },
          "Spotify import completed with issues",
        );
      } else {
        logger.info(`[SpotifyImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.SPOTIFY,
          },
          "Spotify import completed!",
        );
      }

      if (finalAccount) {
        finalAccount.allowImport = true;
        await this.clearCursors(finalAccount);
        await this.linkedAccountRepository.updateAsync(finalAccount);
      }
    } else {
      await this.notificationService.notifyAsync(
        account.userId,
        NotificationType.Import,
        "Spotify import could not start",
        "Unable to initialize Spotify data import.",
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
          platform: _const.PLATFORMS.SPOTIFY,
        },
      );
      logger.warn(`[SpotifyImport] No notification initialized for user ${account.userId}`);
    }
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
      logger.debug(`[SpotifyImport] Creating initial notification`);
      const notificationResult = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        "Importing your Spotify data...",
        "",
        true,
        {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.SPOTIFY,
        },
      );
      return mapToNotificationModel(notificationResult);
    } else {
      logger.debug(`[SpotifyImport] Updating notification with progress`);
      await this.notificationService.updateAsync(notification.id, true, {
        metaData: {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.SPOTIFY,
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
}

