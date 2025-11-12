import { Injectable } from '@nestjs/common';
import redis from '../../core/utils/redis.util';
import _const from '../../core/utils/const';
import logger from '../../core/utils/winston.util';
import crypto from 'crypto';

export interface SearchCacheParams {
  platform: string;
  normalizedQuery: string;
  filters: Record<string, any>;
  page: number;
  limit: number;
}

@Injectable()
export class SearchCacheService {
  private generateCacheKey(params: SearchCacheParams): string {
    const filtersHash = crypto
      .createHash('md5')
      .update(JSON.stringify(params.filters))
      .digest('hex')
      .substring(0, 8);

    return redis.getRedisKey(
      `${params.platform}:search`,
      params.normalizedQuery.toLowerCase(),
      filtersHash,
      params.page.toString(),
      params.limit.toString(),
    );
  }

  private generateLockKey(params: SearchCacheParams): string {
    return redis.getRedisKey(
      `${params.platform}:search:lock`,
      params.normalizedQuery.toLowerCase(),
      JSON.stringify(params.filters),
    );
  }

  async getCachedResults<T>(params: SearchCacheParams): Promise<T | null> {
    try {
      const cacheKey = this.generateCacheKey(params);
      const cached = await redis.getFromRedisAsync<T>(cacheKey);
      if (cached) {
        logger.debug(`Cache HIT for ${params.platform} query: "${params.normalizedQuery}"`);
        return cached;
      }
      return null;
    } catch (error) {
      logger.error(`Error getting cached results for ${params.platform}:`, error);
      return null;
    }
  }

  async setCachedResults<T extends object>(params: SearchCacheParams, results: T): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(params);
      const ttl = _const.SEARCH_CACHE.QUERY_CACHE_TTL_SEC;
      await redis.storeInRedisAsync(cacheKey, results, ttl);
    } catch (error) {
      logger.error(`Error caching results for ${params.platform}:`, error);
    }
  }

  async acquireLock(params: SearchCacheParams): Promise<boolean> {
    try {
      const lockKey = this.generateLockKey(params);
      const ttl = _const.SEARCH_CACHE.QUERY_LOCK_TTL_SEC;
      const result = await redis.instance.set(lockKey, Date.now().toString(), 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error(`Error acquiring lock for ${params.platform}:`, error);
      return false;
    }
  }

  async releaseLock(params: SearchCacheParams): Promise<void> {
    try {
      const lockKey = this.generateLockKey(params);
      await redis.removeFromRedisAsync(lockKey);
    } catch (error) {
      logger.error(`Error releasing lock for ${params.platform}:`, error);
    }
  }

  async waitForCachedResults<T>(
    params: SearchCacheParams,
    timeoutMs: number = 5000,
    pollIntervalMs: number = 200,
  ): Promise<T | null> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(params);

    while (Date.now() - startTime < timeoutMs) {
      try {
        const cached = await redis.getFromRedisAsync<T>(cacheKey);
        if (cached) return cached;
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        logger.error(`Error waiting for cached results for ${params.platform}:`, error);
        return null;
      }
    }
    return null;
  }

  async invalidateCache(params: SearchCacheParams): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(params);
      await redis.removeFromRedisAsync(cacheKey);
    } catch (error) {
      logger.error(`Error invalidating cache for ${params.platform}:`, error);
    }
  }
}

