import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { Globals } from '../globals';
import * as jwtUtil from '../utils/jwt.util';

/**
 * Regression tests for finding C3 in
 * docs/audit/2026-07_Security_And_Correctness_Audit.md.
 *
 * The guard previously authorised with:
 *     requiredPermission.includes(grantedPermission)
 *
 * which asks whether the *required* permission contains the *granted* one as a
 * substring. That inverted test meant an empty-string grant authorised every
 * endpoint, and a coarse grant such as "User" authorised any Controller.method
 * whose combined name contained it.
 *
 * These tests pin the corrected semantics. If someone reintroduces a substring
 * or prefix comparison, the "must reject" cases below fail.
 */

// A controller/handler pair whose derived permission is
// 'UserController.deleteUser' — deliberately containing shorter words like
// 'User' and 'delete' so substring matching would visibly over-grant.
class UserController {
  deleteUser() {
    /* referenced only for its name */
  }
}

function makeContext(): ExecutionContext {
  const request: Record<string, unknown> = {
    headers: { authorization: 'Bearer test-token' },
  };
  const response = { setHeader: jest.fn() };

  const controllerInstance = new UserController();

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => controllerInstance.deleteUser,
    getClass: () => UserController,
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let verifySpy: jest.SpyInstance;

  /** Stub token verification so these tests exercise authorisation only. */
  function grant(permission: unknown) {
    verifySpy.mockResolvedValue({
      [Globals.ClaimTypes.UserId]: 'user-1',
      permission,
    });
  }

  beforeEach(() => {
    // The guard only uses jwtService via getUserFromAccessTokenAsync, which we stub.
    guard = new PermissionsGuard({} as never);
    verifySpy = jest.spyOn(jwtUtil, 'getUserFromAccessTokenAsync');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('grants access', () => {
    it('on an exact Controller.method match', async () => {
      grant(['UserController.deleteUser']);
      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });

    it('on a global "*" wildcard', async () => {
      grant(['*']);
      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });

    it('on a controller-scoped "Controller.*" wildcard', async () => {
      grant(['UserController.*']);
      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });

    it('when the matching permission sits among unrelated grants', async () => {
      grant([
        'RoleController.createRole',
        'UserController.deleteUser',
        'DiscoverController.trending',
      ]);
      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    });
  });

  describe('denies access — these are the C3 regressions', () => {
    it('rejects an empty-string permission (previously granted EVERY endpoint)', async () => {
      grant(['']);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a coarse substring grant such as "User"', async () => {
      grant(['User']);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a partial method-name grant such as "delete"', async () => {
      grant(['delete']);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a different controller with a same-named method', async () => {
      grant(['AdminController.deleteUser']);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a wildcard scoped to a different controller', async () => {
      grant(['AdminController.*']);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects an empty permission array', async () => {
      grant([]);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when the permission claim is absent', async () => {
      grant(undefined);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a non-array permission claim without throwing a type error', async () => {
      // A malformed token must produce 403, not an unhandled 500.
      grant('UserController.deleteUser');
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ignores non-string entries mixed into the permission array', async () => {
      grant([null, 42, {}, []]);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('authentication preconditions', () => {
    it('rejects a request with no Authorization header', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
          getResponse: () => ({ setHeader: jest.fn() }),
        }),
        getHandler: () => () => undefined,
        getClass: () => UserController,
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when token verification fails', async () => {
      verifySpy.mockResolvedValue(undefined);
      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when two-factor authentication is still outstanding', async () => {
      verifySpy.mockResolvedValue({
        [Globals.ClaimTypes.UserId]: 'user-1',
        [Globals.ClaimTypes.TwoFARequired]: true,
        permission: ['UserController.deleteUser'],
      });

      await expect(guard.canActivate(makeContext())).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('verifies the token WITH expiry enforcement', async () => {
      // This guard must not opt out of expiry checking. getUserFromAccessTokenAsync
      // defaults ignoreExpiration to false, so it must be called with at most
      // three arguments — passing a fourth truthy argument would disable it.
      grant(['UserController.deleteUser']);
      await guard.canActivate(makeContext());

      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(verifySpy.mock.calls[0][3]).toBeUndefined();
    });
  });
});
