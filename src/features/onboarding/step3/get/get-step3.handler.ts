import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { OnboardingStep } from '../../../../domain/enums';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { IIdentityRepository } from '../../../../domain/repositories';
import { OnboardingStatusModel } from '../../../../domain/contracts/onboarding.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { UserNotFoundException } from '../../../../core/exceptions';

export class GetOnboardingStep3Query {
  constructor(request: Partial<GetOnboardingStep3Query> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(GetOnboardingStep3Query)
export class GetOnboardingStep3QueryHandler implements IQueryHandler<
  GetOnboardingStep3Query,
  OnboardingStatusModel
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
  ) {}

  public async execute(
    query: GetOnboardingStep3Query,
  ): Promise<OnboardingStatusModel> {
    const userId = HttpContext.getCurrentUserId;
    const user = await this.userRepository.getUserByIdAsync(userId);

    if (!user) {
      throw new UserNotFoundException();
    }

    const currentStep = user.onboardingStep || OnboardingStep.NotStarted;

    return new OnboardingStatusModel({
      currentStep,
      isCompleted: currentStep === OnboardingStep.Completed,
    });
  }
}
