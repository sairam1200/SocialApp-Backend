import { QueryOptions } from "../types/queryOptions.type";
import { UserContent } from "../entities/userContent.entity";

export interface IUserContentRepository {

  createAsync(content: UserContent): Promise<UserContent>;
  updateAsync(content: UserContent): Promise<void>;

  deleteAsync(content: UserContent): Promise<void>;
  getByIdAsync(id: string): Promise<UserContent>;
  getByPlatformAndContentIdAsync(
    userId: string,
    platform: string,
    contentId: string
  ): Promise<UserContent>;

  getByUserIdAsync(
    userId: string,
    platform: string,
    cursor: string
  ): Promise<[UserContent[], string]>;

  getEntriesAsync(params: QueryOptions): Promise<[UserContent[], number]>;
  getVideoIdsByUserIdAndPlatformAsync(userId: string, platform: string, types: string[]): Promise<string[]>;

  deleteByUserIdAndPlatformAsync(userId: string, platform: string): Promise<void>;
  deleteByExternalIdsAsync(userId: string, platform: string, externalIds: string[]): Promise<void>;
}
