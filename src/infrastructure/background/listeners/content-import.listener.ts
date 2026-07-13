import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ImportGateway } from '../../websocket/gateways/import.gateway';
import { NotificationGateway } from '../../websocket/gateways/notification.gateway';
import { ProfileCacheService } from '../../services/profileCache.service';
import { IUserContentRepository } from '../../../domain/repositories';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';

@Injectable()
export class ContentImportListener {
  constructor(
    private readonly gateway: ImportGateway,
    private readonly notificationGateway: NotificationGateway,
    private readonly profileCache: ProfileCacheService,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  @OnEvent('content.imported', { async: true })
  async handleContentImported(payload: {
    userId: string;
    platform: string;
    data: any;
  }): Promise<void> {
    try {
      this.gateway.emitNewImportContent(
        payload.userId,
        payload.platform,
        payload.data,
      );

      const totalPosts = await this.userContentRepository.countByUserIdAsync(
        payload.userId,
      );

      await this.profileCache.invalidateProfile(payload.userId);

      this.notificationGateway.emitProfileStatsUpdated(
        payload.userId,
        totalPosts,
      );
    } catch (err: any) {
      logger.error(
        `[ContentImportListener] Failed to emit new-content event: ${err.message}`,
      );
    }
  }
}
