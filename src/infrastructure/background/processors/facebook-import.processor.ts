import axios from 'axios';
import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { UserContent } from '../../../domain/entities/userContent.entity';
import { NotificationStatus, NotificationType } from '../../../domain/enums';
import { NotificationModel } from '../../../domain/contracts/notification.model';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { mapToNotificationModel } from '../../../domain/mappers/notification.mapper';
import { INotificationService } from '../../../domain/services/inotification.service';
import { ImportGateway } from '../../../infrastructure/websocket/gateways/import.gateway';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import BullMQConfig from '../../../core/config/bullmq.config';
import { mapUserContentToFacebookOnlineModel } from '../../../domain/mappers/facebook.mapper';
import { IContentStreamRepository } from '../../../domain/repositories/icontentStream.repository';

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

interface FacebookImportJobData {
  account: any;
  accessToken: string;
}

@Processor(_const.BULL_QUEUES.FACEBOOK_IMPORT, BullMQConfig.getWorkerOptions(_const.BULL_QUEUES.FACEBOOK_IMPORT, 5))
export class FacebookImportProcessor extends WorkerHost {
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
    logger.info(`[FacebookImport] Processor initialized`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    logger.info(`[FacebookImport] Processing job ${job.id}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    logger.info(`[FacebookImport] Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    logger.error(`[FacebookImport] Job ${job.id} failed:`, error);
  }

  public async process(job: Job<FacebookImportJobData>): Promise<void> {
    const { account, accessToken } = job.data;

    if (!(await job.isActive())) {
      logger.info(`[FacebookImport] Job ${job.id} is no longer active, stopping import for user ${account.userId}`);
      return;
    }

    logger.info(`[FacebookImport] Starting import for user ${account.userId}`);

    const progressReports: {
      [type: string]: {
        totalItem: number;
        itemProcessed: number;
        status: NotificationStatus;
        progressPercent: number;
      };
    } = {};
    const importedExternalIds: string[] = [];

    const fields: Record<
      string,
      { endpoint: string; type: string; deprecated?: boolean }
    > = {
      feed: {
        endpoint: `/me`,
        type: 'Feed',
      },
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
          if (!(await job.isActive())) {
            logger.info(`[FacebookImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
          }

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
          if (!response) {
            break;
          }

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
            if (!(await job.isActive())) {
              logger.info(`[FacebookImport] Job ${job.id} cancelled during processing ${type}`);
              progressReports[type].status = NotificationStatus.Cancelled;
              break;
            }

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
                facebookContent.message ??
                'Facebook Post';
              
              // Normalized fields
              content.text = facebookContent.message || facebookContent.story;
              content.publishedAt = facebookContent.created_time ? new Date(facebookContent.created_time) : undefined;
              content.sourceUrl = facebookContent.permalink_url;

              // Handle media (Attachments/Albums)
              const mediaAssets: any[] = [];
              if (facebookContent.attachments?.data) {
                facebookContent.attachments.data.forEach((att: any) => {
                  if (att.subattachments?.data) {
                    att.subattachments.data.forEach((sub: any) => {
                      mediaAssets.push({
                        url: sub.media?.image?.src || sub.target?.url,
                        type: sub.type,
                        thumbnail: sub.media?.image?.src
                      });
                    });
                  } else {
                    mediaAssets.push({
                      url: att.media?.image?.src || att.target?.url,
                      type: att.type,
                      thumbnail: att.media?.image?.src
                    });
                  }
                });
              } else if (facebookContent.full_picture) {
                mediaAssets.push({
                  url: facebookContent.full_picture,
                  type: facebookContent.type || 'photo',
                  thumbnail: facebookContent.full_picture
                });
              }
              content.media = mediaAssets;

              // Standardized engagement
              content.engagement = {
                likes: facebookContent.reactions?.summary?.total_count || 0,
                shares: facebookContent.shares?.count || 0,
                comments: facebookContent.comments?.summary?.total_count || 0
              };

              content.metaData = {
                from: facebookContent.from,
                link: facebookContent.link,
                type: facebookContent.type,
                story: facebookContent.story,
                message: facebookContent.message,
                reactions: facebookContent.reactions,
                commentCount: facebookContent.comments?.summary?.total_count || 0,
                permalinkUrl: facebookContent.permalink_url,
                sharesCount: facebookContent.shares?.count,
                createdAt: facebookContent.created_time,
                updatedAt: facebookContent.updated_time,
                isPopular: facebookContent.is_popular,
                isHidden: facebookContent.is_hidden,
                picture: facebookContent.full_picture,
                via: facebookContent.via,
                attachments: facebookContent.attachments
              };
            } else if (type === 'Likes') {
              content.type = 'likes';
              content.title = facebookContent.name;
              content.metaData = {
                category: facebookContent.category,
                createdAt: facebookContent.created_time,
              };
            }

            await this.contentStreamRepository.deleteByPlatformAndExternalIdAsync(
              _const.PLATFORMS.FACEBOOK,
              content.externalId,
            );
            content = await this.userContentRepository.createAsync(content);
            importedExternalIds.push(content.externalId);
            const mappedContent = mapUserContentToFacebookOnlineModel(content);
            this.gateway.emitNewImportContent(
              account.userId,
              _const.PLATFORMS.FACEBOOK,
              mappedContent,
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
                  'Importing your Facebook data...',
                  '',
                  true,
                  {
                    status: NotificationStatus.InProgress,
                    reports: reportArray,
                    platform: _const.PLATFORMS.FACEBOOK,
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
                    platform: _const.PLATFORMS.FACEBOOK,
                  },
                },
              );
            }
          }

          if (!(await job.isActive())) {
            logger.info(`[FacebookImport] Job ${job.id} cancelled during processing ${type}`);
            progressReports[type].status = NotificationStatus.Cancelled;
            break;
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

    if (!(await job.isActive())) {
      logger.info(`[FacebookImport] Job ${job.id} was cancelled, rolling back imported content`);

      if (importedExternalIds.length > 0) {
        try {
          await this.userContentRepository.deleteByExternalIdsAsync(
            account.userId,
            _const.PLATFORMS.FACEBOOK,
            importedExternalIds,
          );
          logger.info(`[FacebookImport] Rolled back ${importedExternalIds.length} imported items for user ${account.userId}`);
        } catch (rollbackError) {
          logger.error(`[FacebookImport] Error during rollback:`, rollbackError);
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
            platform: _const.PLATFORMS.FACEBOOK,
          },
          "Facebook import was cancelled and rolled back",
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

    logger.info('Facebook final report:', finalReportArray);

    if (notification) {
      if (encounteredError) {
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.FACEBOOK,
          },
          'Facebook import completed with issues',
        );
      } else {
        await this.notificationService.updateAsync(
          notification.id,
          false,
          {
            status: NotificationStatus.Completed,
            reports: finalReportArray,
            platform: _const.PLATFORMS.FACEBOOK,
          },
          'Facebook import completed!',
        );
      }

      account.allowImport = true;
      await this.linkedAccountRepository.updateAsync(account);
    } else {
      await this.notificationService.notifyAsync(
        account.userId,
        NotificationType.Import,
        'Facebook import could not start',
        'Unable to initialize Facebook data import.',
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: finalReportArray,
          platform: _const.PLATFORMS.FACEBOOK,
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
        reactions.summary(true),
        comments.summary(true),
        attachments{media,target,type,subattachments{media,target,type}}`;
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
          `[FacebookImport] Rate limit (429) hit for ${url}. Waiting ${waitTime / 1000
          }s before retrying...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.fetchDataWithRateLimit(url, headers, params, attempt + 1);
      }

      if (status === 403 && fbError?.code === 4) {
        const waitTime = Math.min(15 * 60 * 1000, attempt * 60_000);
        logger.warn(
          `[FacebookImport] App-level rate limit (403 code=4) hit for ${url}. Backing off ${waitTime / 1000
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
        `[FacebookImport] Error fetching ${url} (status ${status || 'N/A'}): ${error.message
        }`,
        { fbError, headers: error.response?.headers },
      );
      throw error;
    }
  }
}

