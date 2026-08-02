import { Request, Response } from 'express';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import redis from '../utils/redis.util';
import { Globals } from '../globals';
import { HttpContext } from '../middlewares/httpContext.middleware';
import { TooManyRequestsException } from '../exceptions/tooManyRequest.exception';

/**
 * Rate limit for search and other endpoints that fan out to third-party APIs.
 *
 * Why this exists, specifically:
 *
 * `RateLimitMiddleware` is registered globally but short-circuits to four auth
 * routes, so search — the endpoint that fans out to *twelve* platforms, several of
 * them metered — was completely unlimited and unauthenticated. YouTube alone allows
 * roughly 100 searches per day (`search.list` costs 100 of 10,000 daily units), so
 * an unthrottled caller can exhaust a day's quota in seconds. That is a billing and
 * availability incident, not a theoretical risk.
 *
 * Three differences from the existing middleware:
 *
 *  1. **Atomic.** It uses Redis `INCR`, not a database read-then-write. The existing
 *     middleware reads a row, compares, then writes, so concurrent requests each
 *     read the same count and each write `count + 1` — the effective ceiling is far
 *     above the configured one under exactly the burst conditions a limiter exists
 *     to stop.
 *  2. **Cheap.** No database round-trip on the hot path.
 *  3. **Identity-aware.** Anonymous callers are the abuse vector and get a much
 *     lower allowance than signed-in users.
 *
 * Relies on `app.set('trust proxy', 1)` in main.ts. Without it `req.ip` behind Cloud
 * Run is the load balancer, which would collapse every caller into one bucket.
 */

export type SearchRateLimitOptions = {
  /** Requests permitted per window for a signed-in user. */
  authenticatedLimit?: number;
  /** Requests permitted per window for an anonymous caller. */
  anonymousLimit?: number;
  /** Window length in seconds. */
  windowSeconds?: number;
  /** Distinguishes buckets when the guard is used on more than one route group. */
  bucket?: string;
};

const DEFAULTS: Required<SearchRateLimitOptions> = {
  // Generous enough for real browsing (a results page plus filter changes), low
  // enough that a scripted caller is stopped long before third-party quota is.
  authenticatedLimit: 60,
  anonymousLimit: 20,
  windowSeconds: 60,
  bucket: 'search',
};

/**
 * Per-instance fallback used only when Redis is unavailable.
 *
 * `main.ts` deliberately starts without Redis, so the limiter must still bound
 * traffic during an outage. Failing fully open would leave paid API quota
 * unprotected precisely when the system is already degraded; failing fully closed
 * would take search down entirely. A local counter does neither: it is
 * per-instance rather than global, so the effective limit is
 * `limit × instance count`, which is bounded and acceptable for a short outage.
 */
const localCounters = new Map<string, { count: number; expiresAt: number }>();
const LOCAL_COUNTER_CAP = 10_000;

/**
 * Module-level, not a class member.
 *
 * `tsconfig.json` sets `declaration: true`, and TypeScript cannot emit a
 * declaration for a `private` member of an exported *anonymous* class — TS4094.
 * The guard is produced by a factory, so its class is anonymous. `account.guard.ts`
 * sidesteps the same constraint by making its injected field `public`.
 */
const logger = new Logger('SearchRateLimitGuard');

function incrementLocal(key: string, windowSeconds: number): number {
  const now = Date.now();
  const existing = localCounters.get(key);

  if (!existing || existing.expiresAt <= now) {
    // Bound the map so a spray of distinct keys cannot grow it without limit.
    if (localCounters.size >= LOCAL_COUNTER_CAP) {
      for (const [candidate, entry] of localCounters) {
        if (entry.expiresAt <= now) localCounters.delete(candidate);
      }
      if (localCounters.size >= LOCAL_COUNTER_CAP) localCounters.clear();
    }

    localCounters.set(key, {
      count: 1,
      expiresAt: now + windowSeconds * 1000,
    });
    return 1;
  }

  existing.count += 1;
  return existing.count;
}

export function createSearchRateLimitGuard(
  options: SearchRateLimitOptions = {},
) {
  const config = { ...DEFAULTS, ...options };

  @Injectable()
  class SearchRateLimitGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<Request>();
      const response = context.switchToHttp().getResponse<Response>();

      // Prefer the authenticated identity: it survives NAT and shared IPs, where
      // per-IP limiting would penalise unrelated users on the same network.
      const userId = HttpContext.user?.[Globals.ClaimTypes.UserId] as
        string | undefined;

      const isAuthenticated = Boolean(userId);
      const limit = isAuthenticated
        ? config.authenticatedLimit
        : config.anonymousLimit;

      const identity = isAuthenticated
        ? `u:${userId}`
        : `ip:${request.ip || request.socket?.remoteAddress || 'unknown'}`;

      // Window start is folded into the key, so expiry is the reset — no separate
      // bookkeeping, and no way for a stale TTL to grant a free window.
      const windowStart =
        Math.floor(Date.now() / 1000 / config.windowSeconds) *
        config.windowSeconds;

      const key = redis.getRedisKey(
        `ratelimit:${config.bucket}:${identity}:${windowStart}`,
      );

      let count: number;

      try {
        count = await redis.incrementInRedisAsync(key, config.windowSeconds);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Redis unavailable for rate limiting (${message}); using per-instance fallback`,
        );
        count = incrementLocal(key, config.windowSeconds);
      }

      const remaining = Math.max(0, limit - count);
      const resetAt = windowStart + config.windowSeconds;

      // Standard headers so clients can back off deliberately rather than by
      // discovering 429s.
      response.setHeader('RateLimit-Limit', String(limit));
      response.setHeader('RateLimit-Remaining', String(remaining));
      response.setHeader('RateLimit-Reset', String(resetAt));

      if (count > limit) {
        const retryAfter = Math.max(1, resetAt - Math.floor(Date.now() / 1000));
        response.setHeader('Retry-After', String(retryAfter));

        logger.warn(
          `Rate limit exceeded on ${config.bucket} by ${identity} (${count}/${limit})`,
        );

        throw new TooManyRequestsException(
          isAuthenticated
            ? 'Too many searches. Please wait a moment and try again.'
            : 'Too many searches. Sign in for a higher limit, or wait a moment.',
        );
      }

      return true;
    }
  }

  return SearchRateLimitGuard;
}

/**
 * Default guard for search endpoints.
 *
 * Applied to the global search POST and the database-backed GET routes. The
 * database-backed reads are cheaper than the fan-out, but they are still the entry
 * point an attacker would use to enumerate stored content.
 */
export const SearchRateLimitGuard = createSearchRateLimitGuard();

/**
 * Tighter bucket for the endpoints that actually spend third-party quota, i.e. any
 * request that can trigger `forceRefresh` and bypass the cache.
 */
export const ExternalSearchRateLimitGuard = createSearchRateLimitGuard({
  authenticatedLimit: 20,
  anonymousLimit: 5,
  windowSeconds: 60,
  bucket: 'search-external',
});
