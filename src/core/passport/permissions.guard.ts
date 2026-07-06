import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { Globals } from '../../core/globals';
import {
  extractTokenFromHeader,
  getUserFromAccessTokenAsync,
} from '../../core/utils/jwt.util';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response: Response = context.switchToHttp().getResponse();

    const access_token = extractTokenFromHeader(request);
    if (!access_token) {
      throw new UnauthorizedException(
        'Unauthorized: You need to log in to access this resource.',
      );
    }

    const claimsPrinciple = await getUserFromAccessTokenAsync(
      access_token,
      response,
      this.jwtService,
    );
    if (!claimsPrinciple || claimsPrinciple === undefined) {
      throw new UnauthorizedException(
        'Unauthorized: Invalid or expired token.',
      );
    }

    if (claimsPrinciple[Globals.ClaimTypes.TwoFARequired]) {
      throw new UnauthorizedException(
        'Unauthorized: Two-factor authentication code is required',
      );
    }

    const handler = context.getHandler();
    const controller = context.getClass();
    const requiredPermission = `${controller.name}.${handler.name}`;

    const hasPermission = claimsPrinciple.permission?.some(
      (permission: string) => requiredPermission.includes(permission),
    );
    if (hasPermission) {
      return true;
    } else {
      throw new ForbiddenException(
        'Forbidden: You do not have permission to access this resource.',
      );
    }
  }
}
