import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../../core/utils/const';
import { NotificationChannel, Theme } from '../../../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../../core/middlewares/httpContext.middleware';
import { IUserPreferenceRepository } from '../../../../../domain/repositories/iuserPreference.repository';
import { UserPreference } from '../../../../../domain/entities';

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

const defaultNotificationChannelsEnabled = [
  NotificationChannel.InApp,
  NotificationChannel.Email,
  NotificationChannel.Push,
];

const normalizeChannels = (
  channels?: NotificationChannel[],
): NotificationChannel[] => {
  if (!channels || channels.length === 0) {
    return [...defaultNotificationChannelsEnabled];
  }

  const enabled = new Set(channels);
  enabled.add(NotificationChannel.InApp);

  return defaultNotificationChannelsEnabled.filter((channel) =>
    enabled.has(channel),
  );
};

@CommandHandler(UpdateNotificationSettingCommand)
export class UpdateNotificationSettingCommandHandler
  implements ICommandHandler<UpdateNotificationSettingCommand>
{
  constructor(
    @Inject(_const.IUSERPREFERENCE_REPOSITORY)
    private readonly userPreferenceRepository: IUserPreferenceRepository,
  ) {}

  public async execute(
    command: UpdateNotificationSettingCommand,
  ): Promise<void> {
    await updateNotificationSettingValidations.validateAsync(command.model);

    const userId = HttpContext.getCurrentUserId;
    const existing =
      await this.userPreferenceRepository.getByUserIdAsync(userId);
    const preferences =
      existing ??
      new UserPreference({
        userId,
        theme: Theme.System,
        notificationChannelsEnabled: [...defaultNotificationChannelsEnabled],
      });

    preferences.theme = preferences.theme ?? Theme.System;
    preferences.notificationChannelsEnabled = normalizeChannels(
      command.model.notificationChannelsEnabled,
    );

    if (existing) {
      await this.userPreferenceRepository.updateAsync(preferences);
      return;
    }

    await this.userPreferenceRepository.createAsync(preferences);
  }
}
