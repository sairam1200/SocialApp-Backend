import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserNotFoundException } from '../../../core/exceptions';
import { RoleNotFoundException } from '../../../core/exceptions/role.exception';
import { IUserRepository } from '../../../domain/repositories/iuser.repository';
import { IRoleRepository } from '../../../domain/repositories/irole.repository';
import { IUserRoleRepository } from '../../../domain/repositories/iuserRole.repository';
import { BadRequestException } from '@nestjs/common';

export class DeactivateUserRoleModel {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  roleId: string;

  @ApiProperty({ required: false })
  endDate?: Date;

  constructor(request: Partial<DeactivateUserRoleModel> = {}) {
    Object.assign(this, request);
  }
}

export class DeactivateUserRoleCommand {
  model: DeactivateUserRoleModel;

  constructor(request: Partial<DeactivateUserRoleCommand> = {}) {
    Object.assign(this, request);
  }
}

const deactivateUserRoleValidations = Joi.object({
  userId: Joi.string().required(),
  roleId: Joi.string().required(),
  endDate: Joi.date().optional().allow(null),
});

@CommandHandler(DeactivateUserRoleCommand)
export class DeactivateUserRoleCommandHandler
  implements ICommandHandler<DeactivateUserRoleCommand>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.IROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
    @Inject(_const.IUSERROLE_REPOSITORY)
    private readonly userRoleRepository: IUserRoleRepository,
  ) {}

  public async execute(command: DeactivateUserRoleCommand): Promise<void> {
    await deactivateUserRoleValidations.validateAsync(command.model);

    const user = await this.userRepository.getUserByIdAsync(
      command.model.userId,
    );
    if (!user) {
      throw new UserNotFoundException();
    }

    const role = await this.roleRepository.getByIdAsync(command.model.roleId);
    if (!role) {
      throw new RoleNotFoundException('', command.model.roleId);
    }

    const userRole = await this.userRoleRepository.getAsync(
      command.model.userId,
      command.model.roleId,
    );
    if (!userRole) {
      throw new BadRequestException('User role assignment not found.');
    }

    if (userRole.isDisabled) {
      return;
    }

    userRole.isDisabled = true;
    userRole.disabledUntil = command.model.endDate || null;

    await this.userRoleRepository.updateAsync(userRole);
  }
}
