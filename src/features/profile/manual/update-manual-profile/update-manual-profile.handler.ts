import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { UserType } from "../../../../domain/enums";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ApplicationException, UserNotFoundException } from "../../../../core/exceptions";
import { IManualProfileRepository, IUserRepository } from "../../../../domain/repositories";
import { UpdateManualProfileModel } from "../../../../domain/contracts/manualProfile.model";

export class UpdateManualProfileCommand {
  model: UpdateManualProfileModel

  constructor(request: Partial<UpdateManualProfileCommand> = {}) {
    Object.assign(this, request);
  }
}

const updateUserValidations = Joi.object({
  id: Joi.string().required(),
  url: Joi.string().required().uri(),
  platform: Joi.string().required(),
  icon: Joi.string().optional(),
});

@CommandHandler(UpdateManualProfileCommand)
export class UpdateManualProfileCommandHandler implements ICommandHandler<UpdateManualProfileCommand, void> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.IMANUALPROFILE_REPOSITORY)
    private readonly manualProfileRepository: IManualProfileRepository,
  ) { }

  public async execute(command: UpdateManualProfileCommand): Promise<void> {
    const { model } = command;

    await updateUserValidations.validateAsync(model);

    const user = await this.userRepository.getUserByIdAsync(HttpContext.getCurrentUserId);
    if (!user || user.type !== UserType.User) {
      throw new UserNotFoundException();
    }

    const manualProfile = await this.manualProfileRepository.getByIdAsync(model.id);
    if (!manualProfile || manualProfile.userId !== user.id) {
      throw new ApplicationException('Prevented: Manual profile not found.')
    }

    manualProfile.icon = model.icon;
    manualProfile.url = model.url;
    manualProfile.platform = model.platform;

    await this.manualProfileRepository.updateAsync(manualProfile);
  }
} 