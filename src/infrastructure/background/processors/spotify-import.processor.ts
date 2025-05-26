import axios from "axios";
import { Job } from "bullmq";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { NotificationStatus } from "../../../domain/enums";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { UserContent } from "../../../domain/entities/userContent.entity";
import { LinkedAccount } from "../../../domain/entities/linkedAccount.entity";
import { NotificationModel } from "../../../domain/contracts/notification.model";
import { mapToNotificationModel } from "../../../domain/mappers/notification.mapper";
import { INotificationService } from "../../../domain/services/inotification.service";
import { ImportGateway } from "../../../infrastructure/websocket/gateways/import.gateway";
import { IUserContentRepository } from "../../../domain/repositories/iuserContent.repository";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import { mapToSpotifyAlbumModel, mapToSpotifyPlaylistModel, mapToSpotifyTrackModel } from "../../../domain/mappers/spotify.mapper";

interface CursorMap {
  [key: string]: string | null;
}

export const InjectSpotifyImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.SPOTIFY_IMPORT);

@Processor(_const.BULL_QUEUES.SPOTIFY_IMPORT)
export class SpotifyImportProcessor extends WorkerHost {

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

    const { account, accessToken } = job.data;
    const lastCursors: CursorMap = {};

    const fields: Record<string, { endpoint: string; type: string }> = {
      playlists: { endpoint: '/v1/me/playlists', type: 'Playlists' },
      tracks: { endpoint: '/v1/me/top/artists', type: 'Tracks' },
      albums: { endpoint: '/v1/me/albums', type: 'Albums' },
      shows: { endpoint: '/v1/me/shows', type: 'Shows' },
    };

    const progressReports: {
      [type: string]: {
        totalItem: number;
        itemProcessed: number;
        progressPercent: number;
        status: NotificationStatus;
      };
    } = {};

    let notification: NotificationModel;
    let encounteredError = false;

    for (const [key, { endpoint, type }] of Object.entries(fields)) {
      let offset = 0;
      const limit = 50;
      let totalItemsProcessed = 0;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        while (true) {
          const response = await axios.get(`https://api.spotify.com/v1/me${endpoint}`, {
            params: {
              limit,
              offset,
            },
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });

          const items = response.data.items;
          const total = response.data.total;

          if (totalItemsProcessed === 0) {
            progressReports[type].totalItem = total;
          }

          console.log(`Fetched ${items.length} items from ${type}`);

          for (const item of items) {
            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.SPOTIFY,
              externalId: item.id,
            });

            if (type === 'Playlists') {
              content.type = 'playlist';
              content.title = item.name;
              content.metaData = {
                description: item.description,
                owner: {
                  name: item.owner.display_name,
                  id: item.owner.id,
                  type: item.owner.type,
                  href: item.owner.href,
                  externalUrl: item.owner.external_urls.spotify,
                },
                public: item.public,
                externalUrl: item.external_urls.spotify,
                trackCount: item.tracks.total,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                imageUrl: item.images[0]?.url,
              };

              content = await this.userContentRepository.createAsync(content);

              const playlist = mapToSpotifyPlaylistModel(content);
              this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.SPOTIFY, playlist);

            } else if (type === 'Tracks') {
              content.type = 'track';
              content.title = item.name;
              content.metaData = {
                releaseDate: item.album.release_date,
                popularity: item.popularity,
                durationMs: item.duration_ms,
                previewUrl: item.preview_url,
                explicit: item.explicit,
                artists: item.artists.map(artist => ({
                  name: artist.name,
                  type: artist.type,
                  href: artist.href,
                })),
                album: {
                  id: item.album.id,
                  name: item.album.name,
                  href: item.album.href,
                  imageUrl: item.album.images[0]?.url,
                },
                url: item.href,
              };
              content = await this.userContentRepository.createAsync(content);

              const track = mapToSpotifyTrackModel(content);
              this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.SPOTIFY, track);

            } else if (type === 'Albums') {
              content.type = 'album';
              content.title = item.name;
              content.metaData = {
                artists: item.artists.map(artist => ({
                  name: artist.name,
                  type: artist.type,
                  href: artist.href,
                })),
                releaseDate: item.release_date,
                totalTracks: item.total_tracks,
                imageUrl: item.images[0]?.url,
                url: item.href,
                externalUrl: item.external_urls.spotify,
              };

              content = await this.userContentRepository.createAsync(content);
              const album = mapToSpotifyAlbumModel(content);
              this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.SPOTIFY, album);
            } else if (type === 'Shows') {
              
            }

            // Update progress counts
            totalItemsProcessed++;
            progressReports[type].itemProcessed = totalItemsProcessed;
            progressReports[type].progressPercent = Math.round(
              (totalItemsProcessed / total) * 100
            );

            // Convert object to array for metadata
            const reportArray = Object.entries(progressReports).map(([type, report]) => ({
              type,
              ...report,
            }));

            if (!notification) {
              const notificationResult = await this.notificationService.notifyAsync(
                account.userId,
                "📥 Importing your Spotify data...",
                "",
                true,
                {
                  status: NotificationStatus.InProgress,
                  reports: reportArray,
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

          if (totalItemsProcessed < total) {
            offset += limit;
          } else {
            progressReports[type].status = NotificationStatus.Completed;
            break; // No more pages
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`Error occurred while importing Spotify user ${type}:`, err.message);

        if (offset > 0) {
          lastCursors[type] = offset.toString();
        }
        continue;
      }
    }

    const finalReportArray = Object.entries(progressReports).map(([type, report]) => ({
      type,
      ...report,
    }));

    if (notification) {

      if (encounteredError) {
        //account.c
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "⚠️ Spotify import completed with issues",
        );
      } else {
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "✅ Spotify import completed!",
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
        "⚠️ Spotify import could not start",
      );
    }

    logger.info(`Spotify import for user ${account.userId} has been processed.`);
  }
}