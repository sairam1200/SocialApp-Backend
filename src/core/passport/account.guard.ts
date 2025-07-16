import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { Globals } from '../../core/globals';
import { UserType } from "../../domain/enums";
import { extractTokenFromHeader, getUserFromAccessTokenAsync } from "../../core/utils/jwt.util";
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import logger from "../../core/utils/winston.util";

function createAccountGuard(type?: UserType, allowTwoFARequired: boolean = false, ignoreExpiration: boolean = false) {
  @Injectable()
  class AccessLevelGuard implements CanActivate {

    constructor(
      public jwtService: JwtService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const response: Response = context.switchToHttp().getResponse();

      logger.info(`[AccountGuard] Checking access for URL: ${request.url}`);
      logger.info(`[AccountGuard] Expected user type: ${type || 'Any'}`);
      logger.info(`[AccountGuard] Authorization header: ${request.headers.authorization ? 'Present' : 'Missing'}`);

      const access_token = extractTokenFromHeader(request);
      if (!access_token) {
        logger.error('[AccountGuard] No access token found');
        throw new UnauthorizedException('Unauthorized: You need to log in to access this resource.');
      }

      logger.info('[AccountGuard] Access token found, validating...');
      const claimsPrinciple = await getUserFromAccessTokenAsync(access_token, response, this.jwtService, ignoreExpiration);
      if (!claimsPrinciple || claimsPrinciple === undefined) {
        logger.error('[AccountGuard] Invalid or expired token');
        throw new UnauthorizedException('Unauthorized: Invalid or expired token.');
      }

      logger.info(`[AccountGuard] User validated. User type: ${claimsPrinciple[Globals.ClaimTypes.UserType]}`);

      if (claimsPrinciple[Globals.ClaimTypes.TwoFARequired] && !allowTwoFARequired) {
        logger.error('[AccountGuard] 2FA required but not allowed');
        throw new UnauthorizedException('Unauthorized: Two-factor authentication code is required');
      }

      if (type && type != undefined) {
        const userType = claimsPrinciple[Globals.ClaimTypes.UserType] as UserType;
        const hasType = userType === type;
        logger.info(`[AccountGuard] User type check: Expected=${type}, Actual=${userType}, Match=${hasType}`);
        if (hasType) {
          logger.info('[AccountGuard] Access granted');
          return true;
        } else {
          logger.error(`[AccountGuard] Access denied: User type mismatch`);
          throw new ForbiddenException('Forbidden: You do not have permission to access this resource.');
        }
      } else {
        logger.info('[AccountGuard] Access granted (no type restriction)');
        return true;
      }
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