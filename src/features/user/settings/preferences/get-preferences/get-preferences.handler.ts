import { Inject } from '@nestjs/common';
import _const from '../../../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../../core/middlewares/httpContext.middleware';
import { IUserPreferenceRepository } from '../../../../../domain/repositories/iuserPreference.repository';
import { UserPreferenceModel } from '../../../../../domain/contracts/userPreference.model';
import { NotificationChannel, Theme } from '../../../../../domain/enums';

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

export class GetPreferencesQuery {
  constructor(request: Partial<GetPreferencesQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(GetPreferencesQuery)
export class GetPreferencesQueryHandler implements ICommandHandler<GetPreferencesQuery> {
  constructor(
    @Inject(_const.IUSERPREFERENCE_REPOSITORY)
    private readonly userPreferenceRepository: IUserPreferenceRepository,
  ) {}

  public async execute(_: GetPreferencesQuery): Promise<UserPreferenceModel> {
    const userId = HttpContext.getCurrentUserId;
    const preferences =
      await this.userPreferenceRepository.getByUserIdAsync(userId);

    return new UserPreferenceModel({
      theme: preferences?.theme ?? Theme.System,
      notificationChannelsEnabled: normalizeChannels(
        preferences?.notificationChannelsEnabled,
      ),
    });
  }
}
