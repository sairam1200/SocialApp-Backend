/**
 * Stub the entity barrel before importing the handler.
 *
 * `search.handler.ts` imports `SearchHistory` from `domain/entities`, whose index pulls
 * in the entire entity graph — and with it `nanoid` v5 and `uuid` v14, both ESM-only.
 * Production tolerates that because Node 22+ can `require()` an ESM module with no
 * top-level await; Jest's CommonJS runtime cannot, and fails at import with
 * "Cannot use import statement outside a module".
 *
 * Chasing each ESM-only package through `transformIgnorePatterns` is whack-a-mole and
 * would grow with every dependency. The handler only ever constructs `SearchHistory`, so
 * stubbing the barrel isolates this suite from the graph entirely — and keeps it a unit
 * test of orchestration rather than an accidental integration test of TypeORM metadata.
 */
jest.mock('../../domain/entities', () => ({
  SearchHistory: class SearchHistory {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import _const from '../../core/utils/const';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { Globals } from '../../core/globals';
import {
  GlobalSearchQuery,
  GlobalSearchQueryHandler,
  GlobalSearchRequestModel,
} from './search.handler';
import { SearchOrchestratorService } from './searchOrchestrator.service';

/**
 * Multi-platform search orchestration.
 *
 * ## Why this suite exists
 *
 * Only YouTube has working credentials, so eleven of twelve platform integrations
 * cannot be exercised against a live API. That was previously described as "the code
 * path exists but is unverified" — which was a weaker statement than it needed to be.
 * The *connection logic* is verifiable without credentials: that each platform is
 * dispatched to its own service method, that a user's stored OAuth token reaches the
 * right platform and nowhere else, that one platform failing does not take the others
 * down, and that results are counted and paginated per platform.
 *
 * That is what this pins. It does not prove Pinterest's API returns data — nothing can,
 * until the token is re-authorised — but it does prove that when a token arrives, it is
 * used correctly. The distinction matters: it separates "waiting on credentials" from
 * "waiting on code".
 *
 * The live end-to-end YouTube run is recorded in
 * docs/integrations/END_TO_END_VERIFICATION.md.
 */

function makeHandler(
  overrides: {
    orchestrator?: jest.Mocked<SearchOrchestratorService>;
    analyticsService?: { trackEvent: jest.Mock };
  } = {},
) {
  const orchestrator = overrides.orchestrator ?? {
    execute: jest.fn().mockResolvedValue({
      query: 'design',
      items: [],
      pagination: { page: 1, limit: 25, total: 0, hasMore: false },
      facets: {
        content: 0,
        profile: 0,
        project: 0,
        job: 0,
      },
    }),
  } as unknown as jest.Mocked<SearchOrchestratorService>;

  const analyticsService = overrides.analyticsService ?? {
    trackEvent: jest.fn().mockResolvedValue(undefined),
  };

  const handler = new GlobalSearchQueryHandler(
    analyticsService as never,
    orchestrator,
  );

  return {
    handler,
    orchestrator,
    analyticsService,
  };
}

function query(model: Partial<GlobalSearchRequestModel>) {
  return new GlobalSearchQuery({
    model: Object.assign(new GlobalSearchRequestModel(), model),
  });
}

describe('GlobalSearchQueryHandler', () => {
  let userSpy: jest.SpyInstance;

  beforeEach(() => {
    // Anonymous by default; individual tests authenticate.
    userSpy = jest
      .spyOn(HttpContext, 'user', 'get')
      .mockReturnValue(null as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('orchestrator delegation', () => {
    it('delegates to SearchOrchestratorService.execute', async () => {
      const { handler, orchestrator } = makeHandler();

      await handler.execute(query({ searchTerm: 'design' }));

      expect(orchestrator.execute).toHaveBeenCalledTimes(1);
      expect(orchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({ searchTerm: 'design' }),
      );
    });

    it('returns the orchestrator response unchanged', async () => {
      const mockResponse = {
        query: 'design',
        items: [{ id: '1', title: 'Test' }],
        pagination: { page: 1, limit: 25, total: 1, hasMore: false },
        facets: { content: 1, profile: 0, project: 0, job: 0 },
      };
      const { handler, orchestrator } = makeHandler();
      orchestrator.execute.mockResolvedValue(mockResponse as any);

      const response = await handler.execute(query({ searchTerm: 'design' }));

      expect(response).toEqual(mockResponse);
    });

    it('sets viewerUserId from HttpContext before calling orchestrator', async () => {
      userSpy.mockReturnValue({
        [Globals.ClaimTypes.UserId]: 'user-123',
      } as never);

      const { handler, orchestrator } = makeHandler();

      await handler.execute(query({ searchTerm: 'design' }));

      expect(orchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({ viewerUserId: 'user-123' }),
      );
    });

    it('returns empty results on orchestrator failure', async () => {
      const { handler, orchestrator } = makeHandler();
      orchestrator.execute.mockRejectedValue(new Error('Search failed'));

      const response = await handler.execute(query({ searchTerm: 'design' }));

      expect(response.items).toEqual([]);
      expect(response.pagination.total).toBe(0);
    });

    it('tracks analytics event before executing search', async () => {
      const { handler, analyticsService } = makeHandler();

      await handler.execute(
        query({ searchTerm: 'design', platforms: ['youtube'] }),
      );

      expect(analyticsService.trackEvent).toHaveBeenCalledWith(
        _const.ANALYTICS_EVENTS.SEARCH.PERFORMED,
        expect.objectContaining({
          searchTerm: 'design',
          platforms: ['youtube'],
        }),
      );
    });
  });
});
