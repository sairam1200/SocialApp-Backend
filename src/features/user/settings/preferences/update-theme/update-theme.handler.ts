import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../../core/utils/const";
import { Theme } from "../../../../../domain/enums";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../../core/middlewares/httpContext.middleware";
import { IUserPreferenceRepository } from "../../../../../domain/repositories/iuserPreference.repository";

export class UpdateThemeRequestModel {
  @ApiProperty({ enum: Theme })
  theme: Theme;

  constructor(request: Partial<UpdateThemeRequestModel> = {}) {
    Object.assign(this, request);
  }
}

export class UpdateThemeCommand {
  model: UpdateThemeRequestModel;

  constructor(request: Partial<UpdateThemeCommand> = {}) {
    Object.assign(this, request);
  }
}

const updateThemeValidations = Joi.object({
  theme: Joi.string().valid(...Object.values(Theme)).required(),
});

@CommandHandler(UpdateThemeCommand)
export class UpdateThemeCommandHandler implements ICommandHandler<UpdateThemeCommand> {
  constructor(
    @Inject(_const.IUSERPREFERENCE_REPOSITORY) private readonly userPreferenceRepository: IUserPreferenceRepository,
  ) { }

  public async execute(command: UpdateThemeCommand): Promise<void> {
    await updateThemeValidations.validateAsync(command.model);

    const userId = HttpContext.getCurrentUserId;
    await this.userPreferenceRepository.updateThemeAsync(userId, command.model.theme);
  }
}
