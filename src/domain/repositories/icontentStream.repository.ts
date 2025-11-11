import { QueryOptions } from "domain/types/queryOptions.type";
import { ContentStream } from "../entities/contentStream.entity";

export interface IContentStreamRepository {
  getEntriesAsync(params: QueryOptions): Promise<[ContentStream[], number]>;
}