import redis from '../../core/utils/redis.util';
import _const from '../../core/utils/const';

const DEFAULT_FOLLOW_CACHE_TTL_SEC = 10 * 60; // 10 minutes

export interface FollowCountsCache {
  followers: number;
  following: number;
}

export class FollowCacheService {
  private static getKey(userId: string): string {
    return redis.getRedisKey('follow:counts', userId);
  }

  public static async getCountsAsync(userId: string): Promise<FollowCountsCache | null> {
    const key = this.getKey(userId);
    return redis.getFromRedisAsync<FollowCountsCache>(key);
  }

  public static async setCountsAsync(userId: string, counts: FollowCountsCache, ttlSec?: number): Promise<void> {
    const key = this.getKey(userId);
    const ttl = ttlSec ?? DEFAULT_FOLLOW_CACHE_TTL_SEC;
    await redis.storeInRedisAsync(key, counts, ttl);
  }

  public static async invalidateAsync(userId: string): Promise<void> {
    const key = this.getKey(userId);
    await redis.removeFromRedisAsync(key);
  }
}
