import axios from "axios";
import { Job } from "bullmq";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { InjectQueue, Processor } from "@nestjs/bull";
import logger from "../../../core/utils/winston.util";
import { OnWorkerEvent, WorkerHost } from "@nestjs/bullmq";
import { stringUtil } from "../../../core/utils/string.util";
import { UserContent } from "../../../domain/entities/userContent.entity";
import { NotificationStatus, NotificationType } from "../../../domain/enums";
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

export const InjectFacebookImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.FACEBOOK_IMPORT);
@Processor(_const.BULL_QUEUES.FACEBOOK_IMPORT)
export class FacebookImportProcessor extends WorkerHost {

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

    const { account, accessToken } = job.data
    const lastCursors: CursorMap = {};

    const fields: Record<string, { endpoint: string; type: string }> = {
      posts: { endpoint: '/me/posts', type: 'Posts' },
      likes: { endpoint: '/me/likes', type: 'Likes' },
      events: { endpoint: '/me/events', type: 'Events' },
      // events: { endpoint: '/me/group', type: 'Groups' },
    };

    const progressReports: {
      [type: string]: {
        totalItem: number;
        itemProcessed: number;
        status: NotificationStatus;
        progressPercent: number;
      };
    } = {};

    let notification: NotificationModel;
    let encounteredError = false;

    for (const [key, { endpoint, type }] of Object.entries(fields)) {
      let cursor: string | null = null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        while (true) {
          const response = await axios.get(`https://graph.facebook.com/v19.0${endpoint}`, {
            params: {
              summary: true,
              access_token: accessToken,
              after: cursor || undefined,
            },
          });

          const data = response.data;
          const items = data.data;
          const paging = data.paging;
          const summary = data.summary;

          if (summary?.total_count) {
            progressReports[type].totalItem = summary.total_count;
          }

          console.log(`Fetched ${items.length} items from ${type}`);

          for (const item of items) {

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.FACEBOOK,
              externalId: item.id,
            });

            if (type === 'Posts') {
              content.type = "post";
              content.title = item.name ?? stringUtil.trimWithEllipsis(item.message);
              content.metaData = {
                from: item.from,
                link: item.link,
                type: item.type,
                story: item.story,
                message: item.message,
                reactions: item.reactions.summary,
                likesCount: item.likes?.summary?.total_count,
                commentCount: item.comments?.length,
                permalinkUrl: item.permalink_url,
                sharesCount: item.shares?.count,
                statusType: item.status_type,
                createdAt: item.created_time,
                updatedAt: item.updated_time,
                isPopular: item.is_popular,
                isHidden: item.is_hidden,
                picture: item.picture,
                via: item.via,
              };
            } else if (key === 'Likes') {
              content.type = "likes";
              content.title = item.name;
              content.metaData = {
                category: item.category,
                createdAt: item.created_time,
              }
            } else if (key === 'Events') {
              content.type = "events";
              content.title = item.name;
              content.metaData = {
                startDate: item.start_time,
                endDate: item.end_time,
                description: item.description,
                place: item.place,
                owner: item.owner,
                attendingCount: item.attending_count,
                interestedCount: item.interested_count,
                declinedCount: item.declined_count,
                maybeCount: item.maybe_count,
                noreplyCount: item.noreply_count,
                isCanceled: item.is_canceled,
                isPageOwned: item.is_page_owned,
                guestListEnabled: item.guest_list_enabled,
                timezone: item.timezone,
                type: item.type,
                updatedDate: item.updated_time,
              }
            }

            content = await this.userContentRepository.createAsync(content);
            this.gateway.emitNewImportContent(account.userId, _const.PLATFORMS.FACEBOOK, content);

            // Update progress counts
            progressReports[type].itemProcessed++;
            progressReports[type].progressPercent = progressReports[type].totalItem
              ? Math.round((progressReports[type].itemProcessed / progressReports[type].totalItem) * 100)
              : 0;

            // Convert object to array for metadata
            const reportArray = Object.entries(progressReports).map(([type, report]) => ({
              type,
              ...report,
            }));

            if (!notification) {
              const notificationResult = await this.notificationService.notifyAsync(
                account.userId,
                NotificationType.Import,
                "📥 Importing your Facebook data...",
                "",
                true,
                {
                  status: NotificationStatus.InProgress,
                  reports: reportArray
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

          if (paging?.cursors?.after) {
            cursor = paging.cursors.after;
          } else {
            progressReports[type].status = NotificationStatus.Completed;
            break; // no more pages
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;
        logger.error(`Error occured while importing Facebook user ${type}:`, err.message);
        if (cursor) {
          lastCursors[type] = cursor;
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
          "⚠️ Facebook import completed with issues",
        );
      } else {
        await this.notificationService.updateAsync(notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          "✅ Facebook import completed!",
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
        "⚠️ Facebook import could not start",
      );
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`Active ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`Completed ${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    logger.info(`Failed ${job.id}`);
  }

}