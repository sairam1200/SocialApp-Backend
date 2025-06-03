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

export const InjectRedditImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.REDDIT_IMPORT);

interface RedditListingResponse {
  data: {
    after: string | null;
    children: any[];
    dist: number;
  };
}

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
  ) { super() }

  async process(job: Job<{ account: LinkedAccount, accessToken: string }>): Promise<void> {
    const { account, accessToken } = job.data;

    const redditEndpoints = {
      posts: 'https://oauth.reddit.com/user/me/submitted',
      comments: 'https://oauth.reddit.com/user/me/comments',
      saved: 'https://oauth.reddit.com/user/me/saved',
    };

    const progressReports: Record<string, { totalItem: number; itemProcessed: number; progressPercent: number; status: NotificationStatus }> = {};
    let notification: NotificationModel | null = null;
    let encounteredError = false;

    for (const [type, url] of Object.entries(redditEndpoints)) {
      let after: string | null = null;
      let totalItemsProcessed = 0;
      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        do {
          const response = await axios.get<RedditListingResponse>(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'User-Agent': 'YourAppName/1.0',
            },
            params: {
              limit: 100,
              after,
            },
          });

          const data = response.data.data;
          if (totalItemsProcessed === 0) {
            progressReports[type].totalItem = data.dist || 0; // Reddit doesn’t provide total, fallback to dist or 0
          }

          for (const child of data.children) {
            const item = child.data;

            const content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.REDDIT,
              externalId: item.id,
              type: type === 'posts' ? 'post' : (type === 'comments' ? 'comment' : 'saved'),
              title: item.title || item.link_title || '',
              metaData: {
                subreddit: item.subreddit,
                subredditId: item.subreddit_id,
                author: item.author,
                createdUtc: item.created_utc,
                permalink: `https://reddit.com${item.permalink}`,
                url: item.url,
                score: item.score,
                numComments: item.num_comments,
                body: item.body, // for comments and saved items
                isSaved: item.saved,
                isHidden: item.hidden,
                // add more fields if needed
              }
            });

            await this.userContentRepository.createAsync(content);

            // Emit to gateway (adjust if you have a Reddit mapper, else send raw content)
            this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.REDDIT, content);

            totalItemsProcessed++;
            progressReports[type].itemProcessed = totalItemsProcessed;
            progressReports[type].progressPercent = progressReports[type].totalItem ? Math.round((totalItemsProcessed / progressReports[type].totalItem) * 100) : 0;

            const reportArray = Object.entries(progressReports).map(([type, report]) => ({
              type,
              ...report,
            }));

            if (!notification) {
              const notificationResult = await this.notificationService.notifyAsync(
                account.userId,
                "📥 Importing your Reddit data...",
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

          after = data.after;
        } while (after);

        progressReports[type].status = NotificationStatus.Completed;

      } catch (error: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`Error importing Reddit ${type}:`, error.message);
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
          "⚠️ Reddit import completed with issues",
        );
      } else {
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "✅ Reddit import completed!",
        );
      }
      account.allowImport = true;
      await this.linkedAccountRepository.updateAsync(account);

    } else {
      await this.notificationService.updateAsync(notification!.id,
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
        },
        "⚠️ Reddit import could not start",
      );
    }

    logger.info(`Reddit import for user ${account.userId} has been processed.`);
  }
}
