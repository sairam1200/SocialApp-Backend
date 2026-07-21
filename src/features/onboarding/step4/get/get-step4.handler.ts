import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import {
  IIdentityRepository,
  ITopicRepository,
} from '../../../../domain/repositories';
import { OnboardingStep4Model } from '../../../../domain/contracts/onboarding.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { UserNotFoundException } from '../../../../core/exceptions';

export class GetOnboardingStep4Query {
  constructor(request: Partial<GetOnboardingStep4Query> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(GetOnboardingStep4Query)
export class GetOnboardingStep4QueryHandler
  implements IQueryHandler<GetOnboardingStep4Query, OnboardingStep4Model>
{
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.ITOPIC_REPOSITORY)
    private readonly topicRepository: ITopicRepository,
  ) {}

  public async execute(
    query: GetOnboardingStep4Query,
  ): Promise<OnboardingStep4Model> {
    const userId = HttpContext.getCurrentUserId;
    const user = await this.userRepository.getUserByIdAsync(userId);

    if (!user) {
      throw new UserNotFoundException();
    }

    const biometrics =
      user.biometrics ||
      (await this.userRepository.getUserBiometricAsync(user.id));
    const profileImageUrl =
      biometrics?.profileImageUrl || biometrics?.defaultProfileImageUrl || null;
    const userTopics = await this.topicRepository.getByUserIdAsync(userId);
    const topics = await this.topicRepository.getByIdsAsync(
      userTopics.map((ut) => ut.topicId),
    );

    return new OnboardingStep4Model({
      profileImage: profileImageUrl,
      username: user.userName || null,
      bio: user.bio || null,
      topics: topics.map((t) => ({ id: t.id, name: t.name })),
      confirmed: false,
    });
  }
}
