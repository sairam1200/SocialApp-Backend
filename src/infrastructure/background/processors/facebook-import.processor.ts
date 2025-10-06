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

    logger.info(`[FacebookImport] Starting import for user ${account.userId}`);

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
        endpoint: `/me`,
        type: 'Feed',
      },
      // likes: { endpoint: `/me?fields=${this.getFieldsForType('Likes')}`, type: 'Likes' },
    };

    let notification: NotificationModel;
    let encounteredError = false;

    for (const [key, { endpoint, type, deprecated }] of Object.entries(
      fields,
    )) {
      logger.debug(`📥 Fetching ${type} from ${endpoint}`);
      if (deprecated) {
        logger.warn(
          `[FacebookImport] Skipping deprecated endpoint: ${endpoint}`,
        );
        continue;
      }

      const requestUrl = `https://graph.facebook.com/v23.0${endpoint}`;
      let nextPageParams: Record<string, string> | null = null;
      let currentRequestLoop = 0;

      progressReports[type] = {
        totalItem: 0,
        itemProcessed: 0,
        progressPercent: 0,
        status: NotificationStatus.InProgress,
      };

      try {
        while (true) {
          // Stop fetching once we reach 100 posts
          if (progressReports[type].itemProcessed >= 100) {
            logger.info(
              `[FacebookImport] Reached 100 posts limit for ${type}, stopping further fetches.`,
            );
            break;
          }

          const params: any = {
            access_token: accessToken,
            ...(nextPageParams || {}),
            fields: `${type.toLowerCase()}.limit(100){${this.getFieldsForType(type)}}`,
          };
          const headers = { Authorization: `Bearer ${accessToken}` };

          const response = await this.fetchDataWithRateLimit(
            requestUrl,
            headers,
            params,
          );
          const data = response.data;

          let facebookContents: any[] = [];
          let paging: any = null;

          if (type === 'Feed') {
            facebookContents = data.feed?.data || [];
            paging = data.feed?.paging;
          } else if (type === 'Likes') {
            facebookContents = data.likes?.data || [];
            paging = data.likes?.paging;
          }

          for (const facebookContent of facebookContents) {
            if (progressReports[type].itemProcessed >= 100) {
              logger.info(
                `[FacebookImport] Hit 100-post limit inside ${type} page, stopping.`,
              );
              break;
            }
            logger.debug(
              `🧩 Mapping ${type} item: ${facebookContent.name || facebookContent.id}`,
            );

            let content = new UserContent({
              userId: account.userId,
              platform: _const.PLATFORMS.FACEBOOK,
              externalId: facebookContent.id,
            });

            if (type === 'Feed') {
              content.type = 'feed';
              content.title =
                facebookContent.name ??
                stringUtil.trimWithEllipsis(
                  facebookContent.message ??
                    facebookContent.story ??
                    'Facebook Post',
                );
              content.metaData = {
                from: facebookContent.from,
                link: facebookContent.link,
                type: facebookContent.type,
                story: facebookContent.story,
                message: facebookContent.message,
                reactions: facebookContent.reactions,
                commentCount: facebookContent.comments?.length,
                permalinkUrl: facebookContent.permalink_url,
                sharesCount: facebookContent.shares?.count,
                createdAt: facebookContent.created_time,
                updatedAt: facebookContent.updated_time,
                isPopular: facebookContent.is_popular,
                isHidden: facebookContent.is_hidden,
                picture: facebookContent.full_picture,
                via: facebookContent.via,
              };
            } else if (type === 'Likes') {
              content.type = 'likes';
              content.title = facebookContent.name;
              content.metaData = {
                category: facebookContent.category,
                createdAt: facebookContent.created_time,
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

          if (progressReports[type].itemProcessed >= 100) break;

          if (paging?.next) {
            nextPageParams = extractParams(paging.next);
          } else {
            progressReports[type].status = NotificationStatus.Completed;
            break;
          }
          currentRequestLoop++;
        }
      } catch (err: any) {
        encounteredError = true;
        progressReports[type].status = NotificationStatus.Cancelled;

        const errorDetails = {
          message: err.message,
          stack: err.stack,
          url: requestUrl,
          params: nextPageParams,
          responseData: err.response?.data,
          status: err.response?.status,
          headers: err.response?.headers,
        };

        logger.error(
          `[FacebookImport] Error importing ${type} for user ${account.userId}`,
          errorDetails,
        );
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
        return `
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
        comments`;
      case 'Likes':
        return `
        id,
        name,
        category,
        created_time,
        about,
        link
      `;
      default:
        return 'id,name';
    }
  }

  async fetchDataWithRateLimit(
    url: string,
    headers: any,
    params: any,
    attempt = 1,
  ) {
    try {
      const response = await axios.get(url, { headers, params });

      const usage = response.headers['x-app-usage']
        ? JSON.parse(response.headers['x-app-usage'])
        : null;

      if (usage) {
        const { call_count, total_time, total_cputime } = usage;
        if (call_count > 80 || total_time > 80 || total_cputime > 80) {
          const waitTime = 15 * 60_000; // 15 min
          logger.warn(
            `[FacebookImport] High app usage detected (${JSON.stringify(
              usage,
            )}). Backing off ${waitTime / 1000}s before next call.`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }

      return response;
    } catch (error: any) {
      const status = error.response?.status;
      const fbError = error.response?.data?.error;

      if (status === 429) {
        const resetTime = parseInt(
          error.response.headers['x-rate-limit-reset'],
          10,
        );
        const waitTime = isNaN(resetTime)
          ? 60_000
          : Math.max(resetTime * 1000 - Date.now(), 5000);

        logger.warn(
          `[FacebookImport] Rate limit (429) hit for ${url}. Waiting ${
            waitTime / 1000
          }s before retrying...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.fetchDataWithRateLimit(url, headers, params, attempt + 1);
      }

      if (status === 403 && fbError?.code === 4) {
        const waitTime = Math.min(15 * 60 * 1000, attempt * 60_000);
        logger.warn(
          `[FacebookImport] App-level rate limit (403 code=4) hit for ${url}. Backing off ${
            waitTime / 1000
          }s (attempt ${attempt})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.fetchDataWithRateLimit(url, headers, params, attempt + 1);
      }

      if (status === 403) {
        logger.warn(
          `[FacebookImport] Skipping ${url}: Forbidden (no permission or scope missing).`,
        );
        return null;
      }

      logger.error(
        `[FacebookImport] Error fetching ${url} (status ${status || 'N/A'}): ${
          error.message
        }`,
        { fbError, headers: error.response?.headers },
      );
      throw error;
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
