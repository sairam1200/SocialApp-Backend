import axios from "axios";
import { Job } from "bullmq";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { InjectQueue, Processor } from "@nestjs/bullmq";
import logger from "../../../core/utils/winston.util";
import { OnWorkerEvent, WorkerHost } from "@nestjs/bullmq";
import { NotificationStatus,NotificationType } from "../../../domain/enums";
import { stringUtil } from "../../../core/utils/string.util";
import { UserContent } from "../../../domain/entities/userContent.entity";
import { LinkedAccount } from "../../../domain/entities/linkedAccount.entity";
import { NotificationModel } from "../../../domain/contracts/notification.model";
import { IUserContentRepository } from "domain/repositories/iuserContent.repository";
import { mapToNotificationModel } from "../../../domain/mappers/notification.mapper";
import { INotificationService } from "../../../domain/services/inotification.service";
import { ImportGateway } from "../../../infrastructure/websocket/gateways/import.gateway";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";

interface CursorMap {
  [key: string]: string | null;
}

export const InjectRedditImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.REDDIT_IMPORT);

@Processor(_const.BULL_QUEUES.REDDIT_IMPORT)
export class RedditImportProcessor extends WorkerHost {
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
    logger.info(`[RedditImport] Processor initialized`);
  }

  async process(job: Job<{ account: LinkedAccount; accessToken: string }>): Promise<void> {
    const { account, accessToken } = job.data;
    const lastCursors: CursorMap = {};

    logger.info(`[RedditImport] Starting import for user ${account.userId}`);
    logger.debug(`[RedditImport] Using access token: ${accessToken}`);

    // Step 1: Fetch the Reddit username using the token
    let username: string;
    try {
      const meResponse = await axios.get("https://oauth.reddit.com/api/v1/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
      });
      username = meResponse.data.name;
      logger.info(`[RedditImport] Fetched Reddit username: ${username}`);
    } catch (error: any) {
      logger.error(`[RedditImport] Failed to fetch Reddit username: ${error.message}`);
      return;
    }

    // Step 2: Correct endpoints
    const endpoints = {
      posts: { url: `https://oauth.reddit.com/user/${username}/submitted`, type: "Posts" },
      comments: { url: `https://oauth.reddit.com/user/${username}/comments`, type: "Comments" },
      saved: { url: `https://oauth.reddit.com/user/${username}/saved`, type: "Saved" },
    };

    const progressReports: Record<string, any> = {};
    let notification: NotificationModel;
    let encounteredError = false;
    
    const initialReports = Object.entries(progressReports).map(([type, report]) => ({
      type,
      ...report,
    }));
    
    try {
      const notificationResult = await this.notificationService.notifyAsync(
        account.userId,
        NotificationType.Import,
        "Importing your Reddit data...",
        "",
        true,
        {
          type: NotificationType.Import,
          status: NotificationStatus.InProgress,
          reports: initialReports,
        }
      );
      notification = mapToNotificationModel(notificationResult);
      logger.debug(`[RedditImport] Created initial notification before import loop`);
    } catch (err) {
      logger.error(`[RedditImport] Failed to create notification: ${err.message}`);
    }
    
    for (const [key, { url, type }] of Object.entries(endpoints)) {
      let after: string | null = null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      logger.info(`[RedditImport] Starting import of ${type} for user ${account.userId}`);

      try {
        while (true) {
          logger.debug(`[RedditImport] Fetching ${type} with cursor: ${after || "none"}`);
          
          const response = await axios.get(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            },
            params: after ? { limit: 100, after } : { limit: 100 },
          });

          const items = response.data.data.children;
          after = response.data.data.after;

          logger.debug(`[RedditImport] Retrieved ${items.length} ${type} items, next cursor: ${after}`);

          if (progressReports[type].totalItem === 0) {
            progressReports[type].totalItem = response.data.data.dist || items.length;
          }
          
          
          for (const item of items) {
            const data = item.data;

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.REDDIT,
              externalId: data.id,
            });

            content.type = key;
            content.title = stringUtil.trimWithEllipsis(data.title || data.body || data.link_title || "Reddit Content");
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

            content = await this.userContentRepository.createAsync(content);
            logger.debug(`[RedditImport] Saved ${type} content with ID: ${content.externalId}`);

            this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.REDDIT, content);
            logger.debug(`[RedditImport] Emitted new ${type} content for user ${account.userId}`);

            progressReports[type].itemProcessed++;
            progressReports[type].progressPercent = progressReports[type].totalItem
              ? Math.round((progressReports[type].itemProcessed / progressReports[type].totalItem) * 100)
              : 0;

            const reportArray = Object.entries(progressReports).map(([type, report]) => ({
              type,
              ...report,
            }));

            if (!notification) {
              logger.debug(`[RedditImport] Creating initial notification`);
              logger.debug(`NotificationType.Import: ${NotificationType.Import}`);
              const notificationResult = await this.notificationService.notifyAsync(
                account.userId,
                NotificationType.Import,
                "Importing your Reddit data...",
                "",
                true,
                {
                  type: NotificationType.Import,
                  status: NotificationStatus.InProgress,
                  reports: reportArray,
                }
              );
              notification = mapToNotificationModel(notificationResult);
            } else {
              logger.debug(`[RedditImport] Updating notification with progress`);
              await this.notificationService.updateAsync(notification.id, true, {
                  status: NotificationStatus.InProgress,
                  reports: reportArray,
              });
            }
          }

          if (!after) {
            logger.info(`[RedditImport] Completed import of ${type} for user ${account.userId}`);
            progressReports[type].status = NotificationStatus.Completed;
            break;
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`[RedditImport] Error importing ${type}: ${err.message}`);
        logger.debug(`[RedditImport] Full Reddit error response for ${type}: ${JSON.stringify(err.response?.data || {}, null, 2)}`);
        lastCursors[type] = after;
        continue;
      }
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
          { status: NotificationStatus.Completed, reports: finalReportArray },
          "Reddit import completed with issues"
        );
      } else {
        logger.info(`[RedditImport] Successfully completed import for user ${account.userId}`);
        await this.notificationService.updateAsync(
          notification.id,
          false,
          { status: NotificationStatus.Completed, reports: finalReportArray },
          "Reddit import completed!"
        );
      }

      account.allowImport = true;
      await this.linkedAccountRepository.updateAsync(account);
      logger.debug(`[RedditImport] Updated account to allow import: ${account.id}`);
    } else {
    
      logger.error(`[RedditImport] Notification not created. Import likely failed to start.`);
      await this.notificationService.updateAsync(
        notification?.id ?? "",
        false,
        { status: NotificationStatus.Cancelled, reports: finalReportArray },
        "Reddit import could not start"
      );
      
    }
  }

  @OnWorkerEvent("active")
  onActive(job: Job) {
    logger.info(`Reddit import active: ${job.id}`);
  }

  @OnWorkerEvent("completed")
  onCompleted(job: Job) {
    logger.info(`Reddit import completed: ${job.id}`);
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job) {
    logger.info(`Reddit import failed: ${job.id}`);
  }
}
