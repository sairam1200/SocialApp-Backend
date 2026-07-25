import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserNotFoundException } from '../../../core/exceptions';
import { IIdentityRepository } from '../../../domain/repositories/iidentity.repository';

export class ActivateUserCommand {
  userId: string;

  constructor(request: Partial<ActivateUserCommand> = {}) {
    Object.assign(this, request);
  }
}

const activateUserValidations = Joi.object({
  userId: Joi.string().required(),
});

@CommandHandler(ActivateUserCommand)
export class ActivateUserCommandHandler implements ICommandHandler<ActivateUserCommand> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
  ) {}

  public async execute(command: ActivateUserCommand): Promise<void> {
    await activateUserValidations.validateAsync(command);

    const user = await this.userRepository.getUserByIdAsync(command.userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    if (user.isActive) {
      return;
    }

    user.isActive = true;
    await this.userRepository.updateAsync(user);
  }
}
