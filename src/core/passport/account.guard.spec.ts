import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
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

/** Instantiate one of the exported guard classes with a stub JwtService. */
function build(GuardClass: new (jwtService: unknown) => { canActivate(c: ExecutionContext): Promise<boolean> }) {
  return new GuardClass({} as never);
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

      await expect(
        build(UserAccoutGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token expired long ago', async () => {
      // Before the fix this succeeded — a token from a year back stayed valid.
      authenticateAs(claims({ exp: NOW_SECONDS() - 365 * 24 * 60 * 60 }));
      const { context } = makeContext();

      await expect(
        build(UserAccoutGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token with no exp claim at all', async () => {
      authenticateAs(claims({ exp: undefined }));
      const { context } = makeContext();

      await expect(
        build(UserAccoutGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token whose exp is not numeric', async () => {
      authenticateAs(claims({ exp: 'not-a-number' }));
      const { context } = makeContext();

      await expect(
        build(UserAccoutGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('sets the Token-Expired response header so the client can refresh', async () => {
      authenticateAs(claims({ exp: NOW_SECONDS() - 60 }));
      const { context, response } = makeContext();

      await expect(
        build(UserAccoutGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);

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

      await expect(
        build(RefreshTokenGuard).canActivate(context),
      ).resolves.toBe(true);
    });
  });

  describe('authentication', () => {
    it('rejects an unauthenticated request', async () => {
      authenticateAs(null);
      const { context } = makeContext();

      await expect(
        build(UserAccoutGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when two-factor authentication is outstanding', async () => {
      authenticateAs(claims({ [Globals.ClaimTypes.TwoFARequired]: true }));
      const { context } = makeContext();

      await expect(
        build(UserAccoutGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
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

      await expect(
        build(UserAccoutGuard).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
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

    it('DOCUMENTS finding C5: a cache miss skips revocation entirely', async () => {
      // Known open issue, deliberately asserted so the current behaviour is
      // visible rather than implied. A revoked session survives whenever Redis
      // misses or is unavailable. When C5 is fixed (DB fallback on cache miss),
      // this expectation must be inverted — that is the intended signal.
      authenticateAs(claims({ [Globals.ClaimTypes.SecurityStamp]: 'stale' }));
      jest.spyOn(redis, 'getFromRedisAsync').mockResolvedValue(null as never);

      const { context } = makeContext();

      await expect(build(UserAccoutGuard).canActivate(context)).resolves.toBe(
        true,
      );
    });
  });
});
