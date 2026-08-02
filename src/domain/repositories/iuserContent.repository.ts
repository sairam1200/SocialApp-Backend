import { QueryOptions } from '../types/queryOptions.type';
import { UserContent } from '../entities/userContent.entity';
import { SearchUserProjection } from './iidentity.repository';

export type SearchContentProjection = Pick<
  UserContent,
  | 'id'
  | 'title'
  | 'type'
  | 'platform'
  | 'externalId'
  | 'sourceUrl'
  | 'publishedAt'
  | 'media'
  | 'metaData'
  | 'engagement'
> & {
  user: SearchUserProjection;
  linkedAccount?: {
    userName: string;
    profileImage?: string | null;
    verified: boolean;
    externalUrl?: string | null;
    metaData?: Record<string, any> | null;
    platform: string;
  } | null;
};

export interface IUserContentRepository {
  createAsync(content: UserContent): Promise<UserContent>;
  updateAsync(content: UserContent): Promise<void>;

  deleteAsync(content: UserContent): Promise<void>;
  getByIdAsync(id: string): Promise<UserContent>;
  getByIdsAsync(ids: string[]): Promise<UserContent[]>;
  getByPlatformAndContentIdAsync(
    userId: string,
    platform: string,
    contentId: string,
  ): Promise<UserContent>;

  getByUserIdAsync(
    userId: string,
    platform: string,
    cursor: string,
  ): Promise<[UserContent[], string]>;

  getEntriesAsync(params: QueryOptions): Promise<[UserContent[], number]>;
  searchGlobalAsync(
    keyword: string,
    viewerUserId: string | null,
    page: number,
    limit: number,
  ): Promise<[SearchContentProjection[], number]>;
  getVideoIdsByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
    types: string[],
  ): Promise<string[]>;
  getUserContentVideosAsync(
    userId: string,
    platform: string,
    types: string[],
  ): Promise<
    Pick<
      UserContent,
      'externalId' | 'metaData' | 'title' | 'media' | 'publishedAt'
    >[]
  >;
  getVideoMetaDataByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
    types: string[],
  ): Promise<Pick<UserContent, 'externalId' | 'metaData'>[]>;

  getDiscoverFeedAsync(
    cursor?: string,
    limit?: number,
    userId?: string,
    viewerUserId?: string,
  ): Promise<[UserContent[], string | null]>;

  deleteByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
  ): Promise<void>;
  deleteByExternalIdsAsync(
    userId: string,
    platform: string,
    externalIds: string[],
  ): Promise<void>;
  countByUserIdAsync(userId: string): Promise<number>;

  findByLinkedAccountIdAsync(linkedAccountId: string): Promise<UserContent[]>;
  deleteByLinkedAccountIdAsync(linkedAccountId: string): Promise<void>;
  countByLinkedAccountIdAsync(linkedAccountId: string): Promise<number>;
}
