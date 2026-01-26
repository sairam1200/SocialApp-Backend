import { Inject } from "@nestjs/common";
import _const from "../../../../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { HttpContext } from "../../../../../../core/middlewares/httpContext.middleware";
import { IUserPreferenceRepository } from "../../../../../../domain/repositories/iuserPreference.repository";
import { ThemePreferenceModel } from "../../../../../../domain/contracts/userPreference.model";
import { Theme } from "../../../../../../domain/enums";

export class GetThemeQuery {
  constructor(request: Partial<GetThemeQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(GetThemeQuery)
export class GetThemeQueryHandler implements ICommandHandler<GetThemeQuery> {
  constructor(
    @Inject(_const.IUSERPREFERENCE_REPOSITORY) private readonly userPreferenceRepository: IUserPreferenceRepository,
  ) { }

  public async execute(_: GetThemeQuery): Promise<ThemePreferenceModel> {
    const userId = HttpContext.getCurrentUserId;
    const preferences = await this.userPreferenceRepository.findByUserIdAsync(userId);

    return new ThemePreferenceModel({
      theme: preferences?.theme ?? Theme.System,
    });
  }
}
