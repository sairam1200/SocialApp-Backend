import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AdminAccoutGuard,
  AuthenticatedAccountGuard,
  RefreshTokenGuard,
  UserAccoutGuard,
} from './account.guard';
import { Globals } from '../globals';
import { UserType } from '../../domain/enums';
import { HttpContext } from '../middlewares/httpContext.middleware';
import redis from '../utils/redis.util';
import { JwtPayload } from './jwtPayload';

/**
 * Regression tests for finding C1 in
 * docs/audit/2026-07_Security_And_Correctness_Audit.md.
 *
 * `HttpContextMiddleware` verifies every JWT with `ignoreExpiration: true` so the
 * refresh endpoint can identify a caller from a lapsed access token. That is
 * intentional — but it means expiry must be enforced *in the guard*, and it was
 * not: `createAccountGuard` accepted an `ignoreExpiration` parameter it never
 * read, so roughly 147 of 201 endpoints accepted indefinitely-old tokens.
 *
 * These tests pin the corrected behaviour:
 *  - ordinary guards reject an expired token
 *  - RefreshTokenGuard alone still accepts one (or token refresh breaks)
 *
 * If someone removes the exp check, "rejects an expired token" fails. If someone
 * makes RefreshTokenGuard strict, "RefreshTokenGuard" fails — and refresh would
 * break in production.
 */

const NOW_SECONDS = () => Math.floor(Date.now() / 1000);

function claims(overrides: Partial<Record<string, unknown>> = {}): JwtPayload {
  return {
    [Globals.ClaimTypes.UserId]: 'user-1',
    [Globals.ClaimTypes.Email]: 'test@gaddr.local',
    [Globals.ClaimTypes.FullName]: 'Test User',
    [Globals.ClaimTypes.GivenName]: 'Test',
    [Globals.ClaimTypes.FamilyName]: 'User',
    [Globals.ClaimTypes.SecurityStamp]: 'stamp-1',
    [Globals.ClaimTypes.ConcurrencyStamp]: 'concurrency-1',
    [Globals.ClaimTypes.UserType]: UserType.User,
    exp: NOW_SECONDS() + 900, // valid for 15 more minutes
    ...overrides,
  } as JwtPayload;
}

function makeContext() {
  const response = { setHeader: jest.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: 'Bearer test-token' } }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, response };
}

/** Authoritative values the database would return for the test user. */
const DB_USER = {
  id: 'user-1',
  securityStamp: 'stamp-1',
  concurrencyStamp: 'concurrency-1',
};

/** Stub identity repository. Overridable per test. */
function identityRepo(overrides: Record<string, unknown> = {}) {
  return {
    getUserByIdAsync: jest.fn().mockResolvedValue(DB_USER),
    cacheUserAccountAsync: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Instantiate one of the exported guard classes.
 *
 * Two constructor args now: JwtService (unused by these paths) and the identity
 * repository, which the guard reads when the session cache misses (finding C5).
 */
function build(
  GuardClass: new (
    jwtService: unknown,
    identityRepository: unknown,
  ) => {
    canActivate(c: ExecutionContext): Promise<boolean>;
  },
  repo: unknown = identityRepo(),
) {
  return new GuardClass({} as never, repo);
}

describe('AccountGuard', () => {
  let userSpy: jest.SpyInstance;

  function authenticateAs(payload: JwtPayload | null) {
    userSpy.mockReturnValue(payload);
  }

  beforeEach(() => {
    userSpy = jest.spyOn(HttpContext, 'user', 'get');

    // Default: no cached account, so the securityStamp branch is skipped.
    // Finding C5 (revocation fails open on cache miss) is covered separately.
    jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue(null as never);
    jest.spyOn(redis, 'getRedisKey').mockReturnValue('test-key' as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('token expiry — finding C1', () => {
    it('accepts a token that has not expired', async () => {
      authenticateAs(claims());
      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).resolves.toBe(
        true,
      );
    });

    it('rejects an expired token', async () => {
      authenticateAs(claims({ exp: NOW_SECONDS() - 60 }));
      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token expired long ago', async () => {
      // Before the fix this succeeded — a token from a year back stayed valid.
      authenticateAs(claims({ exp: NOW_SECONDS() - 365 * 24 * 60 * 60 }));
      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token with no exp claim at all', async () => {
      authenticateAs(claims({ exp: undefined }));
      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token whose exp is not numeric', async () => {
      authenticateAs(claims({ exp: 'not-a-number' }));
      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('sets the Token-Expired response header so the client can refresh', async () => {
      authenticateAs(claims({ exp: NOW_SECONDS() - 60 }));
      const { context, response } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(response.setHeader).toHaveBeenCalledWith('Token-Expired', 'true');
    });

    it('applies expiry enforcement to AuthenticatedAccountGuard too', async () => {
      authenticateAs(claims({ exp: NOW_SECONDS() - 1 }));
      const { context } = makeContext();

      await expect(
        build(AuthenticatedAccountGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('RefreshTokenGuard still accepts an expired token', async () => {
      // The refresh handler resolves identity from HttpContext.getCurrentUserId,
      // i.e. from the lapsed access token. If this guard turns strict, users can
      // never refresh and are hard-logged-out instead.
      authenticateAs(claims({ exp: NOW_SECONDS() - 3600 }));
      const { context } = makeContext();

      await expect(build(RefreshTokenGuard).canActivate(context)).resolves.toBe(
        true,
      );
    });
  });

  describe('authentication', () => {
    it('rejects an unauthenticated request', async () => {
      authenticateAs(null);
      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when two-factor authentication is outstanding', async () => {
      authenticateAs(claims({ [Globals.ClaimTypes.TwoFARequired]: true }));
      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('user type enforcement', () => {
    it('rejects a User principal on an Admin-only guard', async () => {
      authenticateAs(claims({ [Globals.ClaimTypes.UserType]: UserType.User }));
      const { context } = makeContext();

      await expect(
        build(AdminAccoutGuard).canActivate(context),
      ).rejects.toThrow(ForbiddenException);
    });

    it('accepts an Admin principal on an Admin-only guard', async () => {
      authenticateAs(claims({ [Globals.ClaimTypes.UserType]: UserType.Admin }));
      const { context } = makeContext();

      await expect(build(AdminAccoutGuard).canActivate(context)).resolves.toBe(
        true,
      );
    });

    it('accepts any user type when the guard is untyped', async () => {
      authenticateAs(claims({ [Globals.ClaimTypes.UserType]: UserType.Guest }));
      const { context } = makeContext();

      await expect(
        build(AuthenticatedAccountGuard).canActivate(context),
      ).resolves.toBe(true);
    });
  });

  describe('session revocation via securityStamp', () => {
    it('rejects when the cached securityStamp differs (password changed)', async () => {
      authenticateAs(claims());
      jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue({
        securityStamp: 'rotated-after-password-change',
        concurrencyStamp: 'concurrency-1',
      } as never);

      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('signals a token refresh when only the concurrencyStamp differs', async () => {
      authenticateAs(claims());
      jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue({
        securityStamp: 'stamp-1',
        concurrencyStamp: 'changed',
      } as never);

      const { context, response } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).resolves.toBe(
        true,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Token-Refresh-Required',
        'true',
      );
    });

    describe('cache miss — finding C5, now fixed', () => {
      // Previously the whole securityStamp comparison sat inside `if (userAccount)`,
      // so a cache miss skipped revocation entirely. Because main.ts starts without
      // Redis by design and the entry expires after 7 days, a password change did not
      // reliably end existing sessions. These tests pin the DB fallback.

      it('rejects a revoked session by reading the database', async () => {
        // The token carries a stale stamp; the database has the rotated one.
        authenticateAs(claims({ [Globals.ClaimTypes.SecurityStamp]: 'stale' }));
        jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue(null as never);

        const repo = identityRepo();
        const { context } = makeContext();

        await expect(
          build(UserAccoutGuard, repo).canActivate(context),
        ).rejects.toThrow(UnauthorizedException);

        expect(repo.getUserByIdAsync).toHaveBeenCalledWith('user-1');
      });

      it('allows a valid session and repopulates the cache', async () => {
        // The fallback must not log out users who are simply cold-cached — that is
        // why failing closed without a DB read would have been an outage.
        authenticateAs(claims());
        jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue(null as never);

        const repo = identityRepo();
        const { context } = makeContext();

        await expect(
          build(UserAccoutGuard, repo).canActivate(context),
        ).resolves.toBe(true);

        expect(repo.cacheUserAccountAsync).toHaveBeenCalledTimes(1);
      });

      it('rejects when the token names a user that no longer exists', async () => {
        authenticateAs(claims());
        jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue(null as never);

        const repo = identityRepo({
          getUserByIdAsync: jest.fn().mockResolvedValue(null),
        });
        const { context } = makeContext();

        await expect(
          build(UserAccoutGuard, repo).canActivate(context),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('fails CLOSED when the database is also unreachable', async () => {
        // Neither source can confirm the session is still valid, so it must not be
        // trusted. Allowing the request is exactly what made revocation unreliable.
        authenticateAs(claims());
        jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue(null as never);

        const repo = identityRepo({
          getUserByIdAsync: jest
            .fn()
            .mockRejectedValue(new Error('connection refused')),
        });
        const { context } = makeContext();

        await expect(
          build(UserAccoutGuard, repo).canActivate(context),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('still succeeds when only the cache repopulation fails', async () => {
        // A Redis write failure is not a reason to reject: the comparison already
        // ran against authoritative database values.
        authenticateAs(claims());
        jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue(null as never);

        const repo = identityRepo({
          cacheUserAccountAsync: jest
            .fn()
            .mockRejectedValue(new Error('redis down')),
        });
        const { context } = makeContext();

        await expect(
          build(UserAccoutGuard, repo).canActivate(context),
        ).resolves.toBe(true);
      });

      it('does not touch the database when the cache hits', async () => {
        // The fallback must stay a fallback — a DB read on every request would add
        // latency to the hot path.
        authenticateAs(claims());
        jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue({
          securityStamp: 'stamp-1',
          concurrencyStamp: 'concurrency-1',
        } as never);

        const repo = identityRepo();
        const { context } = makeContext();

        await expect(
          build(UserAccoutGuard, repo).canActivate(context),
        ).resolves.toBe(true);

        expect(repo.getUserByIdAsync).not.toHaveBeenCalled();
      });
    });
  });
});
