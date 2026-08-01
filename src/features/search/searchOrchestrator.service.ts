import { Inject, Injectable } from '@nestjs/common';
import _const from '../../core/utils/const';
import { GlobalSearchRequestModel } from './search.handler';
import {
  SearchEntityType,
  IndexDocument,
  ISearchRepository,
  SearchRepositoryQuery,
  SearchResponse,
  SearchResponseFacets,
} from '../../domain/contracts/search';
import { SearchCandidate } from '../../domain/contracts/search/search-candidate.model';
import { CandidateFactory, RankingEngine } from './ranking';
import { ResponseAdapter } from './adapters/response.adapter';
import { SearchIdentityResolver } from './search-identity.resolver';
import { SearchCacheService } from '../../infrastructure/services/searchCache.service';
import { UnifiedSearchCacheParams } from '../../infrastructure/services/searchCache.service';
import { SearchTelemetry } from './search-telemetry';
import logger from '../../core/utils/winston.util';

export const SEARCH_REPOSITORIES = 'SEARCH_REPOSITORIES';

/**
 * Flat search pipeline:
 *
 *   ISearchRepository[] -> IndexDocument[] -> CandidateFactory ->
 *   SearchCandidate[] -> RankingEngine (via RankingStrategyRegistry) ->
 *   SearchIdentityResolver -> ResponseAdapter -> SearchResponse
 *
 * Repositories only retrieve and project ranking primitives. Ranking,
 * identity and wire shaping happen here, once, and pagination is applied
 * to the final ranked list rather than per source.
 */
@Injectable()
export class SearchOrchestratorService {
  constructor(
    @Inject(SEARCH_REPOSITORIES)
    private readonly repositories: ISearchRepository[],
    private readonly candidateFactory: CandidateFactory,
    private readonly rankingEngine: RankingEngine,
    private readonly responseAdapter: ResponseAdapter,
    private readonly identityResolver: SearchIdentityResolver,
    private readonly searchCacheService: SearchCacheService,
  ) {}

  async execute(model: GlobalSearchRequestModel): Promise<SearchResponse> {
    const searchStart = Date.now();
    const { searchTerm, page = 1, limit = 25, forceRefresh } = model;

    const normalizedQuery = (searchTerm || '').trim().toLowerCase();

    const query: SearchRepositoryQuery = {
      originalQuery: searchTerm,
      normalizedQuery,
      platforms: model.platforms,
      entityType: model.type ? this.toEntityType(model.type) : undefined,
      limit: this.overfetchLimit(page, limit),
      viewerUserId: model.viewerUserId,
    };

    const cacheParams: UnifiedSearchCacheParams = {
      normalizedQuery,
      platforms: model.platforms || [],
      type: model.type,
      page,
      limit,
    };

    if (!forceRefresh) {
      const cached =
        await this.searchCacheService.getCachedUnifiedResults<SearchResponse>(
          cacheParams,
        );
      if (cached) {
        this.logObservability({
          query: searchTerm,
          cacheHit: true,
          durationMs: Date.now() - searchStart,
          repos: [],
          merged: cached.items.length,
          ranked: cached.items.length,
          paginated: cached.items.length,
          identityMs: 0,
          rankingMs: 0,
          returned: cached.items.length,
        });
        return cached;
      }
    }

    const { documents, repoTelemetry } = await this.gather(query);

    const candidates = this.candidateFactory.build(documents);

    const rankingStart = Date.now();
    const ranked = this.rankingEngine.rank(candidates, {
      query,
      now: new Date(),
    });
    const rankingMs = Date.now() - rankingStart;

    const identityStart = Date.now();
    for (const candidate of ranked) {
      if (
        candidate.document.type === SearchEntityType.PROFILE ||
        candidate.document.creatorId
      ) {
        candidate.gaddrIdentity = this.identityResolver.resolve(
          candidate.document,
        );
      }
    }
    const identityMs = Date.now() - identityStart;

    const results = this.responseAdapter.toResults(ranked);
    const total = results.length;
    const paginated = results.slice((page - 1) * limit, page * limit);
    const returned = this.responseAdapter.assignRanks(paginated);

    const response: SearchResponse = {
      query: searchTerm,
      items: returned,
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
      facets: this.computeFacets(ranked),
    };

    const popularity =
      await this.searchCacheService.trackQueryPopularity(normalizedQuery);
    const classification =
      this.searchCacheService.classifyQueryPopularity(popularity);
    await this.searchCacheService.setCachedUnifiedResults(
      cacheParams,
      response,
      classification,
    );

    this.logObservability({
      query: searchTerm,
      cacheHit: false,
      durationMs: Date.now() - searchStart,
      repos: repoTelemetry,
      merged: documents.length,
      ranked: ranked.length,
      paginated: paginated.length,
      identityMs,
      rankingMs,
      returned: returned.length,
    });

    return response;
  }

  private async gather(query: SearchRepositoryQuery): Promise<{
    documents: IndexDocument[];
    repoTelemetry: SearchTelemetry['repos'];
  }> {
    const documents: IndexDocument[] = [];
    const repoTelemetry: SearchTelemetry['repos'] = [];

    await Promise.all(
      this.repositories.map(async (repo) => {
        const start = Date.now();
        let rows: IndexDocument[] = [];
        try {
          rows = await repo.search(query);
        } catch (error) {
          logger.warn(`[Orchestrator] Repository ${repo.name} failed:`, error);
        }
        documents.push(...rows);
        repoTelemetry.push({
          name: repo.name,
          rows: rows.length,
          latencyMs: Date.now() - start,
        });
      }),
    );

    return { documents, repoTelemetry };
  }

  private computeFacets(candidates: SearchCandidate[]): SearchResponseFacets {
    const facets: SearchResponseFacets = {
      [SearchEntityType.CONTENT]: 0,
      [SearchEntityType.PROFILE]: 0,
      [SearchEntityType.PROJECT]: 0,
      [SearchEntityType.JOB]: 0,
    };

    for (const candidate of candidates) {
      facets[candidate.document.type] += 1;
    }

    return facets;
  }

  private toEntityType(type: string): SearchEntityType | undefined {
    const normalized = type.toLowerCase();
    if (normalized === 'content') return SearchEntityType.CONTENT;
    if (normalized === 'profile') return SearchEntityType.PROFILE;
    if (normalized === 'project') return SearchEntityType.PROJECT;
    if (normalized === 'job') return SearchEntityType.JOB;
    return undefined;
  }

  private overfetchLimit(page: number, limit: number): number {
    return Math.ceil(
      page * limit * _const.SEARCH_PROVIDER.OVERFETCH_MULTIPLIER,
    );
  }

  private logObservability(telemetry: SearchTelemetry): void {
    logger.info('[SearchOrchestrator] Search completed', {
      ...telemetry,
      repos: telemetry.repos.map((repo) => ({
        name: repo.name,
        rows: repo.rows,
        latencyMs: repo.latencyMs,
      })),
    });

    if (process.env.DEBUG_SEARCH === 'true') {
      console.log('[SEARCH DEBUG]');
      console.log(`Query: ${telemetry.query}`);
      console.log(`Cache hit: ${telemetry.cacheHit}`);
      console.log(`Repos: ${JSON.stringify(telemetry.repos)}`);
      console.log(`Merged: ${telemetry.merged}`);
      console.log(`Ranked: ${telemetry.ranked}`);
      console.log(`Paginated: ${telemetry.paginated}`);
      console.log(`Returned: ${telemetry.returned}`);
      console.log(`Total duration: ${telemetry.durationMs}ms`);
    }
  }
}
