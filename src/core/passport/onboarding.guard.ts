import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import _const from '../utils/const';
import redis from '../utils/redis.util';
import logger from '../utils/winston.util';
import { Globals } from '../globals';
import { OnboardingStep } from '../../domain/enums';
import { HttpContext } from '../middlewares/httpContext.middleware';
import dataSource from '../../infrastructure/persistence/data.source';

@Injectable()
export class OnboardingGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const claimsPrinciple = HttpContext.user;

    if (!claimsPrinciple) {
      throw new UnauthorizedException(
        'Unauthorized: You need to log in to access onboarding.',
      );
    }

    const userId = claimsPrinciple[Globals.ClaimTypes.UserId];

    if (!userId) {
      throw new UnauthorizedException('Unauthorized: Invalid user context.');
    }

    const accountKey = redis.getRedisKey<string>(
      `${userId}${_const.REDIS.USER.ACCOUNT}`,
    );

    let userAccount = await redis.getFromRedisAsync<{
      useronboardingStep: string;
      concurrencyStamp: string;
      securityStamp: string;
    }>(accountKey);

    if (!userAccount) {
      try {
        const ds = await dataSource;
        const result = await ds.query(
          `SELECT u."onboardingStep" as "useronboardingStep"
           FROM identity.users u
           WHERE u.id = $1 LIMIT 1`,
          [userId],
        );
        if (result?.length) {
          userAccount = result[0];
        }
      } catch (error) {
        logger.error(`[OnboardingGuard] DB fallback failed for user ${userId}`);
      }
    }

    if (userAccount?.useronboardingStep === OnboardingStep.Completed) {
      throw new ForbiddenException(
        'Forbidden: Onboarding has already been completed.',
      );
    }

    return true;
  }
}
