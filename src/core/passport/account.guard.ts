import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import _const from '../../core/utils/const';
import { Globals } from '../../core/globals';
import { UserType } from '../../domain/enums';
import redis from '../../core/utils/redis.util';
import logger from '../../core/utils/winston.util';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
<<<<<<< HEAD
import dataSource from '../../infrastructure/persistence/data.source';
=======
import { IIdentityRepository } from '../../domain/repositories/iidentity.repository';
>>>>>>> other/staging

function createAccountGuard(
  type?: UserType,
  allowTwoFARequired: boolean = false,
  ignoreExpiration: boolean = false,
) {
  @Injectable()
  class AccessLevelGuard implements CanActivate {
    constructor(
      public jwtService: JwtService,
      // Injected so session revocation can fall back to the database on a cache
      // miss. See the securityStamp block below — without this the check was
      // skipped entirely whenever Redis missed (finding C5).
      @Inject(_const.IIDENTITY_REPOSITORY)
      public identityRepository: IIdentityRepository,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const response: Response = context.switchToHttp().getResponse();

      const claimsPrinciple = HttpContext.user;
      if (!claimsPrinciple) {
        if (request.headers.authorization) {
          throw new UnauthorizedException(
            'Unauthorized: Invalid or expired token.',
          );
        } else {
          throw new UnauthorizedException(
            'Unauthorized: You need to log in to access this resource.',
          );
        }
      }

      // HttpContextMiddleware verifies tokens with ignoreExpiration=true so that
      // the refresh flow can still identify the caller from a lapsed access
      // token. Expiry is therefore enforced here instead, per guard — only
      // guards constructed with ignoreExpiration=true (RefreshTokenGuard) accept
      // an expired token.
      if (!ignoreExpiration) {
        const exp = claimsPrinciple.exp;
        if (typeof exp !== 'number') {
          throw new UnauthorizedException(
            'Unauthorized: Invalid or expired token.',
          );
        }
        if (exp * 1000 <= Date.now()) {
          response.setHeader('Token-Expired', 'true');
          throw new UnauthorizedException(
            'Unauthorized: Invalid or expired token.',
          );
        }
      }

      if (
        claimsPrinciple[Globals.ClaimTypes.TwoFARequired] &&
        !allowTwoFARequired
      ) {
        throw new UnauthorizedException(
          'Unauthorized: Two-factor authentication code is required',
        );
      }

      const userId = claimsPrinciple[Globals.ClaimTypes.UserId];
      const securityStamp = claimsPrinciple[Globals.ClaimTypes.SecurityStamp];
      const concurrencyStamp =
        claimsPrinciple[Globals.ClaimTypes.ConcurrencyStamp];
      const accountKey = redis.getRedisKey<string>(
        `${userId}${_const.REDIS.USER.ACCOUNT}`,
      );
      let userAccount = await redis.getFromRedisAsync<{
        concurrencyStamp: string;
        securityStamp: string;
      }>(accountKey);

      // Finding C5: this check used to run only `if (userAccount)`, so a cache miss
      // skipped session revocation entirely. Since main.ts deliberately starts
      // without Redis, and the cache entry expires after 7 days, that meant a
      // password change did not reliably end existing sessions — the guard's happy
      // path was the insecure one during any degradation.
      //
      // On a miss we now read the authoritative values from the database and
      // repopulate the cache, so the check always runs against real state. Failing
      // closed *without* this fallback would have logged out every user with a cold
      // cache, which is why the DB read had to come first.
      if (!userAccount) {
        try {
          const user = await this.identityRepository.getUserByIdAsync(userId);

          if (!user) {
            // The token names a user that no longer exists — deleted account, or a
            // token minted against a different database.
            logger.warn(
              `[AccountGuard] Token references unknown user ${userId} - rejecting`,
            );
            throw new UnauthorizedException(
              'Your session is no longer valid. Please log in again.',
            );
          }

          userAccount = {
            concurrencyStamp: user.concurrencyStamp,
            securityStamp: user.securityStamp,
          };

          // Repopulate so the next request is served from cache. Best-effort: a
          // Redis write failure must not fail the request now that the comparison
          // below has authoritative values anyway.
          await this.identityRepository
            .cacheUserAccountAsync(
              user,
              _const.REDIS.USER.ACCOUNT_SESSION_TTL_SEC,
            )
            .catch(() => undefined);
        } catch (error) {
          // Rethrow our own rejection; anything else is an infrastructure failure.
          if (error instanceof UnauthorizedException) throw error;

          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `[AccountGuard] Could not verify session for user ${userId} (${message}) - rejecting`,
          );

          // Fail closed. If neither Redis nor the database can confirm the session is
          // still valid, we cannot know whether it was revoked. Allowing the request
          // is what made revocation unreliable in the first place.
          throw new UnauthorizedException(
            'Unable to verify your session. Please try again.',
          );
        }
      } else {
        // Cache miss — fall back to database (fail closed)
        try {
          const ds = await dataSource;
          const result = await ds.query(
            `SELECT u."securityStamp", u."concurrencyStamp" 
             FROM identity.users u 
             WHERE u.id = $1 LIMIT 1`,
            [userId],
          );

          if (result?.length) {
            const dbUser = result[0];
            if (concurrencyStamp !== dbUser.concurrencyStamp) {
              response.setHeader('X-Token-Refresh-Required', 'true');
            }
            if (securityStamp !== dbUser.securityStamp) {
              logger.warn(
                `[AccountGuard] SecurityStamp mismatch (DB fallback) for user ${userId} - forcing re-authentication`,
              );
              response.setHeader('X-Password-Change', 'true');
              throw new UnauthorizedException(
                'Your session has been invalidated. Please log in again.',
              );
            }
          } else {
            // User not found in either Redis or DB — reject
            throw new UnauthorizedException(
              'Unauthorized: Unable to verify session.',
            );
          }
        } catch (dbError) {
          if (dbError instanceof UnauthorizedException) throw dbError;
          logger.error(
            `[AccountGuard] DB fallback failed for user ${userId}: ${dbError.message}`,
          );
          throw new UnauthorizedException(
            'Unauthorized: Unable to verify session.',
          );
        }
      }

      if (concurrencyStamp !== userAccount.concurrencyStamp) {
        response.setHeader('X-Token-Refresh-Required', 'true');
      }

      if (securityStamp !== userAccount.securityStamp) {
        logger.warn(
          `[AccountGuard] SecurityStamp mismatch for user ${userId} - forcing re-authentication`,
        );
        response.setHeader('X-Password-Change', 'true');
        throw new UnauthorizedException(
          'Your session has been invalidated. Please log in again.',
        );
      }

      if (type && type != undefined) {
        const userType = claimsPrinciple[
          Globals.ClaimTypes.UserType
        ] as UserType;
        if (userType !== type) {
          throw new ForbiddenException(
            'Forbidden: You do not have permission to access this resource.',
          );
        }
      }

      return true;
    }
  }

  return AccessLevelGuard;
}

export const UserAccoutGuard = createAccountGuard(UserType.User);
export const AdminAccoutGuard = createAccountGuard(UserType.Admin);
export const GuestAccoutGuard = createAccountGuard(UserType.Guest);
export const AuthenticatedAccountGuard = createAccountGuard(undefined);
export const TwoFAVerificationGuard = createAccountGuard(undefined, true);
export const RefreshTokenGuard = createAccountGuard(undefined, false, true);
