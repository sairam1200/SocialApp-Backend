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

interface CursorMap {
  [key: string]: string | null;
}

export const InjectPinterestImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.PINTEREST_IMPORT);

@Processor(_const.BULL_QUEUES.PINTEREST_IMPORT)
export class PinterestImportProcessor extends WorkerHost {

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
      boards: { endpoint: '/me/boards', type: 'Boards' },
      pins: { endpoint: '/me/pins', type: 'Pins' },
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
      let cursor: string | null = lastCursors[key] || null;

      try {
        while (true) {
          const response = await axios.get(`https://api.pinterest.com/v5${endpoint}`, {
            params: {
              access_token: accessToken,
              bookmark: cursor || undefined,
            },
          });

          const data = response.data;
          const items = data.items;

          progressReports[type] = {
            totalItem: 0,
            itemProcessed: 0,
            progressPercent: 0,
            status: NotificationStatus.InProgress
          };


          console.log(`Fetched ${items.length} items from ${type}`);

          for (const item of items) {
            let content = new UserContent({
              userId: account.userId,
              platform: 'pinterest',
              externalId: item.id,
            });

            if (type === 'Boards') {
              content.type = 'board';
              content.title = item.title;
              content.metaData = {
                privacy: item.privacy,
                description: item.description,
                createdAt: item.created_at,
                pinCount: item.pin_count,
                followerCount: item.follower_count,
                coverImage: item.media.image_cover_url,
                updatedAt: item.board_pins_modified_at,
                ownerUserName: item.board_owner.username,
                thumbnails: item.media.pin_thumbnail_urls,
                collaboratorCount: item.collaborator_count,
              };
            } else if (type === 'Pins') {
              content.type = 'pin';
              content.title = item.title;
              content.metaData = {
                description: item.description,
                imageUrl: item.image_url,
                boardId: item.board_id,
                altText: item.alt_text,
                isOwner: item.is_owner,
                parentPinId: item.parent_pin_id,
                note: item.note,
                isStandard: item.is_standard,
                ownerUserName: item.board_owner.username,
                images: item.media.images,
                creativeType: item.creative_type,
                hasBeenPromoted: item.has_been_promoted,
                createdAt: item.created_at,
                metrics: item.pin_metrics,
                updatedAt: item.updated_at,
              };
            }

            content = await this.userContentRepository.createAsync(content);
            this.gateway.emitNewImportContent(account.userId, 'pinterest', content);
            progressReports[type].itemProcessed++;
            progressReports[type].progressPercent = Math.round(
              (progressReports[type].itemProcessed / progressReports[type].totalItem) * 100,
            );

            const reportArray = Object.entries(progressReports).map(([type, report]) => ({
              type,
              ...report,
            }));

            if (!notification) {
              const notificationResult = await this.notificationService.notifyAsync(
                account.userId,
                '📥 Importing your Pinterest data...',
                '',
                true,
                {
                  status: NotificationStatus.InProgress,
                  reports: reportArray,
                },
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

          if (data.bookmark) {
            cursor = data.bookmark;
          } else {
            progressReports[type].status = NotificationStatus.Completed;
            break; // no more pages
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`Error occurred while importing Pinterest user ${type}:`, err.message);
        if (cursor) {
          lastCursors[key] = cursor;
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
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "⚠️ Pinterest import completed with issues",
        );
      } else {
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "✅ Pinterest import completed!",
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
        "⚠️ Pinterest import could not start",
      );
    }
  }
}