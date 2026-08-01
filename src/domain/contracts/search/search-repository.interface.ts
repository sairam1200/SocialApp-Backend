import { SearchEntityType } from './search-entity-type';
import { IndexDocument } from './index-document.model';

export interface SearchRepositoryQuery {
  originalQuery: string;
  normalizedQuery: string;
  platforms?: string[];
  entityType?: SearchEntityType;
  limit: number;
  viewerUserId?: string;
}

export type SearchRepositoryCapability =
  'phrase' | 'fuzzy' | 'exact' | 'privacy' | 'pagination';

export interface SearchRepositoryCapabilities {
  supports: SearchRepositoryCapability[];
}

export interface ISearchRepository {
  readonly name: string;
  readonly capabilities: SearchRepositoryCapabilities;
  search(query: SearchRepositoryQuery): Promise<IndexDocument[]>;
}
