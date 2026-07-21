import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { OnboardingStep } from '../../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  IIdentityRepository,
  ITopicRepository,
} from '../../../../domain/repositories';
import {
  OnboardingStep2Model,
  OnboardingStatusModel,
} from '../../../../domain/contracts/onboarding.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  UserNotFoundException,
  ApplicationException,
} from '../../../../core/exceptions';

export class OnboardingStep2Command {
  model: OnboardingStep2Model;

  constructor(request: Partial<OnboardingStep2Command> = {}) {
    Object.assign(this, request);
  }
}

const step2Validations = Joi.object<OnboardingStep2Model>({
  topicIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

@CommandHandler(OnboardingStep2Command)
export class OnboardingStep2CommandHandler
  implements ICommandHandler<OnboardingStep2Command, OnboardingStatusModel>
{
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.ITOPIC_REPOSITORY)
    private readonly topicRepository: ITopicRepository,
  ) {}

  public async execute(
    command: OnboardingStep2Command,
  ): Promise<OnboardingStatusModel> {
    const { model } = command;
    await step2Validations.validateAsync(model);

    const userId = HttpContext.getCurrentUserId;
    const user = await this.userRepository.getUserByIdAsync(userId);

    if (!user) {
      throw new UserNotFoundException();
    }

    // Validate that all topic IDs exist
    const topics = await this.topicRepository.getByIdsAsync(model.topicIds);
    if (topics.length !== model.topicIds.length) {
      throw new ApplicationException('One or more topic IDs are invalid');
    }

    // Save user topics
    await this.topicRepository.createUserTopicsAsync(userId, model.topicIds);

    // Update onboarding step
    if (
      user.onboardingStep === OnboardingStep.ProfileData ||
      user.onboardingStep === OnboardingStep.NotStarted
    ) {
      user.onboardingStep = OnboardingStep.Topics;
    }

    await this.userRepository.updateAsync(user);

    return new OnboardingStatusModel({
      currentStep: user.onboardingStep,
      isCompleted: user.onboardingStep === OnboardingStep.Completed,
    });
  }
}
