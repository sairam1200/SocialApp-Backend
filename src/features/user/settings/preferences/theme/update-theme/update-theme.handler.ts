import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../../../core/utils/const';
import { NotificationChannel, Theme } from '../../../../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../../../core/middlewares/httpContext.middleware';
import { IUserPreferenceRepository } from '../../../../../../domain/repositories/iuserPreference.repository';
import { UserPreference } from '../../../../../../domain/entities';

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
  theme: Joi.string()
    .valid(...Object.values(Theme))
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

@CommandHandler(UpdateThemeCommand)
export class UpdateThemeCommandHandler
  implements ICommandHandler<UpdateThemeCommand>
{
  constructor(
    @Inject(_const.IUSERPREFERENCE_REPOSITORY)
    private readonly userPreferenceRepository: IUserPreferenceRepository,
  ) {}

  public async execute(command: UpdateThemeCommand): Promise<void> {
    await updateThemeValidations.validateAsync(command.model);

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

    preferences.notificationChannelsEnabled = normalizeChannels(
      preferences.notificationChannelsEnabled,
    );
    preferences.theme = command.model.theme;

    if (existing) {
      await this.userPreferenceRepository.updateAsync(preferences);
      return;
    }

    await this.userPreferenceRepository.createAsync(preferences);
  }
}
