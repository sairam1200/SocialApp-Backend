import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { UserType } from '../../../../domain/enums';
import { ForbiddenException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserNotFoundException } from '../../../../core/exceptions';
import { IUserRepository } from '../../../../domain/repositories/iuser.repository';

export class UpdateTypeModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: UserType;

  constructor(request: Partial<UpdateTypeModel> = {}) {
    Object.assign(this, request);
  }
}

export class UpdateTypeCommand {
  model: UpdateTypeModel;

  constructor(request: Partial<UpdateTypeCommand> = {}) {
    Object.assign(this, request);
  }
}

const updateTypeValidations = Joi.object({
  id: Joi.string().required(),
  type: Joi.string()
    .valid(...Object.values(UserType))
    .required(),
});

@CommandHandler(UpdateTypeCommand)
export class UpdateTypeCommandHandler
  implements ICommandHandler<UpdateTypeCommand>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  public async execute(command: UpdateTypeCommand): Promise<void> {
    await updateTypeValidations.validateAsync(command.model);

    const user = await this.userRepository.getUserByIdAsync(command.model.id);
    if (!user) {
      throw new UserNotFoundException();
    }

    if (user.type === UserType.User) {
      throw new ForbiddenException('Cannot update type for regular users.');
    }

    user.type = command.model.type;
    await this.userRepository.updateAsync(user);
  }
}
