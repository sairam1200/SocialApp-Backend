import { Inject } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { OnboardingStep } from "../../../../domain/enums";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../../domain/repositories";
import { OnboardingStatusModel } from "../../../../domain/contracts/onboarding.model";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { UserNotFoundException } from "../../../../core/exceptions";

export class OnboardingStep3Command {
  constructor(request: Partial<OnboardingStep3Command> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(OnboardingStep3Command)
export class OnboardingStep3CommandHandler implements ICommandHandler<OnboardingStep3Command, OnboardingStatusModel> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: OnboardingStep3Command): Promise<OnboardingStatusModel> {
    const userId = HttpContext.getCurrentUserId;
    const user = await this.userRepository.getUserByIdAsync(userId);
    
    if (!user) {
      throw new UserNotFoundException();
    }

    // Move to confirmation step
    user.onboardingStep = OnboardingStep.Confirmation;
    await this.userRepository.updateAsync(user);

    return new OnboardingStatusModel({
      currentStep: user.onboardingStep,
      isCompleted: false, // Step 3 moves to Confirmation, not Completed
    });
  }
}
