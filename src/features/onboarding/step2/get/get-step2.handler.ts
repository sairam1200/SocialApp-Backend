import { Inject } from "@nestjs/common";
import _const from "../../../../core/utils/const";
import { QueryHandler, IQueryHandler } from "@nestjs/cqrs";
import { IUserRepository, ITopicRepository } from "../../../../domain/repositories";
import { OnboardingStep2Model } from "../../../../domain/contracts/onboarding.model";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { UserNotFoundException } from "../../../../core/exceptions";

export class GetOnboardingStep2Query {
  constructor(request: Partial<GetOnboardingStep2Query> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(GetOnboardingStep2Query)
export class GetOnboardingStep2QueryHandler implements IQueryHandler<GetOnboardingStep2Query, OnboardingStep2Model> {
  constructor(
    @Inject(_const.IUSER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(_const.ITOPIC_REPOSITORY) private readonly topicRepository: ITopicRepository,
  ) { }

  public async execute(query: GetOnboardingStep2Query): Promise<OnboardingStep2Model> {
    const userId = HttpContext.getCurrentUserId;
    const user = await this.userRepository.getUserByIdAsync(userId);
    
    if (!user) {
      throw new UserNotFoundException();
    }

    const userTopics = await this.topicRepository.getByUserIdAsync(userId);
    const topicIds = userTopics.map(ut => ut.topicId);

    return new OnboardingStep2Model({
      topicIds,
    });
  }
}
