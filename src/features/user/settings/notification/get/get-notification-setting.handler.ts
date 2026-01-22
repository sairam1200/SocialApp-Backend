import { Inject } from "@nestjs/common";
import _const from "../../../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../../core/middlewares/httpContext.middleware";
import { IUserPreferenceRepository } from "../../../../../domain/repositories/iuserPreference.repository";
import { NotificationPreferenceModel } from "../../../../../domain/contracts/userPreference.model";

export class GetNotificationSettingQuery {
  constructor(request: Partial<GetNotificationSettingQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(GetNotificationSettingQuery)
export class GetNotificationSettingQueryHandler implements ICommandHandler<GetNotificationSettingQuery> {
  constructor(
    @Inject(_const.IUSERPREFERENCE_REPOSITORY) private readonly userPreferenceRepository: IUserPreferenceRepository,
  ) { }

  public async execute(_: GetNotificationSettingQuery): Promise<NotificationPreferenceModel> {
    const userId = HttpContext.getCurrentUserId;
    const preferences = await this.userPreferenceRepository.getPreferencesAsync(userId);

    return new NotificationPreferenceModel({
      notificationChannelsEnabled: preferences.notificationChannelsEnabled,
    });
  }
}
