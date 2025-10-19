import axios from "axios";
import { Job } from "bullmq";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { NotificationStatus, NotificationType } from "../../../domain/enums";
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

export const InjectLinkedInImportQueue = (): ParameterDecorator =>
  InjectQueue(_const.BULL_QUEUES.LINKEDIN_IMPORT);

@Processor(_const.BULL_QUEUES.LINKEDIN_IMPORT)
export class LinkedInImportProcessor extends WorkerHost {

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
    const lastCursors: CursorMap = {};

    const fields: Record<string, { endpoint: string; type: string }> = {
      posts: { endpoint: '/people/~/shares', type: 'Posts' },
      profile: { endpoint: '/people/~', type: 'Profile' },
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
        const items = data.elements || [data];

        console.log(`Fetched ${items.length} items from LinkedIn ${type}`);

        for (const item of items) {
          let content = new UserContent({
            userId: account.userId,
            platform: _const.PLATFORMS.LINKEDIN,
            externalId: item.id || item.urn,
          });

          if (type === 'Posts') {
            content.type = 'post';
            content.title = item.text?.text || 'LinkedIn Post';
            content.metaData = {
              activity: item.activity,
              author: item.author,
              created: item.created,
              lastModified: item.lastModified,
              commentary: item.commentary || item.text?.text || '',
            };
          } else if (type === 'Profile') {
            content.type = 'profile';
            content.title = `${item.localizedFirstName} ${item.localizedLastName}`;
            content.metaData = {
              firstName: item.localizedFirstName,
              lastName: item.localizedLastName,
              headline: item.headline,
              profilePicture: item.profilePicture,
            };
          }

          try {
            await this.userContentRepository.createAsync(content);
            progressReports[type].itemProcessed++;
            
            if (progressReports[type].totalItem > 0) {
              progressReports[type].progressPercent = Math.round(
                (progressReports[type].itemProcessed / progressReports[type].totalItem) * 100
              );
            }

            console.log(`Processed LinkedIn ${type}: ${item.id || item.urn}`);
          } catch (error) {
            logger.error(`Error saving LinkedIn ${type}:`, error);
            encounteredError = true;
          }
        }

        progressReports[type].status = NotificationStatus.Completed;

      } catch (error) {
        logger.error(`Error fetching LinkedIn ${type}:`, error);
        progressReports[type].status = NotificationStatus.Failed;
        encounteredError = true;
      }
    }

    const finalReportArray = Object.entries(progressReports).map(([type, report]) => ({
      type,
      ...report,
    }));

    const finalStatus = encounteredError ? NotificationStatus.Failed : NotificationStatus.Completed;
    const totalProcessed = Object.values(progressReports).reduce((sum, report) => sum + report.itemProcessed, 0);

    if (!notification) {
      const notificationResult = await this.notificationService.notifyAsync(
        account.userId,
        NotificationType.Import,
        'LinkedIn Import Started',
        `Starting LinkedIn data import`,
        true,
        {
          platform: _const.PLATFORMS.LINKEDIN,
          status: NotificationStatus.InProgress,
          reports: finalReportArray,
        }
      );
      notification = mapToNotificationModel(notificationResult);
    }

    await this.notificationService.updateAsync(
      notification.id,
      false,
      {
        status: finalStatus,
        reports: finalReportArray,
      },
      encounteredError 
        ? `⚠️ LinkedIn import completed with issues. Processed ${totalProcessed} items`
        : `✅ LinkedIn import completed! Processed ${totalProcessed} items`
    );

    account.allowImport = true;
    await this.linkedAccountRepository.updateAsync(account);

    console.log('LinkedIn import completed');
  }
}
