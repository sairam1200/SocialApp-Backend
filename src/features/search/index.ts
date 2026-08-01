import { GlobalSearchController } from './search.endpoint';
import { GlobalSearchQueryHandler } from './search.handler';
import { SearchSuggestionsQueryHandler } from './database-search.handler';

export { GlobalSearchController } from './search.endpoint';
export {
  GlobalSearchQueryHandler,
  GlobalSearchQuery,
  GlobalSearchRequestModel,
} from './search.handler';

export {
  SearchOrchestratorService,
  SEARCH_REPOSITORIES,
} from './searchOrchestrator.service';
export { SearchIdentityResolver } from './search-identity.resolver';
export { SearchTelemetry, SearchRepoTelemetry } from './search-telemetry';
export {
  CandidateFactory,
  RankingEngine,
  RankingStrategyRegistry,
  RankingWeightsConfig,
  RankingFeatureFlags,
  IRankingStrategy,
  RankingContext,
  loadRankingWeights,
  loadRankingFeatureFlags,
  RANKING_WEIGHTS_DEFAULTS,
  ContentRankingStrategy,
  ProfileRankingStrategy,
  ProjectRankingStrategy,
  JobRankingStrategy,
} from './ranking';
export { ResponseAdapter } from './adapters/response.adapter';
export {
  SearchEntityType,
  IndexDocument,
  IndexDocumentRanking,
  ISearchRepository,
  SearchRepositoryQuery,
  SearchRepositoryCapability,
  SearchRepositoryCapabilities,
  SearchResponse,
  SearchResponsePagination,
  SearchResponseFacets,
  SearchCandidate,
  RankingSignals,
  SearchResult,
  EngagementMetrics,
} from '../../domain/contracts/search';

const controllers = [GlobalSearchController];

const handlers = [GlobalSearchQueryHandler, SearchSuggestionsQueryHandler];

const search = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default search;
