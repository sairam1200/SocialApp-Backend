import axios from 'axios';
import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { UserContent } from '../../../domain/entities/userContent.entity';
import { NotificationStatus, NotificationType } from '../../../domain/enums';
import { NotificationModel } from '../../../domain/contracts/notification.model';
import { mapToNotificationModel } from '../../../domain/mappers/notification.mapper';
import { INotificationService } from '../../../domain/services/inotification.service';
import { ImportGateway } from '../../../infrastructure/websocket/gateways/import.gateway';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import BullMQConfig from '../../../core/config/bullmq.config';
import { mapToTikTokContentModel } from '../../../domain/mappers/tiktok.mapper';
import { IContentStreamRepository } from '../../../domain/repositories/icontentStream.repository';

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

interface TiktokImportJobData {
  account: any;
  accessToken: string;
}

@Processor(
  _const.BULL_QUEUES.TIKTOK_IMPORT,
  BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.TIKTOK_IMPORT, 2),
)
export class TiktokImportProcessor extends WorkerHost {
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
    logger.info(`[TiktokImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[TiktokImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[TiktokImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[TiktokImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<TiktokImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.TIKTOK,
        account.userId,
      );

    if (!currentAccount) {
      logger.error(
        `[TiktokImport] Account not found for user ${account.userId}`,
      );
      return;
    }

    if (!(await job.isActive())) {
      logger.info(
        `[TiktokImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`,
      );
      return;
    }

    logger.info(`[TiktokImport] Starting import for user ${account.userId}`);

    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];

    const fields: Record<string, { endpoint: string; type: string }> = {
      videos: { endpoint: '/video/list/', type: 'Videos' },
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
            logger.info(
              `[TiktokImport] Job ${job.id} cancelled during processing ${type}`,
            );
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          const response = await axios.post(
            `https://open.tiktokapis.com/v2${endpoint}`,
            {
              max_count: 20,
              cursor: cursor || undefined,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            },
          );

          const data = response.data?.data || {};
          const items = data.videos || [];
          cursor = data.cursor || null;

          logger.debug(
            `[TiktokImport] Retrieved ${items.length} ${type} items`,
          );

          if (items.length === 0 && !cursor) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          }

          for (const item of items) {
            if (!(await job.isActive())) {
              logger.info(
                `[TiktokImport] Job ${job.id} cancelled during processing ${type}`,
              );
              progressReports[type].status = NotificationStatus.Cancelled;
              break;
            }

            const content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.TIKTOK,
              externalId: item.id || item.video_id,
            });

            content.type = 'video';
            content.title =
              item.title || item.video_description || `TikTok Video ${item.id}`;
            content.metaData = {
              videoId: item.id || item.video_id,
              videoDescription: item.video_description,
              videoDuration: item.video_duration,
              coverImageUrl: item.cover_image_url,
              shareUrl: item.share_url,
              embedUrl: item.embed_url,
              likeCount: item.like_count,
              commentCount: item.comment_count,
              shareCount: item.share_count,
              viewCount: item.view_count,
              createTime: item.create_time,
            };

            try {
              await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
                _const.PLATFORMS.TIKTOK,
                content.externalId,
              );
              const savedContent =
                await this.userContentRepository.createAsync(content);
              importedExternalIds.push(savedContent.externalId);
              const mappedContent = mapToTikTokContentModel(savedContent);
              this.gateway.emitNewImportContent(
                account.userId,
                _const.PLATFORMS.TIKTOK,
                mappedContent,
              );

              progressReports[type].itemProcessed++;
              itemsProcessedSinceLastNotification++;

              if (
                itemsProcessedSinceLastNotification >=
                this.NOTIFICATION_UPDATE_INTERVAL
              ) {
                notification = await this.updateNotification(
                  notification,
                  account.userId,
                  progressReports,
                );
                itemsProcessedSinceLastNotification = 0;
              }
            } catch (err: any) {
              logger.error(
                `[TiktokImport] Error saving ${type} content:`,
                err.message,
              );
            }
          }

          if (!(await job.isActive())) {
            logger.info(
              `[TiktokImport] Job ${job.id} cancelled during processing ${type}`,
            );
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          if (cursor) {
            lastCursors[key] = cursor;
            await this.saveCursors(currentAccount, lastCursors);
          } else {
            logger.info(
              `[TiktokImport] Completed import of ${type} for user ${account.userId}`,
            );
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(
          `[TiktokImport] Error occurred while importing ${type}:`,
          err.message,
        );
        if (cursor) {
          lastCursors[key] = cursor;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (!(await job.isActive())) {
      logger.info(
        `[TiktokImport] Job ${job.id} was cancelled, rolling back imported content`,
      );

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.TIKTOK,
            importedExternalIds,
          );
          logger.info(
            `[TiktokImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`,
          );
        } catch (rollbackError) {
          logger.error(`[TiktokImport] Error during rollback:`, rollbackError);
        }
      }

      if (notification) {
        const finalReportArray = Object.entries(progressReports).map(
          ([type, report]) => ({
            type,
            ...report,
          }),
        );
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Cancelled,
            reports: finalReportArray,
            platform: _const.PLATFORMS.TIKTOK,
          },
          'TikTok import was cancelled and rolled back',
        );
      }
      return;
    }

    const finalReportArray = Object.entries(progressReports).map(
      ([type, report]) => ({
        type,
        ...report,
      }),
    );

    if (notification) {
      if (encounteredError) {
        logger.warn(
          `[TiktokImport] Completed with issues for user ${account.userId}`,
        );
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.TIKTOK,
          },
          'TikTok import completed with issues',
        );
      } else {
        logger.info(
          `[TiktokImport] Successfully completed import for user ${account.userId}`,
        );
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.TIKTOK,
          },
          'TikTok import completed!',
        );
      }

      const finalAccount =
        await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
          _const.PLATFORMS.TIKTOK,
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
        '⚠️ TikTok import could not start',
        'Unable to initialize TikTok data import.',
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
          platform: _const.PLATFORMS.TIKTOK,
        },
      );
      logger.warn(
        `[TiktokImport] No notification initialized for user ${account.userId}`,
      );
    }
  }

  private async updateNotification(
    notification: NotificationModel | undefined,
    userId: string,
    progressReports: ProgressReports,
  ): Promise<NotificationModel> {
    const reportArray = Object.entries(progressReports).map(
      ([type, report]) => ({
        type,
        ...report,
      }),
    );

    if (!notification) {
      logger.debug(`[TiktokImport] Creating initial notification`);
      const notificationResult = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        'Importing your TikTok data...',
        '',
        true,
        {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.TIKTOK,
        },
      );
      return mapToNotificationModel(notificationResult);
    } else {
      logger.debug(`[TiktokImport] Updating notification with progress`);
      await this.notificationService.updateAsync(notification.id, true, {
        metaData: {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.TIKTOK,
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
