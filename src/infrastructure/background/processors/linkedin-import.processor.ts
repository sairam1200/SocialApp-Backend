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
import { mapToLinkedInContentModel } from "../../../domain/mappers/linkedin.mapper";
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

interface LinkedInImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.LINKEDIN_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.LINKEDIN_IMPORT, 2))
export class LinkedInImportProcessor extends WorkerHost {
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
    logger.info(`[LinkedInImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[LinkedInImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[LinkedInImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[LinkedInImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<LinkedInImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.LINKEDIN,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[LinkedInImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[LinkedInImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[LinkedInImport] Starting import for user ${account.userId}`);

    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];
    const fields: Record<string, { endpoint: string; type: string }> = {
      posts: { endpoint: '/people/~/shares', type: 'Posts' },
      profile: { endpoint: '/people/~', type: 'Profile' },
    };

    let notification: NotificationModel | undefined;
    let encounteredError = false;
    let itemsProcessedSinceLastNotification = 0;

    for (const [key, { endpoint, type }] of Object.entries(fields)) {
      let cursor: number | null = lastCursors[key] ? parseInt(lastCursors[key] as string, 10) : null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        while (true) {
          if (!(await job.isActive())) {
            logger.info(`[LinkedInImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          const response = await axios.get(`https://api.linkedin.com/v2${endpoint}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
            params: {
              count: 50,
              start: cursor || 0,
            },
          });

          const data = response.data;
          const items = data.elements || (type === 'Profile' ? [data] : []);

          logger.debug(`[LinkedInImport] Retrieved ${items.length} ${type} items`);

          if (items.length === 0) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          }

          for (const item of items) {
            if (!(await job.isActive())) {
              logger.info(`[LinkedInImport] Job ${job.id} cancelled during processing ${type}`);
              progressReports[type].status = NotificationStatus.Cancelled;
              break;
            }

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.LINKEDIN,
              externalId: item.id || item.urn || `${type}-${account.userId}`,
            });

            if (type === 'Posts') {
              content.type = 'post';
              content.title = item.text?.text || item.commentary?.text || 'LinkedIn Post';
              content.metaData = {
                activity: item.activity,
                author: item.author,
                created: item.created,
                lastModified: item.lastModified,
                commentary: item.commentary || item.text?.text || '',
              };
            } else if (type === 'Profile') {
              content.type = 'profile';
              content.title = `${item.localizedFirstName || ''} ${item.localizedLastName || ''}`.trim() || 'LinkedIn Profile';
              content.metaData = {
                firstName: item.localizedFirstName,
                lastName: item.localizedLastName,
                headline: item.headline,
                profilePicture: item.profilePicture,
              };
            }

            try {
              await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
                _const.PLATFORMS.LINKEDIN,
                content.externalId,
              );
              const savedContent = await this.userContentRepository.createAsync(content);
              importedExternalIds.push(savedContent.externalId);
              const mappedContent = mapToLinkedInContentModel(savedContent);
              this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.LINKEDIN, mappedContent);

              progressReports[type].itemProcessed++;
              itemsProcessedSinceLastNotification++;

              if (itemsProcessedSinceLastNotification >= this.NOTIFICATION_UPDATE_INTERVAL) {
                notification = await this.updateNotification(notification, account.userId, progressReports);
                itemsProcessedSinceLastNotification = 0;
              }
            } catch (err: any) {
              logger.error(`[LinkedInImport] Error saving ${type} content:`, err.message);
            }
          }

          if (!(await job.isActive())) {
            logger.info(`[LinkedInImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          if (data.paging && data.paging.start + items.length < (data.paging.count || 0)) {
            cursor = data.paging.start + items.length;
            lastCursors[key] = cursor.toString();
            await this.saveCursors(currentAccount, lastCursors);
          } else {
            logger.info(`[LinkedInImport] Completed import of ${type} for user ${account.userId}`);
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[LinkedInImport] Error occurred while importing ${type}:`, err.message);
        if (cursor !== null) {
          lastCursors[key] = cursor.toString();
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (!(await job.isActive())) {
      logger.info(`[LinkedInImport] Job ${job.id} was cancelled, rolling back imported content`);

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.LINKEDIN,
            importedExternalIds,
          );
          logger.info(`[LinkedInImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`);
        } catch (rollbackError) {
          logger.error(`[LinkedInImport] Error during rollback:`, rollbackError);
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
            platform: _const.PLATFORMS.LINKEDIN,
          },
          "❌ LinkedIn import was cancelled and rolled back",
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
        logger.warn(`[LinkedInImport] Completed with issues for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.LINKEDIN,
          },
          "⚠️ LinkedIn import completed with issues",
        );
      } else {
        logger.info(`[LinkedInImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.LINKEDIN,
          },
          "✅ LinkedIn import completed!",
        );
      }

      const finalAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.LINKEDIN,
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
        "⚠️ LinkedIn import could not start",
        "Unable to initialize LinkedIn data import.",
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
          platform: _const.PLATFORMS.LINKEDIN,
        },
      );
      logger.warn(`[LinkedInImport] No notification initialized for user ${account.userId}`);
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
      logger.debug(`[LinkedInImport] Creating initial notification`);
      const notificationResult = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        "Importing your LinkedIn data...",
        "",
        true,
        {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.LINKEDIN,
        },
      );
      return mapToNotificationModel(notificationResult);
    } else {
      logger.debug(`[LinkedInImport] Updating notification with progress`);
      await this.notificationService.updateAsync(notification.id, true, {
        metaData: {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.LINKEDIN,
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

