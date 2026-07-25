import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IRoleRepository } from '../../../domain/repositories/irole.repository';
import { RoleNotFoundException } from '../../../core/exceptions/role.exception';

export class DeactivateRoleRequestModel {
  @ApiProperty()
  roleId: string;

  @ApiProperty()
  endDate?: Date;
}

export class DeactivateRoleCommand {
  model: DeactivateRoleRequestModel;

  constructor(request: Partial<DeactivateRoleCommand> = {}) {
    Object.assign(this, request);
  }
}

const deactivateRoleValidations = Joi.object({
  roleId: Joi.string().required(),
});

@CommandHandler(DeactivateRoleCommand)
export class DeactivateRoleHandler implements ICommandHandler<DeactivateRoleCommand> {
  constructor(
    @Inject(_const.IROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
  ) {}

  public async execute(command: DeactivateRoleCommand): Promise<void> {
    await deactivateRoleValidations.validateAsync(command.model);

    const role =
      (await this.roleRepository.getByIdAsync(command.model.roleId)) ??
      (() => {
        throw new RoleNotFoundException('', command.model.roleId);
      })();

    if (role.isDisabled) {
      return;
    }

    role.isDisabled = true;
    role.disabledUntil = command.model.endDate;

    await this.roleRepository.updateAsync(role);
    //TODO: send email notification to all users in role
  }
}
