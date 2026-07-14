import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationGateway } from '../../websocket/gateways/notification.gateway';
import { ProfileCacheService } from '../../services/profileCache.service';
import { FollowUpdatedEvent } from '../../../domain/events/follow-updated.event';
import redis from '../../../core/utils/redis.util';
import logger from '../../../core/utils/winston.util';

@Injectable()
export class FollowUpdatedListener {
  constructor(
    private readonly gateway: NotificationGateway,
    private readonly profileCache: ProfileCacheService,
  ) {}

  @OnEvent('follow.updated', { async: true })
  async handle(payload: FollowUpdatedEvent): Promise<void> {
    try {
      this.gateway.emitFollowUpdated(payload.viewerUserId, {
        targetUserId: payload.targetUserId,
        viewerUserId: payload.viewerUserId,
        isFollowing: payload.isFollowing,
        targetFollowersCount: payload.targetFollowersCount,
        viewerFollowingCount: payload.viewerFollowingCount,
      });

      this.gateway.emitFollowUpdated(payload.targetUserId, {
        targetUserId: payload.targetUserId,
        viewerUserId: payload.viewerUserId,
        isFollowing: payload.isFollowing,
        targetFollowersCount: payload.targetFollowersCount,
        viewerFollowingCount: payload.viewerFollowingCount,
      });

      // Invalidate profile caches for both users
      await Promise.all([
        this.invalidateProfileCache(payload.targetUserId),
        this.invalidateProfileCache(payload.viewerUserId),
      ]);
    } catch (err: any) {
      logger.error(
        `[FollowUpdatedListener] Failed to emit follow.updated event: ${err.message}`,
      );
    }
  }

  private async invalidateProfileCache(userId: string): Promise<void> {
    try {
      await this.profileCache.invalidateProfile(userId);
      const profileKey = redis.getRedisKey('profile', `public:${userId}`);
      await redis.removeFromRedisAsync(profileKey);
    } catch (err) {
      logger.warn(`Profile cache invalidation failed for ${userId}: ${err}`);
    }
  }
}
