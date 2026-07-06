import { QueryOptions } from 'domain/types/queryOptions.type';
import { ContentStream } from '../entities/contentStream.entity';

export interface IContentStreamRepository {
  getEntriesAsync(params: QueryOptions): Promise<[ContentStream[], number]>;
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
