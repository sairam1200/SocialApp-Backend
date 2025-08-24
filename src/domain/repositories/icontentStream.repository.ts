import { ContentStream } from "../entities";
import { QueryOptions } from "../types/queryOptions.type";

export interface IContentStreamRepository {

  getEntriesAsync(params: QueryOptions): Promise<[ContentStream[], number]>;
  createAsync(content: ContentStream);
}