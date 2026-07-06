import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { ITopicRepository } from '../../../domain/repositories';
import { TopicModel } from '../../../domain/contracts/onboarding.model';

export class GetTopicsQuery {
  constructor(request: Partial<GetTopicsQuery> = {}) {
    Object.assign(this, request);
  }
}

@QueryHandler(GetTopicsQuery)
export class GetTopicsQueryHandler
  implements IQueryHandler<GetTopicsQuery, TopicModel[]>
{
  constructor(
    @Inject(_const.ITOPIC_REPOSITORY)
    private readonly topicRepository: ITopicRepository,
  ) {}

  public async execute(query: GetTopicsQuery): Promise<TopicModel[]> {
    const topics = await this.topicRepository.getAllAsync();
    console.log('TOPICS FROM DB:', topics.length);
    return topics.map(
      (topic) =>
        new TopicModel({
          id: topic.id,
          name: topic.name,
          description: topic.description,
          icon: topic.icon,
          isActive: topic.isActive,
        }),
    );
  }
}
