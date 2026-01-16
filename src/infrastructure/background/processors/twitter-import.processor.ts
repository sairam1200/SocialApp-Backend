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
import { mapToLikedTweetModel, mapToUserTweetModel } from "../../../domain/mappers/twitter.mapper";
import { stringUtil } from "../../../core/utils/string.util";
import BullMQConfig from "../../../core/config/bullmq.config";
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

interface TwitterImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.TWITTER_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.TWITTER_IMPORT, 5))
export class TwitterImportProcessor extends WorkerHost {
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
    logger.info(`[TwitterImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[TwitterImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[TwitterImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[TwitterImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<TwitterImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    const currentAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
      _const.PLATFORMS.TWITTER,
      account.userId,
    );

    if (!currentAccount) {
      logger.error(`[TwitterImport] Account not found for user ${account.userId}`);
      return;
    }

    if (!(await job.isActive())) {
      logger.info(`[TwitterImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[TwitterImport] Starting import for user ${account.userId}`);

    const progressReports: ProgressReports = {};
    const lastCursors: CursorMap = this.loadCursors(currentAccount);
    const importedExternalIds: string[] = [];
    const fields: Record<string, { endpoint: string; type: string }> = {
      tweets: { endpoint: `${account.externalId}/tweets`, type: 'Tweets' },
      liked_tweets: { endpoint: `${account.externalId}/liked_tweets`, type: 'Liked Tweets' },
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
            logger.info(`[TwitterImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

          if (cursor) {
            logger.debug(`[TwitterImport] Resuming ${type} from cursor: ${cursor.substring(0, 20)}...`);
          }

          const url = `https://api.twitter.com/2/users/${endpoint}`;
          const headers = { Authorization: `Bearer ${accessToken}` };
          const params = {
            max_results: 100,
            pagination_token: cursor || undefined,
          };

          const response = await this.fetchDataWithRateLimit(url, headers, params);
          if (!response) {
            logger.warn(`[TwitterImport] No response for ${type}, skipping`);
            break;
          }

          const items = response.data || [];
          cursor = response.meta?.next_token || null;

          logger.debug(`[TwitterImport] Retrieved ${items.length} ${type} items, next cursor: ${cursor || 'none'}`);

          if (progressReports[type].totalItem === 0) {
            progressReports[type].totalItem = response.meta?.result_count || items.length || 0;
          }

          for (const item of items) {
            if (!(await job.isActive())) {
              logger.info(`[TwitterImport] Job ${job.id} cancelled during processing ${type}`);
              progressReports[type].status = NotificationStatus.Cancelled;
              break;
            }

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.TWITTER,
              externalId: item.id,
            });

            content.type = key;
            content.title = stringUtil.trimWithEllipsis(item.text || item.title || "Twitter Content", 100);
            content.metaData = {
              text: item.text,
              edit_history_tweet_ids: item.edit_history_tweet_ids,
            };

            try {
              await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
                _const.PLATFORMS.TWITTER,
                content.externalId,
              );
              const savedContent = await this.userContentRepository.createAsync(content);
              importedExternalIds.push(savedContent.externalId);
              if (type === 'Tweets') {
                const twitterContent = mapToUserTweetModel(savedContent);
                this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.TWITTER, twitterContent);
              } else if (type === 'Liked Tweets') {
                const twitterContent = mapToLikedTweetModel(savedContent);
                this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.TWITTER, twitterContent);
              }

              progressReports[type].itemProcessed++;
              progressReports[type].progressPercent = progressReports[type].totalItem
                ? Math.round((progressReports[type].itemProcessed / progressReports[type].totalItem) * 100)
                : 0;

              itemsProcessedSinceLastNotification++;

              if (itemsProcessedSinceLastNotification >= this.NOTIFICATION_UPDATE_INTERVAL) {
                notification = await this.updateNotification(notification, account.userId, progressReports);
                itemsProcessedSinceLastNotification = 0;
              }
            } catch (err: any) {
              logger.error(`[TwitterImport] Error saving ${type} content:`, err.message);
            }
          }

          if (!cursor) {
            logger.info(`[TwitterImport] Completed import of ${type} for user ${account.userId}`);
            progressReports[type].status = NotificationStatus.Completed;
            delete lastCursors[key];
            await this.saveCursors(currentAccount, lastCursors);
            break;
          }

          lastCursors[key] = cursor;
          await this.saveCursors(currentAccount, lastCursors);
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[TwitterImport] Error occurred while importing ${type}:`, err.message);
        if (cursor) {
          lastCursors[key] = cursor;
          await this.saveCursors(currentAccount, lastCursors);
        }
      }
    }

    if (!(await job.isActive())) {
      logger.info(`[TwitterImport] Job ${job.id} was cancelled, rolling back imported content`);

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.TWITTER,
            importedExternalIds,
          );
          logger.info(`[TwitterImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`);
        } catch (rollbackError) {
          logger.error(`[TwitterImport] Error during rollback:`, rollbackError);
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
            platform: _const.PLATFORMS.TWITTER,
          },
          "Twitter import was cancelled and rolled back",
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
        logger.warn(`[TwitterImport] Completed with issues for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.TWITTER,
          },
          "Twitter import completed with issues",
        );
      } else {
        logger.info(`[TwitterImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.TWITTER,
          },
          "Twitter import completed!",
        );
      }

      const finalAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.TWITTER,
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
        "Twitter import could not start",
        "Unable to initialize Twitter data import.",
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
          platform: _const.PLATFORMS.TWITTER,
        },
      );
      logger.warn(`[TwitterImport] No notification initialized for user ${account.userId}`);
    }
  }

  private async fetchDataWithRateLimit(url: string, headers: any, params: any): Promise<any> {
    try {
      const response = await axios.get(url, { headers, params });
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.status === 429) {
        const resetTime = parseInt(error.response.headers["x-rate-limit-reset"], 10);
        const waitTime = Math.max(resetTime * 1000 - Date.now(), 5000);

        logger.warn(`[TwitterImport] Rate limit exceeded for ${url}. Waiting for ${waitTime}ms before retrying.`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.fetchDataWithRateLimit(url, headers, params);
      }

      if (error.response?.status === 403) {
        logger.warn(`[TwitterImport] Skipping ${url}: Forbidden (no permission).`);
        return null;
      }

      logger.error(`[TwitterImport] Error fetching ${url}:`, error.message);
      throw error;
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
      logger.debug(`[TwitterImport] Creating initial notification`);
      const notificationResult = await this.notificationService.notifyAsync(
        userId,
        NotificationType.Import,
        "Importing your Twitter data...",
        "",
        true,
        {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.TWITTER,
        },
      );
      return mapToNotificationModel(notificationResult);
    } else {
      logger.debug(`[TwitterImport] Updating notification with progress`);
      await this.notificationService.updateAsync(notification.id, true, {
        metaData: {
          status: NotificationStatus.InProgress,
          reports: reportArray,
          platform: _const.PLATFORMS.TWITTER,
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

