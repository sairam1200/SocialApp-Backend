import { SearchEntityType } from './search-entity-type';
import { SearchResult } from './search-result.model';

export interface SearchResponsePagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export type SearchResponseFacets = Record<SearchEntityType, number>;

export interface SearchResponse {
  query: string;
  items: SearchResult[];
  pagination: SearchResponsePagination;
  facets: SearchResponseFacets;
}
