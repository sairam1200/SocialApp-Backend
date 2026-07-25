import { ExecutionContext } from '@nestjs/common';
import { createSearchRateLimitGuard } from './searchRateLimit.guard';
import { TooManyRequestsException } from '../exceptions/tooManyRequest.exception';
import { HttpContext } from '../middlewares/httpContext.middleware';
import { Globals } from '../globals';
import redis from '../utils/redis.util';
import { JwtPayload } from './jwtPayload';

/**
 * Tests for the search rate limiter.
 *
 * This guard protects money, not just availability: search fans out to twelve
 * platforms and YouTube allows roughly 100 searches per day in total. The
 * behaviours pinned here are the ones that decide whether that quota survives
 * contact with a scripted caller.
 *
 * Note the existing `RateLimitMiddleware` is deliberately NOT reused — it does a
 * database read-then-write with no atomicity, so concurrent requests each read the
 * same count and the real ceiling is far above the configured one. The
 * "concurrent requests" test below is what that design would fail.
 */

function makeContext(ip = '203.0.113.10') {
  const headers: Record<string, string> = {};
  const response = {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ ip, socket: { remoteAddress: ip } }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, response, headers };
}

describe('SearchRateLimitGuard', () => {
  let store: Map<string, number>;
  let userSpy: jest.SpyInstance;

  function authenticateAs(userId: string | null) {
    userSpy.mockReturnValue(
      userId
        ? ({ [Globals.ClaimTypes.UserId]: userId } as unknown as JwtPayload)
        : null,
    );
  }

  beforeEach(() => {
    // In-memory stand-in for Redis INCR. Shared across calls so counting is real
    // rather than mocked to a fixed value.
    store = new Map<string, number>();

    jest
      .spyOn(redis, 'incrementInRedisAsync')
      .mockImplementation(async (key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return next;
      });

    jest
      .spyOn(redis, 'getRedisKey')
      .mockImplementation(((k: string) => k) as never);

    userSpy = jest.spyOn(HttpContext, 'user', 'get');
    authenticateAs(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('anonymous callers', () => {
    it('allows requests up to the limit', async () => {
      const Guard = createSearchRateLimitGuard({ anonymousLimit: 3 });
      const guard = new Guard();

      for (let i = 0; i < 3; i += 1) {
        const { context } = makeContext();
        await expect(guard.canActivate(context)).resolves.toBe(true);
      }
    });

    it('rejects the request past the limit', async () => {
      const Guard = createSearchRateLimitGuard({ anonymousLimit: 2 });
      const guard = new Guard();

      await guard.canActivate(makeContext().context);
      await guard.canActivate(makeContext().context);

      await expect(guard.canActivate(makeContext().context)).rejects.toThrow(
        TooManyRequestsException,
      );
    });

    it('keeps rejecting once over the limit', async () => {
      const Guard = createSearchRateLimitGuard({ anonymousLimit: 1 });
      const guard = new Guard();

      await guard.canActivate(makeContext().context);

      for (let i = 0; i < 3; i += 1) {
        await expect(guard.canActivate(makeContext().context)).rejects.toThrow(
          TooManyRequestsException,
        );
      }
    });

    it('counts each client IP separately', async () => {
      const Guard = createSearchRateLimitGuard({ anonymousLimit: 1 });
      const guard = new Guard();

      await expect(
        guard.canActivate(makeContext('198.51.100.1').context),
      ).resolves.toBe(true);

      // A different caller must not inherit the first one's exhausted budget.
      await expect(
        guard.canActivate(makeContext('198.51.100.2').context),
      ).resolves.toBe(true);
    });
  });

  describe('authenticated callers', () => {
    it('gets the higher allowance', async () => {
      const Guard = createSearchRateLimitGuard({
        anonymousLimit: 1,
        authenticatedLimit: 5,
      });
      const guard = new Guard();
      authenticateAs('user-1');

      for (let i = 0; i < 5; i += 1) {
        await expect(guard.canActivate(makeContext().context)).resolves.toBe(
          true,
        );
      }

      await expect(guard.canActivate(makeContext().context)).rejects.toThrow(
        TooManyRequestsException,
      );
    });

    it('is keyed on user, not IP, so shared networks do not collide', async () => {
      // Two users behind one NAT address. Per-IP limiting would penalise the second.
      const Guard = createSearchRateLimitGuard({ authenticatedLimit: 1 });
      const guard = new Guard();

      authenticateAs('user-1');
      await expect(
        guard.canActivate(makeContext('203.0.113.99').context),
      ).resolves.toBe(true);

      authenticateAs('user-2');
      await expect(
        guard.canActivate(makeContext('203.0.113.99').context),
      ).resolves.toBe(true);
    });

    it('follows the user across changing IP addresses', async () => {
      // Rotating IPs must not reset the budget — that would make the limit trivial
      // to bypass from a cloud provider.
      const Guard = createSearchRateLimitGuard({ authenticatedLimit: 1 });
      const guard = new Guard();
      authenticateAs('user-1');

      await expect(
        guard.canActivate(makeContext('198.51.100.1').context),
      ).resolves.toBe(true);

      await expect(
        guard.canActivate(makeContext('198.51.100.2').context),
      ).rejects.toThrow(TooManyRequestsException);
    });
  });

  describe('separate buckets', () => {
    it('does not share a budget between bucket names', async () => {
      const Cheap = createSearchRateLimitGuard({
        anonymousLimit: 1,
        bucket: 'search',
      });
      const Expensive = createSearchRateLimitGuard({
        anonymousLimit: 1,
        bucket: 'search-external',
      });

      await expect(
        new Cheap().canActivate(makeContext().context),
      ).resolves.toBe(true);
      // Exhausting the cheap bucket must not pre-spend the expensive one.
      await expect(
        new Expensive().canActivate(makeContext().context),
      ).resolves.toBe(true);
    });
  });

  describe('response headers', () => {
    it('reports limit, remaining and reset', async () => {
      const Guard = createSearchRateLimitGuard({ anonymousLimit: 5 });
      const { context, headers } = makeContext();

      await new Guard().canActivate(context);

      expect(headers['RateLimit-Limit']).toBe('5');
      expect(headers['RateLimit-Remaining']).toBe('4');
      expect(Number(headers['RateLimit-Reset'])).toBeGreaterThan(
        Math.floor(Date.now() / 1000),
      );
    });

    it('sets Retry-After when rejecting, so clients can back off deliberately', async () => {
      const Guard = createSearchRateLimitGuard({ anonymousLimit: 1 });
      const guard = new Guard();

      await guard.canActivate(makeContext().context);

      const { context, headers } = makeContext();
      await expect(guard.canActivate(context)).rejects.toThrow(
        TooManyRequestsException,
      );

      expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
      expect(headers['RateLimit-Remaining']).toBe('0');
    });
  });

  describe('concurrency', () => {
    it('counts every request when they arrive simultaneously', async () => {
      // This is the property the existing DB-backed middleware lacks. Its
      // read-then-write means N concurrent requests all read the same count and all
      // write count+1, so the effective ceiling far exceeds the configured one.
      // Atomic INCR must admit exactly `limit` and reject the rest.
      const Guard = createSearchRateLimitGuard({ anonymousLimit: 10 });
      const guard = new Guard();

      const results = await Promise.allSettled(
        Array.from({ length: 25 }, () =>
          guard.canActivate(makeContext().context),
        ),
      );

      const allowed = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      expect(allowed).toBe(10);
      expect(rejected).toBe(15);
    });
  });

  describe('Redis unavailable', () => {
    it('still enforces a limit via the per-instance fallback', async () => {
      // main.ts starts without Redis by design. Failing fully open here would leave
      // paid API quota unprotected precisely when the system is already degraded.
      jest
        .spyOn(redis, 'incrementInRedisAsync')
        .mockRejectedValue(new Error('Redis connection refused'));

      const Guard = createSearchRateLimitGuard({
        anonymousLimit: 2,
        bucket: `fallback-${Date.now()}`, // fresh bucket: the local map is module state
      });
      const guard = new Guard();

      await expect(guard.canActivate(makeContext().context)).resolves.toBe(
        true,
      );
      await expect(guard.canActivate(makeContext().context)).resolves.toBe(
        true,
      );
      await expect(guard.canActivate(makeContext().context)).rejects.toThrow(
        TooManyRequestsException,
      );
    });

    it('does not fail the request merely because Redis threw', async () => {
      jest
        .spyOn(redis, 'incrementInRedisAsync')
        .mockRejectedValue(new Error('Redis connection refused'));

      const Guard = createSearchRateLimitGuard({
        anonymousLimit: 5,
        bucket: `fallback-open-${Date.now()}`,
      });

      await expect(
        new Guard().canActivate(makeContext().context),
      ).resolves.toBe(true);
    });
  });
});
