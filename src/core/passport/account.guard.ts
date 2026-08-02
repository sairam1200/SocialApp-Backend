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
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import dataSource from '../../infrastructure/persistence/data.source';

function createAccountGuard(
  type?: UserType,
  allowTwoFARequired: boolean = false,
  ignoreExpiration: boolean = false,
) {
  @Injectable()
  class AccessLevelGuard implements CanActivate {
    constructor(public jwtService: JwtService) {}

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
      const userAccount = await redis.getFromRedisAsync<{
        concurrencyStamp: string;
        securityStamp: string;
      }>(accountKey);

      if (userAccount) {
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
