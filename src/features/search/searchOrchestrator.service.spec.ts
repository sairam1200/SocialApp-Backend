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
    } as any;

    identityResolver = {
      resolve: jest.fn().mockReturnValue(null),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchOrchestratorService,
        CandidateFactory,
        { provide: RankingEngine, useValue: new RankingEngine(REGISTRY) },
        ResponseAdapter,
        { provide: SearchIdentityResolver, useValue: identityResolver },
        { provide: SearchCacheService, useValue: cacheService },
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
        items: [],
        pagination: { page: 1, limit: 25, total: 0, hasMore: false },
        facets: {
          content: 0,
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
});
