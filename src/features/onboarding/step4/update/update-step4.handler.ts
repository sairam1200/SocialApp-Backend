import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { OnboardingStep } from '../../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IUserRepository } from '../../../../domain/repositories';
import { ITokenService } from '../../../../domain/services/itoken.service';
import {
  OnboardingStatusModel,
  OnboardingStep4Model,
} from '../../../../domain/contracts/onboarding.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  UserNotFoundException,
  ApplicationException,
} from '../../../../core/exceptions';

export class OnboardingStep4Command {
  model: OnboardingStep4Model;

  constructor(request: Partial<OnboardingStep4Command> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(OnboardingStep4Command)
export class OnboardingStep4CommandHandler
  implements ICommandHandler<OnboardingStep4Command, OnboardingStatusModel>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.ITOKEN_SERVICE) private readonly tokenService: ITokenService,
  ) {}

  public async execute(
    command: OnboardingStep4Command,
  ): Promise<OnboardingStatusModel> {
    const { model } = command;
    const userId = HttpContext.getCurrentUserId;
    const user = await this.userRepository.getUserByIdAsync(userId);

    if (!user) {
      throw new UserNotFoundException();
    }

    if (!model.confirmed) {
      throw new ApplicationException(
        'Confirmation is required to complete onboarding',
      );
    }

    // Mark onboarding as completed
    user.onboardingStep = OnboardingStep.Completed;
    await this.userRepository.updateAsync(user);

    // Generate new JWT with updated onboardingStep claim
    const accessToken = await this.tokenService.generateJwtAsync(user);

    return new OnboardingStatusModel({
      currentStep: user.onboardingStep,
      isCompleted: true,
      accessToken,
    });
  }
}
