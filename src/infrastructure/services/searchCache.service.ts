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

export interface UnifiedSearchCacheParams {
  normalizedQuery: string;
  platforms: string[];
  type?: string;
  page: number;
  limit: number;
}

export type QueryPopularity = 'popular' | 'normal' | 'rare';

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
        logger.debug(
          `Cache HIT for ${params.platform} query: "${params.normalizedQuery}"`,
        );
        return cached;
      }
      return null;
    } catch (error) {
      logger.error(
        `Error getting cached results for ${params.platform}:`,
        error,
      );
      return null;
    }
  }

  async setCachedResults<T extends object>(
    params: SearchCacheParams,
    results: T,
  ): Promise<void> {
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
      const result = await redis.instance.set(
        lockKey,
        Date.now().toString(),
        'EX',
        ttl,
        'NX',
      );
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
        logger.error(
          `Error waiting for cached results for ${params.platform}:`,
          error,
        );
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

  // ─── Unified Search Cache Methods ─────────────────────────────────────

  buildUnifiedCacheKey(params: UnifiedSearchCacheParams): string {
    const platformsKey = params.platforms.sort().join(',');
    const typeKey = params.type || 'all';
    const queryHash = crypto
      .createHash('md5')
      .update(params.normalizedQuery.toLowerCase())
      .digest('hex')
      .substring(0, 12);

    return redis.getRedisKey(
      'unified:search',
      queryHash,
      platformsKey,
      typeKey,
      params.page.toString(),
      params.limit.toString(),
    );
  }

  private buildPopularityCountKey(normalizedQuery: string): string {
    return redis.getRedisKey(
      'unified:search:popularity',
      crypto
        .createHash('md5')
        .update(normalizedQuery.toLowerCase())
        .digest('hex')
        .substring(0, 12),
    );
  }

  async trackQueryPopularity(normalizedQuery: string): Promise<number> {
    try {
      const key = this.buildPopularityCountKey(normalizedQuery);
      const ttl = _const.SEARCH_CACHE.QUERY_POPULARITY.COUNT_TTL_SEC;
      const count = await redis.incrementInRedisAsync(key, ttl);
      return count;
    } catch (error) {
      logger.error('Error tracking query popularity:', error);
      return 0;
    }
  }

  classifyQueryPopularity(count: number): QueryPopularity {
    const { POPULAR_THRESHOLD, RARE_THRESHOLD } =
      _const.SEARCH_CACHE.QUERY_POPULARITY;
    if (count >= POPULAR_THRESHOLD) return 'popular';
    if (count <= RARE_THRESHOLD) return 'rare';
    return 'normal';
  }

  getTtlForPopularity(popularity: QueryPopularity): number {
    return _const.SEARCH_CACHE.UNIFIED_CACHE_TTL[popularity.toUpperCase()];
  }

  async getCachedUnifiedResults<T>(
    params: UnifiedSearchCacheParams,
  ): Promise<T | null> {
    try {
      const cacheKey = this.buildUnifiedCacheKey(params);
      const cached = await redis.getFromRedisAsync<T>(cacheKey);
      if (cached) {
        logger.debug(
          `Unified cache HIT for query: "${params.normalizedQuery}", platforms: ${params.platforms.join(',')}`,
        );
        return cached;
      }
      return null;
    } catch (error) {
      logger.error('Error getting unified cached results:', error);
      return null;
    }
  }

  async setCachedUnifiedResults<T extends object>(
    params: UnifiedSearchCacheParams,
    results: T,
    popularity?: QueryPopularity,
  ): Promise<void> {
    try {
      const cacheKey = this.buildUnifiedCacheKey(params);
      const ttl = popularity
        ? this.getTtlForPopularity(popularity)
        : _const.SEARCH_CACHE.UNIFIED_CACHE_TTL.NORMAL;
      await redis.storeInRedisAsync(cacheKey, results, ttl);
    } catch (error) {
      logger.error('Error caching unified results:', error);
    }
  }

  async setNegativeCache(params: UnifiedSearchCacheParams): Promise<void> {
    try {
      const cacheKey = this.buildUnifiedCacheKey(params);
      const ttl = _const.SEARCH_CACHE.UNIFIED_CACHE_TTL.NEGATIVE;
      await redis.storeInRedisAsync(
        cacheKey,
        { results: [], totalResults: 0, negative: true },
        ttl,
      );
    } catch (error) {
      logger.error('Error setting negative cache:', error);
    }
  }

  async invalidateUnifiedCacheForDocument(
    platform: string,
    externalId: string,
  ): Promise<void> {
    try {
      const pattern = redis.getRedisKey('unified:search', '*');
      let cursor = '0';
      let invalidated = 0;

      do {
        const [nextCursor, keys] = await redis.instance.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          const pipeline = redis.instance.pipeline();
          keys.forEach((key) => pipeline.del(key));
          await pipeline.exec();
          invalidated += keys.length;
        }
      } while (cursor !== '0');

      if (invalidated > 0) {
        logger.info(
          `Invalidated ${invalidated} unified cache entries after ${platform}:${externalId} update`,
        );
      }
    } catch (error) {
      logger.error('Error invalidating unified cache for document:', error);
    }
  }

  async clearAllUnifiedCache(): Promise<void> {
    try {
      await redis.removeFromRedisByPatternAsync(
        redis.getRedisKey('unified:search', '*'),
      );
      logger.info('All unified search cache cleared');
    } catch (error) {
      logger.error('Error clearing unified cache:', error);
    }
  }

  // ─── Suggestions Cache ─────────────────────────────────────────────────

  private buildSuggestionCacheKey(normalizedQuery: string): string {
    return redis.getRedisKey(
      'search:suggestions',
      crypto
        .createHash('md5')
        .update(normalizedQuery.toLowerCase())
        .digest('hex')
        .substring(0, 12),
    );
  }

  private readonly SUGGESTION_CACHE_TTL_SEC = 2 * 60 * 60;

  async getCachedSuggestions(
    normalizedQuery: string,
  ): Promise<unknown[] | null> {
    try {
      const key = this.buildSuggestionCacheKey(normalizedQuery);
      const cached = await redis.getFromRedisAsync<unknown[]>(key);
      if (cached) {
        logger.debug(`Suggestions cache HIT for query: "${normalizedQuery}"`);
        return cached;
      }
      return null;
    } catch (error) {
      logger.error('Error getting cached suggestions:', error);
      return null;
    }
  }

  async setCachedSuggestions(
    normalizedQuery: string,
    suggestions: unknown[],
  ): Promise<void> {
    try {
      const key = this.buildSuggestionCacheKey(normalizedQuery);
      await redis.storeInRedisAsync(
        key,
        suggestions,
        this.SUGGESTION_CACHE_TTL_SEC,
      );
    } catch (error) {
      logger.error('Error caching suggestions:', error);
    }
  }

  async invalidateSuggestionsCache(normalizedQuery?: string): Promise<void> {
    try {
      if (normalizedQuery) {
        const key = this.buildSuggestionCacheKey(normalizedQuery);
        await redis.removeFromRedisAsync(key);
      } else {
        await redis.removeFromRedisByPatternAsync(
          redis.getRedisKey('search:suggestions', '*'),
        );
      }
    } catch (error) {
      logger.error('Error invalidating suggestions cache:', error);
    }
  }
}
