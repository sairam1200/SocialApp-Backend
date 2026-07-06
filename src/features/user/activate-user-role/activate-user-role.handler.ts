import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserNotFoundException } from '../../../core/exceptions';
import { RoleNotFoundException } from '../../../core/exceptions/role.exception';
import { IUserRepository } from '../../../domain/repositories/iuser.repository';
import { IRoleRepository } from '../../../domain/repositories/irole.repository';
import { IUserRoleRepository } from '../../../domain/repositories/iuserRole.repository';
import { BadRequestException } from '@nestjs/common';

export class ActivateUserRoleCommand {
  userId: string;
  roleId: string;

  constructor(request: Partial<ActivateUserRoleCommand> = {}) {
    Object.assign(this, request);
  }
}

const activateUserRoleValidations = Joi.object({
  userId: Joi.string().required(),
  roleId: Joi.string().required(),
});

@CommandHandler(ActivateUserRoleCommand)
export class ActivateUserRoleCommandHandler
  implements ICommandHandler<ActivateUserRoleCommand>
{
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.IROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
    @Inject(_const.IUSERROLE_REPOSITORY)
    private readonly userRoleRepository: IUserRoleRepository,
  ) {}

  public async execute(command: ActivateUserRoleCommand): Promise<void> {
    await activateUserRoleValidations.validateAsync(command);

    const user = await this.userRepository.getUserByIdAsync(command.userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    const role = await this.roleRepository.getByIdAsync(command.roleId);
    if (!role) {
      throw new RoleNotFoundException('', command.roleId);
    }

    const userRole = await this.userRoleRepository.getAsync(
      command.userId,
      command.roleId,
    );
    if (!userRole) {
      throw new BadRequestException('User role assignment not found.');
    }

    if (!userRole.isDisabled) {
      return;
    }

    userRole.isDisabled = false;
    userRole.disabledUntil = null;

    await this.userRoleRepository.updateAsync(userRole);
  }
}
