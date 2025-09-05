import { ContentStream } from "../entities";
import { QueryOptions } from "../types/queryOptions.type";

export interface IContentStreamRepository {
  createAsync(content: ContentStream) : Promise<ContentStream>;
  getEntriesAsync(params: QueryOptions): Promise<[ContentStream[], number]>;
  getContentByIdAndTypeAsync(externalId: string, platform: string): Promise<ContentStream>;
}