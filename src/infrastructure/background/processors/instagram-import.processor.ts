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
import { mapToInstagramContentModel } from "../../../domain/mappers/instagram.mapper";

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

interface InstagramImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.INSTAGRAM_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.INSTAGRAM_IMPORT, 5))
export class InstagramImportProcessor extends WorkerHost {
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
    logger.info(`[InstagramImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[InstagramImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[InstagramImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[InstagramImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<InstagramImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.INSTAGRAM,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[InstagramImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[InstagramImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[InstagramImport] Starting import for user ${account.userId}`);

    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];

    const instagramBusinessAccountId = account.metaData?.instagram_business_account_id || account.externalId;
    const fields: Record<string, { endpoint: string; type: string }> = {
      media: { endpoint: `/${instagramBusinessAccountId}/media`, type: 'Media' },
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
            logger.info(`[InstagramImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          const response = await axios.get(`https://graph.facebook.com/v22.0${endpoint}`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            params: {
              fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count',
              limit: 25,
              after: cursor || undefined,
            },
          });

          const data = response.data;
          const items = data.data || [];

          logger.debug(`[InstagramImport] Retrieved ${items.length} ${type} items`);

          if (items.length === 0 && !data.paging?.cursors?.after) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          }

          for (const item of items) {
            if (!(await job.isActive())) {
              logger.info(`[InstagramImport] Job ${job.id} cancelled during processing ${type}`);
              progressReports[type].status = NotificationStatus.Cancelled;
              break;
            }

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.INSTAGRAM,
              externalId: item.id,
            });

            content.type = 'media';
            content.title = item.caption || `Instagram ${item.media_type}`;
            content.metaData = {
              caption: item.caption,
              mediaType: item.media_type,
              mediaUrl: item.media_url,
              permalink: item.permalink,
              thumbnailUrl: item.thumbnail_url,
              timestamp: item.timestamp,
              username: item.username,
              likeCount: item.like_count,
              commentsCount: item.comments_count,
            };

            try {
              const savedContent = await this.userContentRepository.createAsync(content);
              importedExternalIds.push(savedContent.externalId);
              const mappedContent = mapToInstagramContentModel(savedContent);
              this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.INSTAGRAM, mappedContent);

              progressReports[type].itemProcessed++;
              itemsProcessedSinceLastNotification++;

              if (itemsProcessedSinceLastNotification >= this.NOTIFICATION_UPDATE_INTERVAL) {
                notification = await this.updateNotification(notification, account.userId, progressReports);
                itemsProcessedSinceLastNotification = 0;
              }
            } catch (err: any) {
              logger.error(`[InstagramImport] Error saving ${type} content:`, err.message);
            }
          }

          if (!(await job.isActive())) {
            logger.info(`[InstagramImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          if (data.paging?.cursors?.after) {
            cursor = data.paging.cursors.after;
            lastCursors[key] = cursor;
            await this.saveCursors(currentAccount, lastCursors);
          } else {
            logger.info(`[InstagramImport] Completed import of ${type} for user ${account.userId}`);
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[InstagramImport] Error occurred while importing ${type}:`, err.message);
        if (cursor) {
          lastCursors[key] = cursor;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (!(await job.isActive())) {
      logger.info(`[InstagramImport] Job ${job.id} was cancelled, rolling back imported content`);

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.INSTAGRAM,
            importedExternalIds,
          );
          logger.info(`[InstagramImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`);
        } catch (rollbackError) {
          logger.error(`[InstagramImport] Error during rollback:`, rollbackError);
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
            platform: _const.PLATFORMS.INSTAGRAM,
          },
          "Instagram import was cancelled and rolled back",
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
        logger.warn(`[InstagramImport] Completed with issues for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.INSTAGRAM,
          },
          "Instagram import completed with issues",
        );
      } else {
        logger.info(`[InstagramImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.INSTAGRAM,
          },
          "Instagram import completed!",
        );
      }

      const finalAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.INSTAGRAM,
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
        "Instagram import could not start",
        "Unable to initialize Instagram data import.",
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
          platform: _const.PLATFORMS.INSTAGRAM,
        },
      );
      logger.warn(`[InstagramImport] No notification initialized for user ${account.userId}`);
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
      logger.debug(`[InstagramImport] Creating initial notification`);
      const notificationResult = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        "Importing your Instagram data...",
        "",
        true,
        {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.INSTAGRAM,
        },
      );
      return mapToNotificationModel(notificationResult);
    } else {
      logger.debug(`[InstagramImport] Updating notification with progress`);
      await this.notificationService.updateAsync(notification.id, true, {
        metaData: {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.INSTAGRAM,
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

