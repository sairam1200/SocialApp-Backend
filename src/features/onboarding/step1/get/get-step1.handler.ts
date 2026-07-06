import { Inject } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { IUserRepository } from "../../../../domain/repositories";
import { OnboardingStep1Model } from "../../../../domain/contracts/onboarding.model";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { UserNotFoundException } from "../../../../core/exceptions";

export class GetOnboardingStep1Query {
  constructor(request: Partial<GetOnboardingStep1Query> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(GetOnboardingStep1Query)
export class GetOnboardingStep1QueryHandler implements IQueryHandler<GetOnboardingStep1Query, OnboardingStep1Model> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) { }

  public async execute(query: GetOnboardingStep1Query): Promise<OnboardingStep1Model> {
    const userId = HttpContext.getCurrentUserId;
    const user = await this.userRepository.getUserByIdAsync(userId);

    if (!user) {
      throw new UserNotFoundException();
    }

    const biometrics = user.biometrics || await this.userRepository.getUserBiometricAsync(user.id);
    const profileImageUrl = biometrics?.profileImageUrl || biometrics?.defaultProfileImageUrl || null;
    console.log({
  firstName: JSON.stringify(user.firstName),
  lastName: JSON.stringify(user.lastName),
});
    return new OnboardingStep1Model({
      profileImage: profileImageUrl,
      username: user.firstName+user.lastName || null,
      bio: user.bio || null,
    });
  }
}