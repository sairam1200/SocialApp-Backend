import { Inject } from "@nestjs/common";
import _const from "../../../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../../core/middlewares/httpContext.middleware";
import { IUserPreferenceRepository } from "../../../../../domain/repositories/iuserPreference.repository";
import { UserPreferenceModel } from "../../../../../domain/contracts/userPreference.model";

export class GetPreferenceQuery {
  constructor(request: Partial<GetPreferenceQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(GetPreferenceQuery)
export class GetPreferenceQueryHandler implements ICommandHandler<GetPreferenceQuery> {
  constructor(
    @Inject(_const.IUSERPREFERENCE_REPOSITORY) private readonly userPreferenceRepository: IUserPreferenceRepository,
  ) { }

  public async execute(_: GetPreferenceQuery): Promise<UserPreferenceModel> {
    const userId = HttpContext.getCurrentUserId;
    const preferences = await this.userPreferenceRepository.getPreferencesAsync(userId);

    return new UserPreferenceModel({
      theme: preferences.theme,
      notificationChannelsEnabled: preferences.notificationChannelsEnabled,
    });
  }
}
