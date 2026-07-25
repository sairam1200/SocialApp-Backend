import * as Joi from 'joi';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../core/utils/const';
import { RoleType } from '../../../domain/enums';
import { BadRequestException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RoleModel } from '../../../domain/contracts/role.model';
import { IRoleRepository } from '../../../domain/repositories/irole.repository';
import { RoleNotFoundException } from '../../../core/exceptions/role.exception';

export class UpdateRoleModel {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  constructor(request: Partial<UpdateRoleModel> = {}) {
    Object.assign(this, request);
  }
}

export class UpdateRoleCommand {
  model: UpdateRoleModel;

  constructor(request: Partial<UpdateRoleCommand> = {}) {
    Object.assign(this, request);
  }
}

const updateRoleValidations = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().required(),
});

@CommandHandler(UpdateRoleCommand)
export class UpdateRoleHandler implements ICommandHandler<
  UpdateRoleCommand,
  RoleModel
> {
  constructor(
    @Inject(_const.IROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
  ) {}

  public async execute(command: UpdateRoleCommand): Promise<RoleModel> {
    await updateRoleValidations.validateAsync(command.model);

    const role =
      (await this.roleRepository.getByNameAsync(command.model.name)) ??
      (() => {
        throw new RoleNotFoundException(command.model.name);
      })();

    if (role.type === RoleType.System) {
      throw new BadRequestException(
        `Prevented: Not allowed to modify  "${role.name}" Role.`,
      );
    }

    role.name = command.model.name;
    role.normalizedName = command.model.name.toUpperCase();
    role.description = command.model.description;

    await this.roleRepository.updateAsync(role);

    const result = {
      id: role.id,
      name: role.name,
      type: role.type,
      permissionsCount: role.roleClaims?.length,
    } as RoleModel;

    return result;
  }
}
