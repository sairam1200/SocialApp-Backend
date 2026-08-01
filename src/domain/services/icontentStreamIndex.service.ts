import { ContentStream } from '../entities/contentStream.entity';
import { UserContent } from '../entities/userContent.entity';

export interface IContentStreamIndexService {
  index(content: ContentStream): Promise<void>;
  indexBatch(contents: ContentStream[]): Promise<void>;
  update(content: ContentStream): Promise<void>;
  delete(platform: string, externalId: string): Promise<void>;
  reindex(): Promise<void>;
  upsertFromUserContent(userContent: UserContent): Promise<void>;
}
