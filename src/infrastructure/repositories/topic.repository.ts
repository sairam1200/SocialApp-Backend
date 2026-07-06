import { Repository, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Topic, UserTopic } from '../../domain/entities';
import { ITopicRepository } from '../../domain/repositories/itopic.repository';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';

@Injectable()
export class TopicRepository implements ITopicRepository {
  constructor(
    @InjectRepository(Topic)
    private readonly topicContext: Repository<Topic>,
    @InjectRepository(UserTopic)
    private readonly userTopicContext: Repository<UserTopic>,
  ) {}

  public async getAllAsync(): Promise<Topic[]> {
    return await this.topicContext.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  public async getByIdAsync(id: string): Promise<Topic | null> {
    return await this.topicContext.findOne({
      where: { id },
    });
  }

  public async getByIdsAsync(ids: string[]): Promise<Topic[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    return await this.topicContext.find({
      where: { id: In(ids), isActive: true },
    });
  }

  public async getByUserIdAsync(userId: string): Promise<UserTopic[]> {
    return await this.userTopicContext.find({
      where: { userId },
      relations: ['topic'],
    });
  }

  public async createUserTopicsAsync(
    userId: string,
    topicIds: string[],
  ): Promise<void> {
    if (!topicIds || topicIds.length === 0) {
      return;
    }

    // First, delete existing user topics
    await this.deleteAllUserTopicsAsync(userId);

    // Then create new ones
    const userTopics = topicIds.map((topicId) => {
      const userTopic = new UserTopic({
        userId,
        topicId,
      });
      if (HttpContext.user) {
        userTopic.setCurrentUser(HttpContext.getCurrentUserId);
      }
      return userTopic;
    });

    await this.userTopicContext.save(userTopics);
  }

  public async deleteUserTopicsAsync(
    userId: string,
    topicIds: string[],
  ): Promise<void> {
    if (!topicIds || topicIds.length === 0) {
      return;
    }

    await this.userTopicContext.delete({
      userId,
      topicId: In(topicIds),
    });
  }

  public async deleteAllUserTopicsAsync(userId: string): Promise<void> {
    await this.userTopicContext.delete({
      userId,
    });
  }
}
