import { Injectable } from '@nestjs/common';
import redis from '../../core/utils/redis.util';
import { PublicProfileModel } from '../../domain/contracts/public-profile.model';

const PROFILE_CACHE_TTL = 300; // 5 minutes

@Injectable()
export class ProfileCacheService {
  private cacheKey(userId: string): string {
    return redis.getRedisKey('profile', `public:${userId}`);
  }

  async getCachedProfile(userId: string): Promise<PublicProfileModel | null> {
    return redis.getFromRedisAsync<PublicProfileModel>(this.cacheKey(userId));
  }

  async setCachedProfile(
    userId: string,
    profile: PublicProfileModel,
  ): Promise<void> {
    await redis.storeInRedisAsync(
      this.cacheKey(userId),
      profile,
      PROFILE_CACHE_TTL,
    );
  }

  async invalidateProfile(userId: string): Promise<void> {
    await redis.removeFromRedisAsync(this.cacheKey(userId));
  }
}
