import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import _const from '../utils/const';
import redis from '../utils/redis.util';
import { Globals } from '../globals';
import { OnboardingStep } from '../../domain/enums';
import { HttpContext } from '../middlewares/httpContext.middleware';

@Injectable()
export class OnboardingGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const claimsPrinciple = HttpContext.user;

    console.log('OnboardingGuard triggered');
    console.log('claimsPrinciple:', claimsPrinciple);

    if (!claimsPrinciple) {
      throw new UnauthorizedException(
        'Unauthorized: You need to log in to access onboarding.',
      );
    }

    const userId = claimsPrinciple[Globals.ClaimTypes.UserId];
    console.log('userId:', userId);

    if (!userId) {
      throw new UnauthorizedException('Unauthorized: Invalid user context.');
    }

    const accountKey = redis.getRedisKey<string>(
      `${userId}${_const.REDIS.USER.ACCOUNT}`,
    );
    console.log('accountKey:', accountKey);

    const userAccount = await redis.getFromRedisAsync<{
      usonboardingSteper: string;
      concurrencyStamp: string;
      securityStamp: string;
    }>(accountKey);

    console.log('userAccount:', userAccount);
    console.log('onboardingStep value:', userAccount?.usonboardingSteper);
    console.log('completed enum value:', OnboardingStep.Completed);

    if (userAccount?.usonboardingSteper === OnboardingStep.Completed) {
      throw new ForbiddenException(
        'Forbidden: Onboarding has already been completed.',
      );
    }

    return true;
  }
}