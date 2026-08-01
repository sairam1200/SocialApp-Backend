import { SearchEntityType } from './search-entity-type';
import { SearchResult } from './search-result.model';

export interface SearchResponsePagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export type SearchResponseFacets = Record<SearchEntityType, number>;

/**
 * Metadata about an automatic YouTube enrichment attempt that runs when the
 * content portion of a search returns nothing locally. Always optional; older
 * clients that do not know the field keep working unchanged.
 */
export interface SearchResponseFallback {
  attempted: boolean;
  succeeded: boolean;
  /** 'youtube_import' when this request imported results; 'local' when results came from a concurrent import. */
  source?: 'youtube_import' | 'local';
  /** Number of YouTube items the reused platform search found for the query. */
  importedCount?: number;
  reason?: 'api_error' | 'no_new_results';
}

export interface SearchResponse {
  query: string;
  items: SearchResult[];
  pagination: SearchResponsePagination;
  facets: SearchResponseFacets;
  fallback?: SearchResponseFallback;
}
