import { QueryOptions } from "../types/queryOptions.type";
import { UserContent } from "../entities/userContent.entity";
import { SearchUserProjection } from "./iuser.repository";

export type SearchContentProjection = Pick<UserContent, "id" | "title" | "type" | "platform" | "externalId" | "sourceUrl" | "publishedAt"> & {
  user: SearchUserProjection;
};

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
  searchGlobalAsync(keyword: string, viewerUserId: string, page: number, limit: number): Promise<[SearchContentProjection[], number]>;
  getGlobalSearchItemAsync(id: string, viewerUserId: string): Promise<SearchContentProjection | null>;
  getVideoIdsByUserIdAndPlatformAsync(userId: string, platform: string, types: string[]): Promise<string[]>;
  getVideoMetaDataByUserIdAndPlatformAsync(userId: string, platform: string, types: string[]): Promise<Pick<UserContent, 'externalId' | 'metaData'>[]>;

  deleteByUserIdAndPlatformAsync(userId: string, platform: string): Promise<void>;
  deleteByExternalIdsAsync(userId: string, platform: string, externalIds: string[]): Promise<void>;
}
