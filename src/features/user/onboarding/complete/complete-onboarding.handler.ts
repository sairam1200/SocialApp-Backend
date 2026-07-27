import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import _const from '../../../../core/utils/const';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { UserNotFoundException } from '../../../../core/exceptions';

import { IIdentityRepository } from '../../../../domain/repositories/iidentity.repository';
import { OnboardingStep } from '../../../../domain/enums';
import { ITokenService } from '../../../../domain/services/itoken.service';

export class CompleteOnboardingResponse {
  succeeded: boolean;
  data?: {
    onboardingCompleted: boolean;
    accessToken?: string;
  };
  error?: string;
}

export class CompleteOnboardingModel {
  @ApiProperty()
  fullName: string;

  @ApiProperty()
  bio: string;

  @ApiProperty()
  location: string;

  @ApiProperty({ type: [String] })
  interests: string[];

  @ApiProperty()
  connectedAccounts: Record<string, string>;

  constructor(request: Partial<CompleteOnboardingModel> = {}) {
    Object.assign(this, request);
  }
}

export class CompleteOnboardingCommand {
  model: CompleteOnboardingModel;

  constructor(request: Partial<CompleteOnboardingCommand> = {}) {
    Object.assign(this, request);
  }
}

const completeOnboardingValidations = Joi.object({
  fullName: Joi.string().required(),
  bio: Joi.string().allow('').optional(),
  location: Joi.string().allow('').optional(),
  interests: Joi.array().items(Joi.string()).required(),
  connectedAccounts: Joi.object().optional(),
});

@CommandHandler(CompleteOnboardingCommand)
export class CompleteOnboardingCommandHandler implements ICommandHandler<CompleteOnboardingCommand> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.ITOKEN_SERVICE)
    private readonly tokenService: ITokenService,
  ) {}

  public async execute(
    command: CompleteOnboardingCommand,
  ): Promise<CompleteOnboardingResponse> {
    await completeOnboardingValidations.validateAsync(command.model);

    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );

    if (!user) {
      throw new UserNotFoundException();
    }

    const [firstName, ...rest] = command.model.fullName.trim().split(' ');

    user.firstName = firstName;
    user.lastName = rest.join(' ');

    user.bio = command.model.bio;

    user.onboardingStep = OnboardingStep.Completed;

    await this.userRepository.updateAsync(user);

    // Generate new JWT with updated onboardingStep claim
    const accessToken = await this.tokenService.generateJwtAsync(user);

    return {
      succeeded: true,
      data: {
        onboardingCompleted: true,
        accessToken,
      },
    };
  }
}
