import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { RoleModel } from '../../../domain/contracts/role.model';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../core/utils/const';
import { RoleType } from '../../../domain/enums';
import { Role } from '../../../domain/entities/identity/role.entity';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IRoleRepository } from '../../../domain/repositories/irole.repository';
import { RoleAlreadyExistsException } from '../../../core/exceptions/role.exception';

export class CreateRoleModel {
  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  constructor(partial: Partial<CreateRoleModel> = {}) {
    Object.assign(this, partial);
  }
}

export class CreateRoleCommand {
  model: CreateRoleModel;

  constructor(request: Partial<CreateRoleCommand> = {}) {
    Object.assign(this, request);
  }
}

const createRoleValidations = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().required(),
});

@CommandHandler(CreateRoleCommand)
export class CreateRoleHandler
  implements ICommandHandler<CreateRoleCommand, RoleModel>
{
  constructor(
    @Inject(_const.IROLE_REPOSITORY)
    private readonly roleRepository: IRoleRepository,
  ) {}

  public async execute(command: CreateRoleCommand): Promise<RoleModel> {
    await createRoleValidations.validateAsync(command.model);

    let role = await this.roleRepository.getByNameAsync(command.model.name);

    if (role) {
      throw new RoleAlreadyExistsException(command.model.name);
    }

    role = await this.roleRepository.createAsync(
      new Role({
        name: command.model.name,
        description: command.model.description,
        type: RoleType.Regular,
      }),
    );

    const result = {
      id: role.id,
      name: role.name,
      type: role.type,
    } as RoleModel;

    return result;
  }
}
