import { Inject } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import _const from "../../../core/utils/const";
import logger from "../../../core/utils/winston.util";
import { ContentStream } from "../../../domain/entities/contentStream.entity";
import { INotificationService } from "../../../domain/services/inotification.service";
import { IGeneralRepository } from "../../../domain/repositories/igeneral.repository";
import { PlatformRollbackEvent } from "../../../domain/events/platform-rollback.event";
import { IUserContentRepository } from "../../../domain/repositories/iuserContent.repository";
import { NotificationStatus, NotificationType, StreamEntityType } from "../../../domain/enums";
import { INotificationRepository } from "../../../domain/repositories/inotification.repository";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import { PlatformConnectCleanupEvent } from "../../../domain/events/platform-connect-cleanup.event";

export class PlatformRollbackListener {
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
    @Inject(_const.INOTIFICATION_REPOSITORY)
    private readonly notificationRepository: INotificationRepository,
    @Inject(_const.IGENERAL_REPOSITORY)
    private readonly generalRepository: IGeneralRepository,
  ) {
    logger.info(`[PlatformRollback] Listener initialized`);
  }

  @OnEvent('platform.rollback', { async: true })
  async handlePlatformRollback(event: PlatformRollbackEvent): Promise<void> {
    const { account } = event.data;
    await this.cleanupUserContent(account, true);
  }

  @OnEvent('platform.connect.cleanup', { async: true })
  async handlePlatformConnectCleanup(event: PlatformConnectCleanupEvent): Promise<void> {
    const { account } = event.data;
    await this.cleanupUserContent(account, false);
  }

  private async cleanupUserContent(account: any, updateNotifications: boolean): Promise<void> {
    const userId = account.userId;
    const platform = account.platform;

    logger.info(`[PlatformRollback] Starting ${updateNotifications ? 'rollback' : 'cleanup'} for user ${userId}, platform ${platform}`);

    try {
      const userContents = await this.getUserContentsByPlatform(userId, platform);
      logger.debug(`[PlatformRollback] Found ${userContents.length} user contents to process`);

      const contentsToMove: ContentStream[] = [];
      const externalIds: string[] = [];

      for (const userContent of userContents) {
        externalIds.push(userContent.externalId);
      }

      if (externalIds.length > 0) {
        const newIds = await this.generalRepository.checkExistingItemsAsync(
          externalIds,
          platform,
        );

        logger.debug(
          `[PlatformRollback] ${externalIds.length - newIds.length} items exist in DB, ${newIds.length} new items to move to ContentStream`,
        );

        for (const userContent of userContents) {
          const isNew = newIds.includes(userContent.externalId);

          if (!isNew) {
            const contentStream = this.mapUserContentToContentStream(userContent);
            contentsToMove.push(contentStream);
          }
        }

        if (contentsToMove.length > 0) {
          logger.debug(`[PlatformRollback] Moving ${contentsToMove.length} items to ContentStream`);
          await this.generalRepository.createAsync(contentsToMove);
        }

        for (const userContent of userContents) {
          await this.userContentRepository.deleteAsync(userContent);
        }
        logger.debug(`[PlatformRollback] Deleted ${userContents.length} items from UserContent`);
      }

      if (updateNotifications) {
        account.allowImport = false;
        if (account.metaData) {
          delete account.metaData.importCursors;
          delete account.metaData.importCancelled;
        }

        await this.linkedAccountRepository.updateAsync(account);

        const notifications = await this.notificationRepository.getAllAsync(userId);
        const importNotifications = notifications.filter(
          n => n.type === NotificationType.Import && n.isLive && n.metaData?.platform === platform,
        );

        for (const notification of importNotifications) {
          await this.notificationService.updateAsync(
            notification.id,
            false,
            {
              status: NotificationStatus.Cancelled,
              reports: [],
              platform,
            },
            `❌ ${platform} import was cancelled and rolled back`,
          );
        }
      } else {
        if (account.metaData) {
          delete account.metaData.importCursors;
        }
        await this.linkedAccountRepository.updateAsync(account);
      }

      logger.info(`[PlatformRollback] ${updateNotifications ? 'Rollback' : 'Cleanup'} completed for user ${userId}, platform ${platform}`);
    } catch (error) {
      logger.error(`[PlatformRollback] Error during ${updateNotifications ? 'rollback' : 'cleanup'} for user ${userId}, platform ${platform}:`, error);
      throw error;
    }
  }

  private async getUserContentsByPlatform(userId: string, platform: string): Promise<any[]> {
    const allContents: any[] = [];
    let cursor = '';
    let hasMore = true;

    while (hasMore) {
      const [contents, nextCursor] = await this.userContentRepository.getByUserIdAsync(
        userId,
        platform,
        cursor,
      );

      allContents.push(...contents);

      if (!nextCursor || contents.length === 0) {
        hasMore = false;
      } else {
        cursor = nextCursor;
      }
    }

    return allContents;
  }

  private mapUserContentToContentStream(userContent: any): ContentStream {
    let type: StreamEntityType = StreamEntityType.Content;
    let subType = userContent.type;

    if (userContent.type === 'channel' || userContent.type === 'subscription') {
      type = StreamEntityType.Profile;
      subType = 'channel';
    } else if (userContent.type === 'activity' || userContent.type === 'playlist') {
      type = StreamEntityType.Content;
    }

    return new ContentStream({
      type,
      subType,
      title: userContent.title,
      platform: userContent.platform,
      externalId: userContent.externalId,
      metaData: userContent.metaData,
      lastRefreshed: new Date(),
    });
  }
}

