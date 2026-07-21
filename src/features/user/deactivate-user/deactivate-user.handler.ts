import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserNotFoundException } from '../../../core/exceptions';
import { IIdentityRepository } from '../../../domain/repositories/iidentity.repository';
import { randomUUID } from 'crypto';
export class DeactivateUserCommand {
  userId: string;

  constructor(request: Partial<DeactivateUserCommand> = {}) {
    Object.assign(this, request);
  }
}

const deactivateUserValidations = Joi.object({
  userId: Joi.string().required(),
});

@CommandHandler(DeactivateUserCommand)
export class DeactivateUserCommandHandler
  implements ICommandHandler<DeactivateUserCommand>
{
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
  ) {}

  public async execute(command: DeactivateUserCommand): Promise<void> {
    await deactivateUserValidations.validateAsync(command);

    const user = await this.userRepository.getUserByIdAsync(command.userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    if (!user.isActive) {
      return;
    }

    user.isActive = false;

    user.securityStamp = randomUUID();

    await this.userRepository.updateAsync(user);
  }
}
