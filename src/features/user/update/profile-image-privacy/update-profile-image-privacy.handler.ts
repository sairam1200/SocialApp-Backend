import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ProfileImagePrivacy } from '../../../../domain/enums';
import { UserNotFoundException } from '../../../../core/exceptions/user.exception';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';

export class UpdateProfileImagePrivacyRequestModel {
  @ApiProperty({ enum: ProfileImagePrivacy })
  privacy: ProfileImagePrivacy;
}

export class UpdateProfileImagePrivacyCommand {
  model: UpdateProfileImagePrivacyRequestModel;

  constructor(request: Partial<UpdateProfileImagePrivacyCommand> = {}) {
    Object.assign(this, request);
  }
}

const updateProfileImagePrivacyValidations = Joi.object({
  privacy: Joi.string()
    .valid(...Object.values(ProfileImagePrivacy))
    .required(),
});

@CommandHandler(UpdateProfileImagePrivacyCommand)
export class UpdateProfileImagePrivacyCommandHandler
  implements ICommandHandler<UpdateProfileImagePrivacyCommand>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  public async execute(
    command: UpdateProfileImagePrivacyCommand,
  ): Promise<void> {
    const { model } = command;

    await updateProfileImagePrivacyValidations.validateAsync(model);

    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UserNotFoundException();
    }

    await this.userRepository.updateUserBiometricPrivacyAsync(
      user.id,
      model.privacy,
    );
  }
}
