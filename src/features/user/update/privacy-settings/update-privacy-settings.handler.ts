import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { UserNotFoundException } from '../../../../core/exceptions/user.exception';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';
import { ProfilePrivacy } from '../../../../domain/enums';

export class UpdatePrivacySettingsRequestModel {
  @ApiProperty({
    enum: ProfilePrivacy,
    description: 'Profile privacy setting: Public or Private',
  })
  profilePrivacy: ProfilePrivacy;
}

export class UpdatePrivacySettingsCommand {
  model: UpdatePrivacySettingsRequestModel;

  constructor(request: Partial<UpdatePrivacySettingsCommand> = {}) {
    Object.assign(this, request);
  }
}

const updatePrivacySettingsValidations = Joi.object({
  profilePrivacy: Joi.string()
    .valid(...Object.values(ProfilePrivacy))
    .required(),
});

@CommandHandler(UpdatePrivacySettingsCommand)
export class UpdatePrivacySettingsCommandHandler
  implements ICommandHandler<UpdatePrivacySettingsCommand>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  public async execute(command: UpdatePrivacySettingsCommand): Promise<void> {
    const { model } = command;

    await updatePrivacySettingsValidations.validateAsync(model);

    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user) {
      throw new UserNotFoundException();
    }

    user.profilePrivacy = model.profilePrivacy;
    await this.userRepository.updateAsync(user);
  }
}
