import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import { UserType } from '../../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  ApplicationException,
  UserNotFoundException,
} from '../../../../core/exceptions';
import {
  IManualProfileRepository,
  IIdentityRepository,
} from '../../../../domain/repositories';

export class ReorderManualProfileRequestModel {
  @ApiProperty()
  id: string;

  @ApiProperty({ default: null })
  displayOrder?: number;
}

export class ReorderManualProfileCommand {
  model: ReorderManualProfileRequestModel;

  constructor(request: Partial<ReorderManualProfileCommand> = {}) {
    Object.assign(this, request);
  }
}

const updateUserValidations = Joi.object({
  id: Joi.string().required(),
  displayOrder: Joi.number().required(),
});

@CommandHandler(ReorderManualProfileCommand)
export class ReorderManualProfileCommandHandler implements ICommandHandler<
  ReorderManualProfileCommand,
  void
> {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IMANUALPROFILE_REPOSITORY)
    private readonly manualProfileRepository: IManualProfileRepository,
  ) {}

  public async execute(command: ReorderManualProfileCommand): Promise<void> {
    const { model } = command;

    await updateUserValidations.validateAsync(model);

    const user = await this.userRepository.getUserByIdAsync(
      HttpContext.getCurrentUserId,
    );
    if (!user || user.type !== UserType.User) {
      throw new UserNotFoundException();
    }

    const manualProfile = await this.manualProfileRepository.getByIdAsync(
      model.id,
    );
    if (!manualProfile || manualProfile.userId !== user.id) {
      throw new ApplicationException('Prevented: Manual profile not found.');
    }

    await this.manualProfileRepository.reorderAsync(
      model.id,
      model.displayOrder,
    );
  }
}
