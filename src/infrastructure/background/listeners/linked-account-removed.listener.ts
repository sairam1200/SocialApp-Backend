import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { ProfileCacheService } from '../../services/profileCache.service';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { LinkedAccountRemovedEvent } from '../../../domain/events/linked-account-removed.event';

@Injectable()
export class LinkedAccountRemovedListener {
  constructor(
    private readonly profileCache: ProfileCacheService,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  @OnEvent('linked.account.removed', { async: true })
  async handle(event: LinkedAccountRemovedEvent): Promise<void> {
    try {
      const { userId, linkedAccountId } = event.data;

      await this.profileCache.invalidateProfile(userId);

      logger.info(
        `[LinkedAccountRemovedListener] Invalidated profile cache for user ${userId} after removing account ${linkedAccountId}`,
      );
    } catch (err: any) {
      logger.error(
        `[LinkedAccountRemovedListener] Failed to handle account removal: ${err.message}`,
      );
    }
  }
}
