import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { UserType } from "../../../../domain/enums";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { ApplicationException, UserNotFoundException } from "../../../../core/exceptions";
import { IManualProfileRepository, IUserRepository } from "../../../../domain/repositories";

export class DeleteManualProfileCommand {
  id: string

  constructor(request: Partial<DeleteManualProfileCommand> = {}) {
    Object.assign(this, request);
  }
}

const deleteUserValidations = Joi.object({
  id: Joi.string().required(),
});

@CommandHandler(DeleteManualProfileCommand)
export class DeleteManualProfileCommandHandler implements ICommandHandler<DeleteManualProfileCommand, void> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(_const.IMANUALPROFILE_REPOSITORY)
    private readonly manualProfileRepository: IManualProfileRepository,
  ) { }

  public async execute(command: DeleteManualProfileCommand): Promise<void> {
    const { id } = command;

    await deleteUserValidations.validateAsync(id);

    const user = await this.userRepository.getUserByIdAsync(HttpContext.getCurrentUserId);
    if (!user || user.type !== UserType.User) {
      throw new UserNotFoundException();
    }

    const manualProfile = await this.manualProfileRepository.getByIdAsync(id);
    if (!manualProfile || manualProfile.userId !== user.id) {
      throw new ApplicationException('Prevented: Manual profile not found.')
    }

    await this.manualProfileRepository.deleteAsync(manualProfile);
  }
} 