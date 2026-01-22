import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import _const from "../../../../../core/utils/const";
import { NotificationChannel } from "../../../../../domain/enums";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../../core/middlewares/httpContext.middleware";
import { IUserPreferenceRepository } from "../../../../../domain/repositories/iuserPreference.repository";

export class UpdateNotificationSettingRequestModel {
  @ApiProperty({ isArray: true, enum: NotificationChannel })
  notificationChannelsEnabled: NotificationChannel[];

  constructor(request: Partial<UpdateNotificationSettingRequestModel> = {}) {
    Object.assign(this, request);
  }
}

export class UpdateNotificationSettingCommand {
  model: UpdateNotificationSettingRequestModel;

  constructor(request: Partial<UpdateNotificationSettingCommand> = {}) {
    Object.assign(this, request);
  }
}

const updateNotificationSettingValidations = Joi.object({
  notificationChannelsEnabled: Joi.array()
    .items(Joi.string().valid(...Object.values(NotificationChannel)))
    .min(1)
    .required(),
});

@CommandHandler(UpdateNotificationSettingCommand)
export class UpdateNotificationSettingCommandHandler implements ICommandHandler<UpdateNotificationSettingCommand> {
  constructor(
    @Inject(_const.IUSERPREFERENCE_REPOSITORY) private readonly userPreferenceRepository: IUserPreferenceRepository,
  ) { }

  public async execute(command: UpdateNotificationSettingCommand): Promise<void> {
    await updateNotificationSettingValidations.validateAsync(command.model);

    const userId = HttpContext.getCurrentUserId;
    await this.userPreferenceRepository.updateNotificationChannelsAsync(
      userId,
      command.model.notificationChannelsEnabled,
    );
  }
}
