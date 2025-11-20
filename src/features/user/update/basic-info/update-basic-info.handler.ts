import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { UserNotFoundException } from "../../../../core/exceptions";
import { IUserRepository } from "../../../../domain/repositories/iuser.repository";

export class UpdateBasicInfoModel {
  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  gender: string;

  constructor(request: Partial<UpdateBasicInfoModel> = {}) {
    Object.assign(this, request);
  }
}

export class UpdateBasicInfoCommand {
  model: UpdateBasicInfoModel;

  constructor(request: Partial<UpdateBasicInfoCommand> = {}) {
    Object.assign(this, request);
  }
}

const updateBasicInfoValidations = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  gender: Joi.string().required(),
});

@CommandHandler(UpdateBasicInfoCommand)
export class UpdateBasicInfoCommandHandler implements ICommandHandler<UpdateBasicInfoCommand> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(command: UpdateBasicInfoCommand): Promise<void> {
    await updateBasicInfoValidations.validateAsync(command.model);

    const user = await this.userRepository.getUserByIdAsync(HttpContext.getCurrentUserId);
    if (!user) {
      throw new UserNotFoundException();
    }

    user.firstName = command.model.firstName;
    user.lastName = command.model.lastName;
    user.gender = command.model.gender;

    await this.userRepository.updateAsync(user);
  }
}

