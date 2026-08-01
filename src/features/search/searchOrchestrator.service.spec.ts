import { Test, TestingModule } from '@nestjs/testing';
import {
  SearchOrchestratorService,
  SEARCH_REPOSITORIES,
} from './searchOrchestrator.service';
import { SearchCacheService } from '../../infrastructure/services/searchCache.service';
import { GlobalSearchRequestModel } from './search.handler';
import {
  ISearchRepository,
  SearchRepositoryQuery,
  IndexDocument,
  SearchEntityType,
} from '../../domain/contracts/search';
import { SearchCandidate } from '../../domain/contracts/search/search-candidate.model';
import { ISearchService } from '../../domain/services/isearch.service';
import _const from '../../core/utils/const';
import {
  CandidateFactory,
  RankingEngine,
  RankingStrategyRegistry,
  ContentRankingStrategy,
  ProfileRankingStrategy,
  ProjectRankingStrategy,
  JobRankingStrategy,
  RANKING_WEIGHTS_DEFAULTS,
  loadRankingFeatureFlags,
} from './ranking';
import { ResponseAdapter } from './adapters/response.adapter';
import { SearchIdentityResolver } from './search-identity.resolver';

function makeDocument(overrides: Partial<IndexDocument> = {}): IndexDocument {
  return {
    id: 'doc1',
    type: SearchEntityType.CONTENT,
    subType: 'video',
    title: 'Test',
    metadata: {},
    ...overrides,
  };
}

function makeRepo(
  name: string,
  handler: (query: SearchRepositoryQuery) => Promise<IndexDocument[]>,
): ISearchRepository {
  return {
    name,
    capabilities: { supports: ['exact'] },
    search: handler,
  };
}

function buildRegistry(): RankingStrategyRegistry {
  const registry = new RankingStrategyRegistry();
  registry.registerAll([
    new ContentRankingStrategy(
      RANKING_WEIGHTS_DEFAULTS,
      loadRankingFeatureFlags(),
    ),
    new ProfileRankingStrategy(loadRankingFeatureFlags()),
    new ProjectRankingStrategy(loadRankingFeatureFlags()),
    new JobRankingStrategy(loadRankingFeatureFlags()),
  ]);
  return registry;
}

const REGISTRY = buildRegistry();

describe('SearchOrchestratorService', () => {
  let service: SearchOrchestratorService;
  let cacheService: jest.Mocked<SearchCacheService>;
  let identityResolver: jest.Mocked<SearchIdentityResolver>;
  let searchService: jest.Mocked<ISearchService>;

  const defaultModel: GlobalSearchRequestModel = {
    searchTerm: 'hello',
    page: 1,
    limit: 25,
  };

  beforeEach(async () => {
    cacheService = {
      getCachedUnifiedResults: jest.fn(),
      setCachedUnifiedResults: jest.fn(),
      trackQueryPopularity: jest.fn().mockResolvedValue(1),
      classifyQueryPopularity: jest.fn().mockReturnValue('normal'),
      getCachedSuggestions: jest.fn(),
      setCachedSuggestions: jest.fn(),
      getCachedResults: jest.fn().mockResolvedValue(null),
      acquireYouTubeImportLock: jest.fn().mockResolvedValue(true),
      releaseYouTubeImportLock: jest.fn().mockResolvedValue(undefined),
    } as any;

    identityResolver = {
      resolve: jest.fn().mockReturnValue(null),
    } as any;

    searchService = {
      searchYoutubeAsync: jest.fn().mockResolvedValue({ results: [] }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchOrchestratorService,
        CandidateFactory,
        { provide: RankingEngine, useValue: new RankingEngine(REGISTRY) },
        ResponseAdapter,
        { provide: SearchIdentityResolver, useValue: identityResolver },
        { provide: SearchCacheService, useValue: cacheService },
        { provide: _const.ISEARCH_SERVICE, useValue: searchService },
        {
          provide: SEARCH_REPOSITORIES,
          useValue: [
            makeRepo('content', async () => []),
            makeRepo('profile', async () => []),
            makeRepo('project', async () => []),
            makeRepo('job', async () => []),
          ],
        },
      ],
    }).compile();

    service = module.get<SearchOrchestratorService>(SearchOrchestratorService);
  });

  describe('cache behavior', () => {
    it('returns cached response without querying repositories', async () => {
      const cached: any = {
        query: 'hello',
        items: [{ id: 'cached-1' }],
        pagination: { page: 1, limit: 25, total: 1, hasMore: false },
        facets: {
          content: 1,
          profile: 0,
          project: 0,
          job: 0,
        },
      };
      cacheService.getCachedUnifiedResults.mockResolvedValue(cached);

      const result = await service.execute(defaultModel);

      expect(result).toEqual(cached);
      expect(cacheService.trackQueryPopularity).not.toHaveBeenCalled();
    });
  });

  describe('pipeline execution', () => {
    it('ranks and returns a flat response with facets and 1-based ranks', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);

      const repos: ISearchRepository[] = [
        makeRepo('content', async () => [
          makeDocument({
            id: 'c1',
            type: SearchEntityType.CONTENT,
            title: 'Music video',
            ranking: { textRelevance: 70 },
          }),
        ]),
        makeRepo('profile', async () => [
          makeDocument({
            id: 'p1',
            type: SearchEntityType.PROFILE,
            title: 'Sai',
            creatorUsername: 'sai',
            ranking: { textRelevance: 60, exactMatch: true },
          }),
        ]),
        makeRepo('project', async () => []),
        makeRepo('job', async () => []),
      ];

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SearchOrchestratorService,
          CandidateFactory,
          { provide: RankingEngine, useValue: new RankingEngine(REGISTRY) },
          ResponseAdapter,
          {
            provide: SearchIdentityResolver,
            useValue: identityResolver,
          },
          { provide: SearchCacheService, useValue: cacheService },
          { provide: _const.ISEARCH_SERVICE, useValue: searchService },
          { provide: SEARCH_REPOSITORIES, useValue: repos },
        ],
      }).compile();
      const svc = module.get<SearchOrchestratorService>(
        SearchOrchestratorService,
      );

      const response = await svc.execute(defaultModel);

      expect(response.query).toBe('hello');
      expect(response.pagination.total).toBe(2);
      expect(response.pagination.hasMore).toBe(false);
      expect(response.facets.content).toBe(1);
      expect(response.facets.profile).toBe(1);
      expect(response.facets.project).toBe(0);
      expect(response.items.length).toBe(2);
      expect(response.items[0].rank).toBe(1);
      expect(response.items[1].rank).toBe(2);

      // No fixed type order: the exact-username profile must outrank content.
      expect(response.items[0].type).toBe(SearchEntityType.PROFILE);
      expect(response.items[1].type).toBe(SearchEntityType.CONTENT);
    });

    it('isolates repository failures and still returns results from others', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);

      const repos: ISearchRepository[] = [
        makeRepo('content', async () => {
          throw new Error('content repo down');
        }),
        makeRepo('profile', async () => [
          makeDocument({
            id: 'p1',
            type: SearchEntityType.PROFILE,
            title: 'Sai',
            ranking: { textRelevance: 60 },
          }),
        ]),
      ];

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SearchOrchestratorService,
          CandidateFactory,
          { provide: RankingEngine, useValue: new RankingEngine(REGISTRY) },
          ResponseAdapter,
          { provide: SearchIdentityResolver, useValue: identityResolver },
          { provide: SearchCacheService, useValue: cacheService },
          { provide: _const.ISEARCH_SERVICE, useValue: searchService },
          { provide: SEARCH_REPOSITORIES, useValue: repos },
        ],
      }).compile();
      const svc = module.get<SearchOrchestratorService>(
        SearchOrchestratorService,
      );

      const response = await svc.execute(defaultModel);

      expect(response.pagination.total).toBe(1);
      expect(response.items[0].id).toBe('p1');
    });

    it('returns an empty flat response when every repository fails', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);

      const repos: ISearchRepository[] = [
        makeRepo('content', async () => {
          throw new Error('err');
        }),
        makeRepo('profile', async () => {
          throw new Error('err');
        }),
      ];

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SearchOrchestratorService,
          CandidateFactory,
          { provide: RankingEngine, useValue: new RankingEngine(REGISTRY) },
          ResponseAdapter,
          { provide: SearchIdentityResolver, useValue: identityResolver },
          { provide: SearchCacheService, useValue: cacheService },
          { provide: _const.ISEARCH_SERVICE, useValue: searchService },
          { provide: SEARCH_REPOSITORIES, useValue: repos },
        ],
      }).compile();
      const svc = module.get<SearchOrchestratorService>(
        SearchOrchestratorService,
      );

      const response = await svc.execute(defaultModel);

      expect(response.pagination.total).toBe(0);
      expect(response.items).toEqual([]);
      expect(response.facets.content).toBe(0);
      expect(response.facets.profile).toBe(0);
    });
  });

  describe('pagination', () => {
    it('passes the entity type filter through to repositories', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      const seen: SearchRepositoryQuery[] = [];
      const repo = makeRepo('content', async (query) => {
        seen.push(query);
        return [];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SearchOrchestratorService,
          CandidateFactory,
          { provide: RankingEngine, useValue: new RankingEngine(REGISTRY) },
          ResponseAdapter,
          { provide: SearchIdentityResolver, useValue: identityResolver },
          { provide: SearchCacheService, useValue: cacheService },
          { provide: _const.ISEARCH_SERVICE, useValue: searchService },
          { provide: SEARCH_REPOSITORIES, useValue: [repo] },
        ],
      }).compile();
      const svc = module.get<SearchOrchestratorService>(
        SearchOrchestratorService,
      );

      await svc.execute({ ...defaultModel, type: 'profile' });

      expect(seen.length).toBe(1);
      expect(seen[0].entityType).toBe(SearchEntityType.PROFILE);
    });
  });

  describe('candidate ranking signals', () => {
    it('exposes finalScore on ranked candidates via the adapter score', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      const repo = makeRepo('content', async () => [
        makeDocument({
          id: 'c1',
          type: SearchEntityType.CONTENT,
          title: 'Hello world',
          ranking: { textRelevance: 100, exactMatch: true },
        }),
      ]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SearchOrchestratorService,
          CandidateFactory,
          { provide: RankingEngine, useValue: new RankingEngine(REGISTRY) },
          ResponseAdapter,
          { provide: SearchIdentityResolver, useValue: identityResolver },
          { provide: SearchCacheService, useValue: cacheService },
          { provide: _const.ISEARCH_SERVICE, useValue: searchService },
          { provide: SEARCH_REPOSITORIES, useValue: [repo] },
        ],
      }).compile();
      const svc = module.get<SearchOrchestratorService>(
        SearchOrchestratorService,
      );

      const response = await svc.execute(defaultModel);

      expect(response.items[0].score).toBeGreaterThan(0);
      expect(response.items[0].score).toBeLessThanOrEqual(100);
    });
  });

  describe('youtube content fallback', () => {
    async function buildFallbackModule(
      repos: ISearchRepository[],
    ): Promise<SearchOrchestratorService> {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SearchOrchestratorService,
          CandidateFactory,
          { provide: RankingEngine, useValue: new RankingEngine(REGISTRY) },
          ResponseAdapter,
          { provide: SearchIdentityResolver, useValue: identityResolver },
          { provide: SearchCacheService, useValue: cacheService },
          { provide: _const.ISEARCH_SERVICE, useValue: searchService },
          { provide: SEARCH_REPOSITORIES, useValue: repos },
        ],
      }).compile();
      return module.get<SearchOrchestratorService>(SearchOrchestratorService);
    }

    function youtubeItems(count: number): unknown[] {
      return Array.from({ length: count }, (_, i) => ({ id: `yt-${i}` }));
    }

    function importedContent(id: string): IndexDocument {
      return makeDocument({
        id,
        type: SearchEntityType.CONTENT,
        ranking: { textRelevance: 50 },
      });
    }

    it('enriches an empty content index and ranks imported documents normally', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      searchService.searchYoutubeAsync.mockResolvedValue({
        results: youtubeItems(3),
      } as any);

      let contentCalls = 0;
      const repos: ISearchRepository[] = [
        makeRepo('content', async () => {
          contentCalls += 1;
          return contentCalls > 1 ? [importedContent('yt-video')] : [];
        }),
        makeRepo('profile', async () => []),
      ];

      const svc = await buildFallbackModule(repos);
      const response = await svc.execute(defaultModel);

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledTimes(1);
      const params = searchService.searchYoutubeAsync.mock.calls[0][0];
      expect(params.normalizedQuery).toBe('hello');
      expect(params.forceRefresh).toBe(false);

      expect(response.items.length).toBe(1);
      expect(response.items[0].id).toBe('yt-video');
      expect(response.fallback).toEqual({
        attempted: true,
        succeeded: true,
        source: 'youtube_import',
        importedCount: 3,
      });
      expect(cacheService.releaseYouTubeImportLock).toHaveBeenCalledTimes(1);
    });

    it('enriches content even when profiles match locally', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      searchService.searchYoutubeAsync.mockResolvedValue({
        results: youtubeItems(1),
      } as any);

      let contentCalls = 0;
      const repos: ISearchRepository[] = [
        makeRepo('content', async () => {
          contentCalls += 1;
          return contentCalls > 1 ? [importedContent('yt-video')] : [];
        }),
        makeRepo('profile', async () => [
          makeDocument({
            id: 'p1',
            type: SearchEntityType.PROFILE,
            title: 'MrBeast',
          }),
        ]),
      ];

      const svc = await buildFallbackModule(repos);
      const response = await svc.execute(defaultModel);

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledTimes(1);
      expect(response.pagination.total).toBe(2);
      expect(response.fallback?.succeeded).toBe(true);
    });

    it('re-runs the pipeline when a cached response has empty content', async () => {
      const cached: any = {
        query: 'hello',
        items: [],
        pagination: { page: 1, limit: 25, total: 0, hasMore: false },
        facets: { content: 0, profile: 0, project: 0, job: 0 },
      };
      cacheService.getCachedUnifiedResults.mockResolvedValue(cached);
      searchService.searchYoutubeAsync.mockResolvedValue({
        results: youtubeItems(1),
      } as any);

      let contentCalls = 0;
      const repos: ISearchRepository[] = [
        makeRepo('content', async () => {
          contentCalls += 1;
          return contentCalls > 1 ? [importedContent('yt-video')] : [];
        }),
        makeRepo('profile', async () => []),
      ];

      const svc = await buildFallbackModule(repos);
      const response = await svc.execute(defaultModel);

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledTimes(1);
      expect(response.items[0].id).toBe('yt-video');
      expect(response.fallback?.succeeded).toBe(true);
    });

    it('skips fallback when the content index already has results', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);

      const repos: ISearchRepository[] = [
        makeRepo('content', async () => [
          makeDocument({ id: 'c1', type: SearchEntityType.CONTENT }),
        ]),
        makeRepo('profile', async () => []),
      ];

      const svc = await buildFallbackModule(repos);
      const response = await svc.execute(defaultModel);

      expect(searchService.searchYoutubeAsync).not.toHaveBeenCalled();
      expect(response.fallback).toBeUndefined();
    });

    it('skips fallback for profile-only searches even with an empty content index', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      const repos: ISearchRepository[] = [
        makeRepo('content', async () => []),
        makeRepo('profile', async () => [
          makeDocument({ id: 'p1', type: SearchEntityType.PROFILE }),
        ]),
      ];

      const svc = await buildFallbackModule(repos);
      await svc.execute({ ...defaultModel, type: 'profile' });

      expect(searchService.searchYoutubeAsync).not.toHaveBeenCalled();
    });

    it.each(['project', 'job'])(
      'skips fallback for type=%s searches',
      async (type) => {
        cacheService.getCachedUnifiedResults.mockResolvedValue(null);
        const repos: ISearchRepository[] = [
          makeRepo('content', async () => []),
        ];

        const svc = await buildFallbackModule(repos);
        await svc.execute({ ...defaultModel, type });

        expect(searchService.searchYoutubeAsync).not.toHaveBeenCalled();
      },
    );

    it('skips fallback when the platform filter excludes youtube', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      const repos: ISearchRepository[] = [makeRepo('content', async () => [])];

      const svc = await buildFallbackModule(repos);
      await svc.execute({ ...defaultModel, platforms: ['twitter'] });

      expect(searchService.searchYoutubeAsync).not.toHaveBeenCalled();
    });

    it('falls back when the platform filter includes youtube and reports no_new_results', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      const repos: ISearchRepository[] = [makeRepo('content', async () => [])];

      const svc = await buildFallbackModule(repos);
      const response = await svc.execute({
        ...defaultModel,
        platforms: ['youtube'],
      });

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledTimes(1);
      expect(response.fallback).toEqual({
        attempted: true,
        succeeded: false,
        source: 'local',
        importedCount: 0,
        reason: 'no_new_results',
      });
    });

    it('does not import again while another request holds the lock', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      cacheService.acquireYouTubeImportLock.mockResolvedValue(false);

      let contentCalls = 0;
      const repos: ISearchRepository[] = [
        makeRepo('content', async () => {
          contentCalls += 1;
          return contentCalls > 1 ? [importedContent('imported-by-other')] : [];
        }),
      ];

      const svc = await buildFallbackModule(repos);
      const response = await svc.execute(defaultModel);

      expect(searchService.searchYoutubeAsync).not.toHaveBeenCalled();
      expect(cacheService.releaseYouTubeImportLock).not.toHaveBeenCalled();
      expect(response.items[0].id).toBe('imported-by-other');
      expect(response.fallback).toEqual({
        attempted: true,
        succeeded: true,
        source: 'local',
        importedCount: 0,
      });
    });

    it('still imports when Redis is unavailable', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      cacheService.acquireYouTubeImportLock.mockRejectedValue(
        new Error('redis down'),
      );
      searchService.searchYoutubeAsync.mockResolvedValue({
        results: youtubeItems(2),
      } as any);

      let contentCalls = 0;
      const repos: ISearchRepository[] = [
        makeRepo('content', async () => {
          contentCalls += 1;
          return contentCalls > 1 ? [importedContent('yt-video')] : [];
        }),
      ];

      const svc = await buildFallbackModule(repos);
      const response = await svc.execute(defaultModel);

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledTimes(1);
      expect(cacheService.releaseYouTubeImportLock).not.toHaveBeenCalled();
      expect(response.fallback?.source).toBe('youtube_import');
      expect(response.fallback?.succeeded).toBe(true);
    });

    it('returns a valid response with api_error metadata when the import fails', async () => {
      cacheService.getCachedUnifiedResults.mockResolvedValue(null);
      searchService.searchYoutubeAsync.mockRejectedValue(
        new Error('youtube down'),
      );

      const repos: ISearchRepository[] = [makeRepo('content', async () => [])];

      const svc = await buildFallbackModule(repos);
      const response = await svc.execute(defaultModel);

      expect(response.items).toEqual([]);
      expect(response.pagination.total).toBe(0);
      expect(response.fallback).toEqual({
        attempted: true,
        succeeded: false,
        source: 'local',
        importedCount: 0,
        reason: 'api_error',
      });
    });
  });
});
