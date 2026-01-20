import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../domain/repositories";
import { OnboardingStatusModel } from "../../../domain/contracts/onboarding.model";
import { HttpContext } from "../../../core/middlewares/httpContext.middleware";
import { UserNotFoundException } from "../../../core/exceptions";
import { OnboardingStep } from "../../../domain/enums";

export class GetOnboardingStatusQuery {
  constructor(request: Partial<GetOnboardingStatusQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(GetOnboardingStatusQuery)
export class GetOnboardingStatusQueryHandler implements IQueryHandler<GetOnboardingStatusQuery, OnboardingStatusModel> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: GetOnboardingStatusQuery): Promise<OnboardingStatusModel> {
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
