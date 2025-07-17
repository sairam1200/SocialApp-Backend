import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { UserType } from "../../../../domain/enums";
import { ManualProfile } from "../../../../domain/entities";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { UserNotFoundException } from "../../../../core/exceptions";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { mapToManualProfileModel } from "../../../../domain/mappers/manualProfile.mapper";
import { IManualProfileRepository, IUserRepository } from "../../../../domain/repositories";
import { CreateManualProfileModel, ManualProfileModel } from "../../../../domain/contracts/manualProfile.model";

export class CreateManualProfileCommand {
  model: CreateManualProfileModel

  constructor(request: Partial<CreateManualProfileCommand> = {}) {
    Object.assign(this, request);
  }
}

const createUserValidations = Joi.object({
  url: Joi.string().required().uri(),
  platform: Joi.string().required(),
  icon: Joi.string().optional(),
});

@CommandHandler(CreateManualProfileCommand)
export class CreateManualProfileCommandHandler implements ICommandHandler<CreateManualProfileCommand, ManualProfileModel> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(_const.IMANUALPROFILE_REPOSITORY) private readonly manualProfileRepository: IManualProfileRepository,
  ) { }

  public async execute(command: CreateManualProfileCommand): Promise<ManualProfileModel> {

    const { model } = command;
    await createUserValidations.validateAsync(model);

    const user = await this.userRepository.getUserByEmailAsync(HttpContext.getCurrentUserId)
    if (!user && user.type !== UserType.User) {
      throw new UserNotFoundException();
    }

    const manualProfile = await this.manualProfileRepository.createAsync(
      new ManualProfile({
        platform: model.platform,
        url: model.url,
        icon: model.icon,
        userId: user.id,
      }));


    return mapToManualProfileModel(manualProfile);
  }
} 