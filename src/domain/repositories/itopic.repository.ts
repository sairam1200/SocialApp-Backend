import { Topic } from "../entities/topic.entity";
import { UserTopic } from "../entities/userTopic.entity";

export interface ITopicRepository {
  getAllAsync(): Promise<Topic[]>;
  getByIdAsync(id: string): Promise<Topic | null>;
  getByIdsAsync(ids: string[]): Promise<Topic[]>;
  getByUserIdAsync(userId: string): Promise<UserTopic[]>;
  createUserTopicsAsync(userId: string, topicIds: string[]): Promise<void>;
  deleteUserTopicsAsync(userId: string, topicIds: string[]): Promise<void>;
  deleteAllUserTopicsAsync(userId: string): Promise<void>;
}
