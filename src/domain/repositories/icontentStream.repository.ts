import { QueryOptions } from 'domain/types/queryOptions.type';
import { ContentStream } from '../entities/contentStream.entity';

export interface IContentStreamRepository {
  getEntriesAsync(params: QueryOptions): Promise<[ContentStream[], number]>;
  getByExternalIdsAsync(
    externalIds: string[],
    userId?: string,
  ): Promise<ContentStream[]>;
  getByIdsAsync(ids: string[]): Promise<ContentStream[]>;
  getByIdsOrExternalIdsAsync(ids: string[]): Promise<ContentStream[]>;
  deleteByPlatformAndExternalIdAsync(
    platform: string,
    externalId: string,
  ): Promise<void>;
  deleteByPlatformAndExternalIdsAsync(
    platform: string,
    externalIds: string[],
  ): Promise<void>;
  createAsync(contentStreams: ContentStream[]): Promise<ContentStream[]>;
}
