import axios from 'axios';
import { Job } from 'bullmq';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import {
  InjectQueue,
  Processor,
  OnWorkerEvent,
  WorkerHost,
} from '@nestjs/bullmq';
import logger from '../../../core/utils/winston.util';
import { stringUtil } from '../../../core/utils/string.util';
import { UserContent } from '../../../domain/entities/userContent.entity';
import { NotificationStatus, NotificationType } from '../../../domain/enums';
import { LinkedAccount } from '../../../domain/entities/linkedAccount.entity';
import { NotificationModel } from '../../../domain/contracts/notification.model';
import { IUserContentRepository } from 'domain/repositories/iuserContent.repository';
import { mapToNotificationModel } from '../../../domain/mappers/notification.mapper';
import { INotificationService } from '../../../domain/services/inotification.service';
import { ImportGateway } from '../../../infrastructure/websocket/gateways/import.gateway';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';

interface CursorMap {
  [key: string]: string | null;
}

function extractParams(nextUrl: string): Record<string, string> {
  try {
    const urlObj = new URL(nextUrl);
    const params: Record<string, string> = {};
    for (const [key, value] of urlObj.searchParams.entries()) {
      params[key] = value;
    }
    return params;
  } catch (e) {
    logger.warn(`[FacebookImport] Failed to parse next URL: ${nextUrl}`);
    return {};
  }
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
  ) {
    super();
    logger.info(`[FacebookImport] Processor initialized`);
  }

  async process(
    job: Job<{ account: LinkedAccount; accessToken: string }>,
  ): Promise<void> {
    const { account, accessToken } = job.data;
    const lastCursors: CursorMap = {};

    logger.info(`[FacebookImport] Starting import for user ${account.userId}`);
    logger.debug(`[FacebookImport] Using access token: ${accessToken}`);

    const progressReports: {
      [type: string]: {
        totalItem: number;
        itemProcessed: number;
        status: NotificationStatus;
        progressPercent: number;
      };
    } = {};

    const fields: Record<
      string,
      { endpoint: string; type: string; deprecated?: boolean }
    > = {
      feed: {
        endpoint: `/me?fields=${this.getFieldsForType('Feed')}`,
        type: 'Feed',
      },
      // likes: { endpoint: `/me?fields=${this.getFieldsForType('Likes')}`, type: 'Likes' },
    };

    let notification: NotificationModel;
    let encounteredError = false;

    for (const [key, { endpoint, type, deprecated }] of Object.entries(
      fields,
    )) {
      logger.debug(`📥 Fetching ${type} from /${endpoint}`);
      if (deprecated) {
        logger.warn(
          `[FacebookImport] Skipping deprecated endpoint: ${endpoint}`,
        );
        continue;
      }

      let nextPageParams: Record<string, string> | null = null;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        while (true) {
          const requestUrl = `https://graph.facebook.com/v23.0${endpoint}`;
          const params: any = {
            access_token: accessToken,
            limit: 100,
            ...(nextPageParams || {}),
          };

          if (endpoint.includes('?fields=')) {
            const originalFields = endpoint.split('?fields=')[1];
            params.fields = originalFields; // force back correct feed fields
          }

          const response = await axios.get(requestUrl, { params });
          const data = response.data;

          let items: any[] = [];
          let paging: any = null;

          if (type === 'Feed') {
            items = data.feed?.data || [];
            paging = data.feed?.paging;
          } else if (type === 'Likes') {
            items = data.likes?.data || [];
            paging = data.likes?.paging;
          }

          // Only set totalItem from summary if available, otherwise don't guess
          if (data.summary?.total_count && !progressReports[type].totalItem) {
            progressReports[type].totalItem = data.summary.total_count;
          }

          for (const item of items) {
            logger.debug(`🧩 Mapping ${type} item: ${item.name || item.id}`);

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.FACEBOOK,
              externalId: item.id,
            });

            if (type === 'Feed') {
              content.type = 'feed';
              content.title =
                item.name ??
                stringUtil.trimWithEllipsis(
                  item.message ?? item.story ?? 'Facebook Post',
                );
              content.metaData = {
                from: item.from,
                link: item.link,
                type: item.type,
                story: item.story,
                message: item.message,
                reactions: item.reactions,
                commentCount: item.comments?.length,
                permalinkUrl: item.permalink_url,
                sharesCount: item.shares?.count,
                createdAt: item.created_time,
                updatedAt: item.updated_time,
                isPopular: item.is_popular,
                isHidden: item.is_hidden,
                picture: item.full_picture,
                via: item.via,
              };
            } else if (type === 'Likes') {
              content.type = 'likes';
              content.title = item.name;
              content.metaData = {
                category: item.category,
                createdAt: item.created_time,
              };
            }

            content = await this.userContentRepository.createAsync(content);
            this.gateway.emitNewImportContent(
              account.userId,
              _const.PLATFORMS.FACEBOOK,
              content,
            );

            // Update progress counts
            progressReports[type].itemProcessed++;

            if (progressReports[type].totalItem > 0) {
              progressReports[type].progressPercent = Math.min(
                Math.round(
                  (progressReports[type].itemProcessed /
                    progressReports[type].totalItem) *
                    100,
                ),
                100,
              );
            }

            // Convert object to array for metadata
            const reportArray = Object.entries(progressReports).map(
              ([type, report]) => ({
                type,
                ...report,
              }),
            );

            if (!notification) {
              const notificationResult =
                await this.notificationService.notifyAsync(
                  account.userId,
                  NotificationType.Import,
                  '📥 Importing your Facebook data...',
                  '',
                  true,
                  {
                    status: NotificationStatus.InProgress,
                    reports: reportArray,
                  },
                );

              notification = mapToNotificationModel(notificationResult);
              logger.info('facebook notification', notification);
            } else {
              await this.notificationService.updateAsync(
                notification.id,
                true,
                {
                  metaData: {
                    status: NotificationStatus.InProgress,
                    reports: reportArray,
                  },
                },
              );
            }
          }

          if (paging?.next) {
            nextPageParams = extractParams(paging.next);
          } else {
            progressReports[type].status = NotificationStatus.Completed;
            break;
          }
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;

        const errorDetails = {
          message: err.message,
          stack: err.stack,
          url: `https://graph.facebook.com/v23.0${endpoint}`,
          params: nextPageParams,
          responseData: err.response?.data,
          status: err.response?.status,
          headers: err.response?.headers,
        };

        logger.error(
          `[FacebookImport] Error importing ${type} for user ${account.userId}`,
          errorDetails,
        );

        if (nextPageParams) {
          lastCursors[type] = JSON.stringify(nextPageParams);
        }
      }
    }

    const finalReportArray = Object.entries(progressReports).map(
      ([type, report]) => ({
        type,
        ...report,
      }),
    );

    logger.info('Facebook final report:', finalReportArray);

    if (notification) {
      if (encounteredError) {
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          '⚠️ Facebook import completed with issues',
        );
      } else {
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
          },
          '✅ Facebook import completed!',
        );
      }

      account.allowImport = true;
      await this.linkedAccountRepository.updateAsync(account);
    } else {
      // TODO #: Handle failed
      await this.notificationService.notifyAsync(
        account.userId,
        NotificationType.Import,
        '⚠️ Facebook import could not start',
        'Unable to initialize Facebook data import.',
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
        },
      );
    }
  }

  private getFieldsForType(type: string): string {
    switch (type) {
      case 'Feed':
        return `feed{
        id,
        name,
        message,
        story,
        created_time,
        updated_time,
        type,
        status_type,
        from,
        link,
        full_picture,
        permalink_url,
        is_popular,
        is_hidden,
        via,
        shares,
        reactions,
        comments
      }`;
      case 'Likes':
        return `likes{
        id,
        name,
        category,
        created_time,
        about,
        link
      }`;
      default:
        return 'id,name';
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
