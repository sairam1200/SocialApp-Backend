import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { Globals } from '../../core/globals';
import { UserType } from "../../domain/enums";
import { extractTokenFromHeader, getUserFromAccessTokenAsync } from "../../core/utils/jwt.util";
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";

function createAccountGuard(type: UserType) {
  @Injectable()
  class AccessLevelGuard implements CanActivate {

    constructor(
      public jwtService: JwtService
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const response: Response = context.switchToHttp().getResponse();

      const access_token = extractTokenFromHeader(request);
      if (!access_token) {
        throw new UnauthorizedException('Unauthorized: You need to log in to access this resource.');
      }

      const user = await getUserFromAccessTokenAsync(access_token, response, this.jwtService);
      if (!user || user === undefined) {
        throw new UnauthorizedException('Unauthorized: Invalid or expired token.');
      }

      const hasType = user[Globals.ClaimTypes.UserType] as UserType === type;
      if (hasType) {
        return true;
      } else {
        throw new ForbiddenException('Forbidden: You do not have permission to access this resource.');
      }

    }
  }

  return AccessLevelGuard;
}

export const UserAccoutGuard = createAccountGuard(UserType.User);
export const AdminAccoutGuard = createAccountGuard(UserType.Admin);
export const GuestAccoutGuard = createAccountGuard(UserType.Guest);