import { Injectable } from '@nestjs/common';
import redis from '../../core/utils/redis.util';
import { PublicProfileModel } from '../../domain/contracts/public-profile.model';

const PROFILE_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class ProfileCacheService {
  private cacheKey(userId: string, viewerUserId?: string | null): string {
    const viewerSuffix = viewerUserId ?? 'public';
    return redis.getRedisKey('profile', `public:${userId}:v:${viewerSuffix}`);
  }

  async getCachedProfile(
    userId: string,
    viewerUserId?: string | null,
  ): Promise<PublicProfileModel | null> {
    return redis.getFromRedisAsync<PublicProfileModel>(
      this.cacheKey(userId, viewerUserId),
    );
  }

  async setCachedProfile(
    userId: string,
    profile: PublicProfileModel,
    viewerUserId?: string | null,
  ): Promise<void> {
    await redis.storeInRedisAsync(
      this.cacheKey(userId, viewerUserId),
      profile,
      PROFILE_CACHE_TTL,
    );
  }

  async invalidateProfile(userId: string): Promise<void> {
    // Invalidate all viewer-specific cache entries by pattern
    const pattern = redis.getRedisKey('profile', `public:${userId}:v:*`);
    await redis.removeFromRedisByPatternAsync(pattern);
  }
}
