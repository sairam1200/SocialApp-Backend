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
import { stringUtil } from "../../../core/utils/string.util";
import BullMQConfig from "../../../core/config/bullmq.config";
import { mapToRedditContentModel } from "../../../domain/mappers/reddit.mapper";
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

interface RedditImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.REDDIT_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.REDDIT_IMPORT, 2))
export class RedditImportProcessor extends WorkerHost {
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
    logger.info(`[RedditImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[RedditImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[RedditImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[RedditImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<RedditImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.REDDIT,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[RedditImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[RedditImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[RedditImport] Starting import for user ${account.userId}`);
    logger.debug(`[RedditImport] Using access token: ${accessToken.substring(0, 20)}...`);

    const username = account.userName;
    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];

    const endpoints = {
      posts: { url: `https://oauth.reddit.com/user/${username}/submitted`, type: "Posts" },
      comments: { url: `https://oauth.reddit.com/user/${username}/comments`, type: "Comments" },
      saved: { url: `https://oauth.reddit.com/user/${username}/saved`, type: "Saved" },
    };

    let notification: NotificationModel | undefined;
    let encounteredError = false;
    let itemsProcessedSinceLastNotification = 0;

    for (const [key, { url, type }] of Object.entries(endpoints)) {
      let after: string | null = lastCursors[key] || null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      logger.info(`[RedditImport] Starting import of ${type} for user ${account.userId}`);

      try {
        while (true) {
          if (!(await job.isActive())) {
            logger.info(`[RedditImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          if (after) {
            logger.debug(`[RedditImport] Resuming ${type} from cursor: ${after.substring(0, 20)}...`);
          }

          logger.debug(`[RedditImport] Fetching ${type} with cursor: ${after || "none"}`);

          const response = await axios.get(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            },
            params: after ? { limit: 100, after } : { limit: 100 },
          });

          const items = response.data.data.children || [];
          after = response.data.data.after;

          logger.debug(`[RedditImport] Retrieved ${items.length} ${type} items, next cursor: ${after}`);

          if (progressReports[type].totalItem === 0) {
            progressReports[type].totalItem = response.data.data.dist || items.length;
          }

          if (items.length === 0 && !after) {
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            break;
          }

          for (const item of items) {
            if (!(await job.isActive())) {
              logger.info(`[RedditImport] Job ${job.id} cancelled during processing ${type}`);
              progressReports[type].status = NotificationStatus.Cancelled;
              break;
            }

            const data = item.data;

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.REDDIT,
              externalId: data.id,
            });

            content.type = key;
            content.title = stringUtil.trimWithEllipsis(data.title ?? data.body ?? data.link_title);
            content.metaData = {
              subreddit: data.subreddit,
              score: data.score,
              createdUtc: data.created_utc,
              permalink: data.permalink,
              url: data.url,
              body: data.body,
              title: data.title,
              kind: item.kind,
              parentId: data.parent_id,
              linkId: data.link_id,
            };

            try {
              await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
                _const.PLATFORMS.REDDIT,
                content.externalId,
              );
              const savedContent = await this.userContentRepository.createAsync(content);
              importedExternalIds.push(savedContent.externalId);
              const mappedContent = mapToRedditContentModel(savedContent);
              this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.REDDIT, mappedContent);

              progressReports[type].itemProcessed++;
              progressReports[type].progressPercent = progressReports[type].totalItem
                ? Math.round((progressReports[type].itemProcessed / progressReports[type].totalItem) * 100)
                : 0;

              itemsProcessedSinceLastNotification++;

              if (itemsProcessedSinceLastNotification >= this.NOTIFICATION_UPDATE_INTERVAL) {
                notification = await this.updateNotification(notification, account.userId, progressReports);
                itemsProcessedSinceLastNotification = 0;
              }
            } catch (err) {
              logger.error(`[RedditImport] Error saving ${type} content:`, err.message);
            }
          }

          if (!after) {
            logger.info(`[RedditImport] Completed import of ${type} for user ${account.userId}`);
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          } else {
            lastCursors[key] = after;
            await this.saveCursors(currentAccount, lastCursors);
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[RedditImport] Error importing ${type}: ${err.message}`);
        if (after) {
          lastCursors[key] = after;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (!(await job.isActive())) {
      logger.info(`[RedditImport] Job ${job.id} was cancelled, rolling back imported content`);

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.REDDIT,
            importedExternalIds,
          );
          logger.info(`[RedditImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`);
        } catch (rollbackError) {
          logger.error(`[RedditImport] Error during rollback:`, rollbackError);
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
            platform: _const.PLATFORMS.REDDIT,
          },
          "❌ Reddit import was cancelled and rolled back",
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
        logger.warn(`[RedditImport] Completed with issues for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.REDDIT,
          },
          "Reddit import completed with issues",
        );
      } else {
        logger.info(`[RedditImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.REDDIT,
          },
          "Reddit import completed!",
        );
      }

      const finalAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.REDDIT,
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
        "Reddit import could not start",
        "Unable to initialize Reddit data import.",
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
          platform: _const.PLATFORMS.REDDIT,
        },
      );
      logger.warn(`[RedditImport] No notification initialized for user ${account.userId}`);
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
      logger.debug(`[RedditImport] Creating initial notification`);
      const notificationResult = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        "Importing your Reddit data...",
        "",
        true,
        {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.REDDIT,
        },
      );
      return mapToNotificationModel(notificationResult);
    } else {
      logger.debug(`[RedditImport] Updating notification with progress`);
      await this.notificationService.updateAsync(notification.id, true, {
        metaData: {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.REDDIT,
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
