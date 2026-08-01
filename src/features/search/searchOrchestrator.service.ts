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
  SearchResponseFallback,
} from '../../domain/contracts/search';
import { SearchCandidate } from '../../domain/contracts/search/search-candidate.model';
import { CandidateFactory, RankingEngine } from './ranking';
import { ResponseAdapter } from './adapters/response.adapter';
import { SearchIdentityResolver } from './search-identity.resolver';
import { SearchCacheService } from '../../infrastructure/services/searchCache.service';
import { UnifiedSearchCacheParams } from '../../infrastructure/services/searchCache.service';
import { ISearchService } from '../../domain/services/isearch.service';
import { SearchTelemetry } from './search-telemetry';
import logger from '../../core/utils/winston.util';

export const SEARCH_REPOSITORIES = 'SEARCH_REPOSITORIES';

interface YouTubeFallbackOutcome {
  documents: IndexDocument[];
  repoTelemetry: SearchTelemetry['repos'];
  metadata: SearchResponseFallback;
}

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
    @Inject(_const.ISEARCH_SERVICE)
    private readonly searchService: ISearchService,
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
      if (cached && !this.shouldEnrichCachedResponse(cached, model, query)) {
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

    return this.runPipeline(model, query, cacheParams, searchStart);
  }

  private async runPipeline(
    model: GlobalSearchRequestModel,
    query: SearchRepositoryQuery,
    cacheParams: UnifiedSearchCacheParams,
    searchStart: number,
  ): Promise<SearchResponse> {
    const { searchTerm, page = 1, limit = 25 } = model;

    const gathered = await this.gather(query);
    let documents = gathered.documents;
    let repoTelemetry = gathered.repoTelemetry;

    const fallback = await this.maybeRunYouTubeFallback(
      model,
      query,
      documents,
    );
    if (fallback) {
      documents = fallback.documents;
      repoTelemetry = fallback.repoTelemetry;
    }

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

    if (fallback) {
      response.fallback = fallback.metadata;
    }

    const popularity = await this.searchCacheService.trackQueryPopularity(
      query.normalizedQuery,
    );
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

  /**
   * A cached response whose content portion is empty must not permanently
   * suppress the YouTube enrichment. Re-running the pipeline is quota-safe:
   * searchYoutubeAsync still honours its own platform cache (5 min) and the
   * import lock, so the API is called at most once per query per window. This
   * also lets a stale empty cache self-heal once new entries exist.
   */
  private shouldEnrichCachedResponse(
    cached: SearchResponse,
    model: GlobalSearchRequestModel,
    query: SearchRepositoryQuery,
  ): boolean {
    const cachedContent = cached.facets?.[SearchEntityType.CONTENT] ?? 0;
    return cachedContent === 0 && this.shouldSearchYoutube(model, query);
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

  /**
   * YouTube content-index enrichment. When the content portion of a search
   * returns nothing locally, import once through the existing platform search
   * (cache/staleness/lock-aware, forceRefresh=false) and then re-read locally.
   * The refreshed documents flow through the unchanged ranking pipeline - the
   * orchestrator never branches into a separate YouTube search mode.
   *
   * The import lock is an optimization, not a dependency: a Redis failure
   * must not disable the fallback, so the import still runs without it, and a
   * lock held by a concurrent request means "wait briefly, then read locally"
   * rather than a second YouTube call.
   */
  private async maybeRunYouTubeFallback(
    model: GlobalSearchRequestModel,
    query: SearchRepositoryQuery,
    documents: IndexDocument[],
  ): Promise<YouTubeFallbackOutcome | null> {
    const contentCount = documents.filter(
      (document) => document.type === SearchEntityType.CONTENT,
    ).length;

    if (contentCount > 0 || !this.shouldSearchYoutube(model, query)) {
      return null;
    }

    const fallbackStart = Date.now();
    const normalizedQuery = query.normalizedQuery;

    let cacheHit = false;
    try {
      cacheHit = await this.hasCachedYouTubeResults(query);
    } catch {
      cacheHit = false;
    }

    let lockAcquired = false;
    let redisUnavailable = false;
    try {
      lockAcquired =
        await this.searchCacheService.acquireYouTubeImportLock(normalizedQuery);
    } catch (error) {
      redisUnavailable = true;
      logger.warn(
        `[SearchFallback] Redis unavailable, importing without lock: ${this.errorMessage(error)}`,
      );
    }

    const importsHere = lockAcquired || redisUnavailable;

    let importedCount = 0;
    let importFailed = false;

    if (importsHere) {
      try {
        const youtubeResponse = await this.searchService.searchYoutubeAsync({
          page: 1,
          limit: query.limit,
          originalQuery: query.originalQuery || normalizedQuery,
          normalizedQuery,
          filters: {},
          forceRefresh: false,
        });
        importedCount = Array.isArray(youtubeResponse.results)
          ? youtubeResponse.results.length
          : 0;
      } catch (error) {
        importFailed = true;
        logger.warn(
          `[SearchFallback] YouTube import failed: ${this.errorMessage(error)}`,
        );
      } finally {
        // Only the request that acquired the lock releases it.
        if (lockAcquired) {
          try {
            await this.searchCacheService.releaseYouTubeImportLock(
              normalizedQuery,
            );
          } catch (error) {
            logger.warn(
              `[SearchFallback] Failed to release import lock: ${this.errorMessage(error)}`,
            );
          }
        }
      }
    } else {
      // A concurrent request is importing for this query. Wait for its
      // results to land, then read locally. Never issue another YouTube call.
      await this.delay(300);
    }

    const refreshed = await this.reGatherWithRetries(query, [250, 500]);
    const foundContent = refreshed.documents.some(
      (document) => document.type === SearchEntityType.CONTENT,
    );

    const metadata: SearchResponseFallback = {
      attempted: true,
      succeeded: foundContent,
      source: importedCount > 0 ? 'youtube_import' : 'local',
      importedCount,
      ...(foundContent
        ? {}
        : {
            reason: importFailed
              ? ('api_error' as const)
              : ('no_new_results' as const),
          }),
    };

    logger.info('[SearchFallback] Enrichment completed', {
      query: query.originalQuery,
      attempted: true,
      lockAcquired,
      importedCount,
      cacheHit,
      durationMs: Date.now() - fallbackStart,
      reason: metadata.reason,
    });

    return {
      documents: refreshed.documents,
      repoTelemetry: refreshed.repoTelemetry,
      metadata,
    };
  }

  /**
   * Fallback eligibility. The fallback only enriches the content pipeline, so
   * it fires only when the search could actually surface content documents:
   * all-type searches or explicit content-type searches. Profile-only,
   * project and job searches are excluded - the content repository is
   * filtered out for them, so an import could never be read back.
   */
  private shouldSearchYoutube(
    model: GlobalSearchRequestModel,
    query: SearchRepositoryQuery,
  ): boolean {
    if (!query.normalizedQuery) return false;
    if (
      query.entityType !== undefined &&
      query.entityType !== SearchEntityType.CONTENT
    ) {
      return false;
    }
    const platforms = model.platforms;
    if (
      platforms &&
      platforms.length > 0 &&
      !platforms.includes(_const.PLATFORMS.YOUTUBE)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Local-only re-read with deterministic backoff. The first read happens
   * immediately; only when the content index is still empty do we wait and
   * read again. Never triggers another YouTube call.
   */
  private async reGatherWithRetries(
    query: SearchRepositoryQuery,
    delays: number[],
  ): Promise<{
    documents: IndexDocument[];
    repoTelemetry: SearchTelemetry['repos'];
  }> {
    let result = await this.gather(query);
    for (const delayMs of delays) {
      if (
        result.documents.some(
          (document) => document.type === SearchEntityType.CONTENT,
        )
      ) {
        break;
      }
      await this.delay(delayMs);
      result = await this.gather(query);
    }
    return result;
  }

  /**
   * Best-effort platform-cache probe for observability. Uses the exact params
   * searchYoutubeAsync derives its cache key from (filters includes platform),
   * so a hit here means no YouTube API call is about to happen.
   */
  private async hasCachedYouTubeResults(
    query: SearchRepositoryQuery,
  ): Promise<boolean> {
    const cached = await this.searchCacheService.getCachedResults<unknown>({
      platform: _const.PLATFORMS.YOUTUBE,
      normalizedQuery: query.normalizedQuery,
      filters: { platform: _const.PLATFORMS.YOUTUBE },
      page: 1,
      limit: query.limit,
    });
    return cached !== null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
