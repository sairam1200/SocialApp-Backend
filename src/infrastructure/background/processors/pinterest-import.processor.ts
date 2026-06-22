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
import BullMQConfig from "../../../core/config/bullmq.config";
import { mapToPinterestContentModel } from "../../../domain/mappers/pinterest.mapper";
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

interface PinterestImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.PINTEREST_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.PINTEREST_IMPORT, 2))
export class PinterestImportProcessor extends WorkerHost {
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
    logger.info(`[PinterestImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[PinterestImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[PinterestImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[PinterestImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<PinterestImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.PINTEREST,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[PinterestImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[PinterestImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[PinterestImport] Starting import for user ${account.userId}`);

    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];
    const fields: Record<string, { endpoint: string; type: string }> = {
      boards: { endpoint: '/boards', type: 'Boards' },
      pins: { endpoint: '/pins', type: 'Pins' },
    };

    let notification: NotificationModel | undefined;
    let encounteredError = false;
    let itemsProcessedSinceLastNotification = 0;

    for (const [key, { endpoint, type }] of Object.entries(fields)) {
      let cursor: string | null = lastCursors[key] || null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        while (true) {
          if (!(await job.isActive())) {
            logger.info(`[PinterestImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          if (cursor) {
            logger.debug(`[PinterestImport] Resuming ${type} from cursor: ${cursor.substring(0, 20)}...`);
          }

          const response = await axios.get(`https://api.pinterest.com/v5${endpoint}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            params: {
              bookmark: cursor || undefined,
            },
          });

          const data = response.data;
          const items = data.items || [];

          logger.debug(`[PinterestImport] Retrieved ${items.length} ${type} items`);

          if (items.length === 0 && !data.bookmark) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            break;
          }

          for (const item of items) {
            if (!(await job.isActive())) {
              logger.info(`[PinterestImport] Job ${job.id} cancelled during processing ${type}`);
              progressReports[type].status = NotificationStatus.Cancelled;
              break;
            }

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.PINTEREST,
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
                coverImage: item.media?.image_cover_url,
                updatedAt: item.board_pins_modified_at,
                ownerUserName: item.board_owner?.username,
                thumbnails: item.media?.pin_thumbnail_urls,
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
                ownerUserName: item.board_owner?.username,
                images: item.media?.images,
                creativeType: item.creative_type,
                hasBeenPromoted: item.has_been_promoted,
                createdAt: item.created_at,
                metrics: item.pin_metrics,
                updatedAt: item.updated_at,
              };
            }

            try {
              await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
                _const.PLATFORMS.PINTEREST,
                content.externalId,
              );
              const savedContent = await this.userContentRepository.createAsync(content);
              importedExternalIds.push(savedContent.externalId);
              const mappedContent = mapToPinterestContentModel(savedContent);
              this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.PINTEREST, mappedContent);

              progressReports[type].itemProcessed++;
              itemsProcessedSinceLastNotification++;

              if (itemsProcessedSinceLastNotification >= this.NOTIFICATION_UPDATE_INTERVAL) {
                notification = await this.updateNotification(notification, account.userId, progressReports);
                itemsProcessedSinceLastNotification = 0;
              }
            } catch (err) {
              logger.error(`[PinterestImport] Error saving ${type} content:`, err.message);
            }
          }

          if (data.bookmark) {
            cursor = data.bookmark;
            lastCursors[key] = cursor;
            await this.saveCursors(currentAccount, lastCursors);
          } else {
            logger.info(`[PinterestImport] Completed import of ${type} for user ${account.userId}`);
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[PinterestImport] Error occurred while importing ${type}:`, err.message);
        if (cursor) {
          lastCursors[key] = cursor;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (!(await job.isActive())) {
      logger.info(`[PinterestImport] Job ${job.id} was cancelled, rolling back imported content`);

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.PINTEREST,
            importedExternalIds,
          );
          logger.info(`[PinterestImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`);
        } catch (rollbackError) {
          logger.error(`[PinterestImport] Error during rollback:`, rollbackError);
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
            platform: _const.PLATFORMS.PINTEREST,
          },
          "Pinterest import was cancelled and rolled back",
        );
      }
      return;
    }

    const finalReportArray = Object.entries(progressReports).map(([type, report]) => ({
      type,
      ...report,
    }));

    if (notification) {
      if (encounteredError) {
        logger.warn(`[PinterestImport] Completed with issues for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.PINTEREST,
          },
          "Pinterest import completed with issues",
        );
      } else {
        logger.info(`[PinterestImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.PINTEREST,
          },
          "Pinterest import completed!",
        );
      }

      const finalAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.PINTEREST,
        account.userId,
      );

      if (finalAccount) {
        finalAccount.allowImport = true;
        await this.clearCursors(finalAccount);
        await this.linkedAccountRepository.updateAsync(finalAccount);
      }
    } else {
      await this.notificationService.notifyAsync(
        account.userId,
        NotificationType.Import,
        "Pinterest import could not start",
        "Unable to initialize Pinterest data import.",
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
          platform: _const.PLATFORMS.PINTEREST,
        },
      );
      logger.warn(`[PinterestImport] No notification initialized for user ${account.userId}`);
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
      logger.debug(`[PinterestImport] Creating initial notification`);
      const notificationResult = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        "Importing your Pinterest data...",
        "",
        true,
        {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.PINTEREST,
        },
      );
      return mapToNotificationModel(notificationResult);
    } else {
      logger.debug(`[PinterestImport] Updating notification with progress`);
      await this.notificationService.updateAsync(notification.id, true, {
        metaData: {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.PINTEREST,
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


