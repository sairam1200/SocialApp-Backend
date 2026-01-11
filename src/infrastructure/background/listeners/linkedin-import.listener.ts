import axios from "axios";
import { Inject } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
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
import { LinkedInImportEvent } from "../../../domain/events";

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

export class LinkedInImportListener {
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
    logger.info(`[LinkedInImport] Listener initialized`);
  }

  @OnEvent('linkedin.import', { async: true })
  async handleLinkedInImport(event: LinkedInImportEvent): Promise<void> {
    const { account, accessToken } = event.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.LINKEDIN,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[LinkedInImport] Account not found for user ${account.userId}`);
      return;
    }

    if (currentAccount.metaData?.importCancelled) {
      logger.info(`[LinkedInImport] Import cancelled for user ${account.userId}`);
      if (currentAccount.metaData) {
        delete currentAccount.metaData.importCancelled;
      }
      await this.linkedAccountRepository.updateAsync(currentAccount);
      return;
    }

    logger.info(`[LinkedInImport] Starting import for user ${account.userId}`);

    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
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
          const checkAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
            _const.PLATFORMS.LINKEDIN,
            account.userId,
          );
          if (checkAccount?.metaData?.importCancelled) {
            logger.info(`[LinkedInImport] Import cancelled during processing ${type}`);
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
              const savedContent = await this.userContentRepository.createAsync(content);
              this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.LINKEDIN, savedContent);

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

    const finalAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.LINKEDIN,
      account.userId,
    );

    if (finalAccount?.metaData?.importCancelled) {
      logger.info(`[LinkedInImport] Import was cancelled, cleaning up`);
      if (finalAccount.metaData) {
        delete finalAccount.metaData.importCancelled;
      }
      await this.linkedAccountRepository.updateAsync(finalAccount);

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
          "❌ LinkedIn import was cancelled",
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

