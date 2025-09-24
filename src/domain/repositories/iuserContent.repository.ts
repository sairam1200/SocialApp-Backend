import { QueryOptions } from "../types/queryOptions.type";
import { UserContent } from "../entities/userContent.entity";

export interface IUserContentRepository {

  createAsync(content: UserContent): Promise<UserContent>;
  updateAsync(content: UserContent): Promise<void>;

  deleteAsync(content: UserContent): Promise<void>;
  getByIdAsync(id: string): Promise<UserContent>;
  getByPlatformAndContentIdAsync(platform: string, contentId: string): Promise<UserContent>;
  getByUserIdAsync(userId: string, platform: string, cursor: string): Promise<[UserContent[], string]>;

  getEntriesAsync(params: QueryOptions): Promise<[UserContent[], number]>
}