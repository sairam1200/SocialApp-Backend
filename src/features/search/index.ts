import { GlobalSearchController } from './search.endpoint';
import { GlobalSearchQueryHandler } from './search.handler';
import {
  SearchItemQueryHandler,
  SearchResultsQueryHandler,
  SearchSuggestionsQueryHandler,
} from './database-search.handler';

export { GlobalSearchController } from './search.endpoint';
export {
  GlobalSearchQueryHandler,
  GlobalSearchQuery,
  GlobalSearchRequestModel,
  GlobalSearchResponseModel,
} from './search.handler';

const controllers = [GlobalSearchController];

const handlers = [
  GlobalSearchQueryHandler,
  SearchSuggestionsQueryHandler,
  SearchResultsQueryHandler,
  SearchItemQueryHandler,
];

const search = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default search;
