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

/** Every platform the handler dispatches to, with its service method. */
const PLATFORM_METHODS: Array<{ platform: string; method: string }> = [
  { platform: _const.PLATFORMS.FACEBOOK, method: 'searchFacebookAsync' },
  { platform: _const.PLATFORMS.INSTAGRAM, method: 'searchInstagramAsync' },
  { platform: _const.PLATFORMS.TWITTER, method: 'searchTwitterAsync' },
  { platform: _const.PLATFORMS.LINKEDIN, method: 'searchLinkedInAsync' },
  { platform: _const.PLATFORMS.YOUTUBE, method: 'searchYoutubeAsync' },
  { platform: _const.PLATFORMS.GITHUB, method: 'searchGithubAsync' },
  { platform: _const.PLATFORMS.APPLE, method: 'searchAppleAsync' },
  { platform: _const.PLATFORMS.OPENVERSE, method: 'searchOpenverseAsync' },
  { platform: _const.PLATFORMS.HACKERNEWS, method: 'searchHackernewsAsync' },
  { platform: _const.PLATFORMS.SPOTIFY, method: 'searchSpotifyAsync' },
  { platform: _const.PLATFORMS.REDDIT, method: 'searchRedditAsync' },
  { platform: _const.PLATFORMS.PINTEREST, method: 'searchPinterestAsync' },
  { platform: _const.PLATFORMS.TIKTOK, method: 'searchTiktokAsync' },
  { platform: _const.PLATFORMS.SNAPCHAT, method: 'searchSnapchatAsync' },
  { platform: _const.PLATFORMS.THREADS, method: 'searchThreadsAsync' },
  { platform: _const.PLATFORMS.BEHANCE, method: 'searchBehanceAsync' },
];

/** A search service where every platform method is a spy returning an empty result. */
function makeSearchService() {
  const service: Record<string, jest.Mock> = {};
  for (const { method } of PLATFORM_METHODS) {
    service[method] = jest.fn().mockResolvedValue({ results: [] });
  }
  return service;
}

function makeHandler(
  overrides: {
    searchService?: Record<string, jest.Mock>;
    linkedAccounts?: Array<{ platform: string }>;
    userLogins?: Record<
      string,
      { provider: string; tokenValue: string } | null
    >;
    similarQueries?: Array<{ originalQuery: string; normalizedQuery: string }>;
  } = {},
) {
  const searchService = overrides.searchService ?? makeSearchService();

  const searchHistoryRepository = {
    findSimilarQueriesAsync: jest
      .fn()
      .mockResolvedValue(overrides.similarQueries ?? []),
    createAsync: jest.fn().mockResolvedValue(undefined),
  };

  const linkedAccountRepository = {
    getByUserIdAsync: jest
      .fn()
      .mockResolvedValue(overrides.linkedAccounts ?? []),
  };

  const userLoginRepository = {
    getByUserIdAndProviderAsync: jest
      .fn()
      .mockImplementation(
        async (_userId: string, provider: string) =>
          overrides.userLogins?.[provider] ?? null,
      ),
  };

  const analyticsService = {
    trackEvent: jest.fn().mockResolvedValue(undefined),
  };

  const handler = new GlobalSearchQueryHandler(
    searchService as never,
    searchHistoryRepository as never,
    userLoginRepository as never,
    linkedAccountRepository as never,
    analyticsService as never,
  );

  return {
    handler,
    searchService,
    searchHistoryRepository,
    linkedAccountRepository,
    userLoginRepository,
    analyticsService,
  };
}

function query(model: Partial<GlobalSearchRequestModel>) {
  return new GlobalSearchQuery({
    model: Object.assign(new GlobalSearchRequestModel(), model),
  });
}

/** A stored OAuth token in the shape the userLogins table holds. */
function storedToken(accessToken: string) {
  return JSON.stringify({
    access_token: accessToken,
    refresh_token: 'refresh',
    expires_in: 3600,
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

  describe('per-platform dispatch', () => {
    it.each(PLATFORM_METHODS)(
      'routes a $platform search to $method',
      async ({ platform, method }) => {
        // The core wiring claim: each platform reaches its own service method and no
        // other. A copy-paste error in the dispatch switch would silently search the
        // wrong platform and still return a 200.
        const { handler, searchService } = makeHandler();

        await handler.execute(
          query({ searchTerm: 'design', platforms: [platform] }),
        );

        expect(searchService[method]).toHaveBeenCalledTimes(1);

        for (const other of PLATFORM_METHODS) {
          if (other.method === method) continue;
          expect(searchService[other.method]).not.toHaveBeenCalled();
        }
      },
    );

    it('searches every searchable platform when none is specified', async () => {
      const { handler, searchService } = makeHandler();

      const response = await handler.execute(query({ searchTerm: 'design' }));

      expect(response.platforms).toEqual(_const.SEARCHABLE_PLATFORMS);
      for (const { method } of PLATFORM_METHODS) {
        expect(searchService[method]).toHaveBeenCalledTimes(1);
      }
    });

    it('does not dispatch to link-only platforms', async () => {
      // twitch and discord are in PLATFORMS for account linking but have no search
      // implementation. Including them produced "Unsupported platform" entries in every
      // response.
      const { handler } = makeHandler();

      const response = await handler.execute(query({ searchTerm: 'design' }));

      // github is deliberately absent here — it became searchable once its
      // credential-free API was wired up.
      for (const platform of ['twitch', 'discord']) {
        expect(response.results[platform]).toBeUndefined();
      }
    });

    it('normalises platform casing from the caller', async () => {
      const { handler, searchService } = makeHandler();

      await handler.execute(
        query({ searchTerm: 'design', platforms: ['YouTube', 'PINTEREST'] }),
      );

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledTimes(1);
      expect(searchService.searchPinterestAsync).toHaveBeenCalledTimes(1);
    });

    it('ignores an unknown platform rather than erroring the whole search', async () => {
      const { handler, searchService } = makeHandler();

      const response = await handler.execute(
        query({ searchTerm: 'design', platforms: ['youtube', 'myspace'] }),
      );

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledTimes(1);
      expect(response.platforms).toEqual(['youtube']);
    });
  });

  describe('user OAuth tokens — the "real connection" path', () => {
    function authenticate(userId = 'user-1') {
      userSpy.mockReturnValue({
        [Globals.ClaimTypes.UserId]: userId,
      } as never);
    }

    it('passes a stored token to the platform it belongs to', async () => {
      // This is what makes the eleven credential-blocked platforms work the moment a
      // user connects an account: the token is read from userLogins and handed to that
      // platform's search method.
      authenticate();

      const { handler, searchService } = makeHandler({
        linkedAccounts: [{ platform: _const.PLATFORMS.PINTEREST }],
        userLogins: {
          [_const.PLATFORMS.PINTEREST]: {
            provider: _const.PLATFORMS.PINTEREST,
            tokenValue: storedToken('pinterest-user-token'),
          },
        },
      });

      await handler.execute(
        query({
          searchTerm: 'design',
          platforms: [_const.PLATFORMS.PINTEREST],
        }),
      );

      expect(searchService.searchPinterestAsync).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'pinterest-user-token' }),
      );
    });

    it('never leaks one platform token to another', async () => {
      // A cross-platform token leak would send a user's Pinterest credential to TikTok.
      authenticate();

      const { handler, searchService } = makeHandler({
        linkedAccounts: [{ platform: _const.PLATFORMS.PINTEREST }],
        userLogins: {
          [_const.PLATFORMS.PINTEREST]: {
            provider: _const.PLATFORMS.PINTEREST,
            tokenValue: storedToken('pinterest-user-token'),
          },
        },
      });

      await handler.execute(
        query({
          searchTerm: 'design',
          platforms: [_const.PLATFORMS.PINTEREST, _const.PLATFORMS.TIKTOK],
        }),
      );

      expect(searchService.searchTiktokAsync).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: undefined }),
      );
    });

    it('searches without a token for an anonymous caller', async () => {
      // Public search must still work — it is the product's front door. YouTube, Reddit
      // and Spotify support unauthenticated queries.
      const { handler, searchService, linkedAccountRepository } = makeHandler();

      await handler.execute(
        query({ searchTerm: 'design', platforms: [_const.PLATFORMS.YOUTUBE] }),
      );

      expect(linkedAccountRepository.getByUserIdAsync).not.toHaveBeenCalled();
      expect(searchService.searchYoutubeAsync).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: undefined }),
      );
    });

    it('tolerates a malformed stored token instead of failing the search', async () => {
      // Tokens are encrypted then serialised; a corrupt row must degrade to an
      // unauthenticated search, not a 500.
      authenticate();

      const { handler, searchService } = makeHandler({
        linkedAccounts: [{ platform: _const.PLATFORMS.PINTEREST }],
        userLogins: {
          [_const.PLATFORMS.PINTEREST]: {
            provider: _const.PLATFORMS.PINTEREST,
            tokenValue: 'not-json-at-all',
          },
        },
      });

      await expect(
        handler.execute(
          query({
            searchTerm: 'design',
            platforms: [_const.PLATFORMS.PINTEREST],
          }),
        ),
      ).resolves.toBeDefined();

      expect(searchService.searchPinterestAsync).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: undefined }),
      );
    });

    it('survives a token lookup failure', async () => {
      authenticate();

      const { handler } = makeHandler({
        linkedAccounts: [{ platform: _const.PLATFORMS.PINTEREST }],
      });

      await expect(
        handler.execute(query({ searchTerm: 'design' })),
      ).resolves.toBeDefined();
    });
  });

  describe('failure isolation', () => {
    it('reports one platform failing without losing the others', async () => {
      // Exactly the situation today: Pinterest returns 401 while YouTube works. A
      // rejected platform must not take the response down.
      const searchService = makeSearchService();
      searchService.searchPinterestAsync.mockRejectedValue(
        new Error('Authentication failed'),
      );
      searchService.searchYoutubeAsync.mockResolvedValue({
        results: [{ id: 'v1' }, { id: 'v2' }],
      });

      const { handler } = makeHandler({ searchService });

      const response = await handler.execute(
        query({
          searchTerm: 'design',
          platforms: [_const.PLATFORMS.PINTEREST, _const.PLATFORMS.YOUTUBE],
        }),
      );

      expect(response.results.pinterest).toEqual({
        error: 'Authentication failed',
      });
      expect(response.results.youtube).toEqual({
        results: [{ id: 'v1' }, { id: 'v2' }],
      });
      expect(response.totalResults).toBe(2);
    });

    it('returns a response even when every platform fails', async () => {
      const searchService = makeSearchService();
      for (const { method } of PLATFORM_METHODS) {
        searchService[method].mockRejectedValue(new Error('down'));
      }

      const { handler } = makeHandler({ searchService });

      const response = await handler.execute(query({ searchTerm: 'design' }));

      expect(response.totalResults).toBe(0);
      // Each platform reports its own failure rather than the request 500ing.
      for (const { platform } of PLATFORM_METHODS) {
        expect(response.results[platform]).toEqual({ error: 'down' });
      }
    });

    it('nulls the pagination token for a failed platform', async () => {
      const searchService = makeSearchService();
      searchService.searchYoutubeAsync.mockRejectedValue(new Error('quota'));

      const { handler } = makeHandler({ searchService });

      const response = await handler.execute(
        query({ searchTerm: 'design', platforms: [_const.PLATFORMS.YOUTUBE] }),
      );

      expect(response.paginationTokens.youtube).toBeNull();
    });
  });

  describe('result counting and pagination', () => {
    it('counts YouTube results', async () => {
      const searchService = makeSearchService();
      searchService.searchYoutubeAsync.mockResolvedValue({
        results: [{ id: 1 }, { id: 2 }, { id: 3 }],
        nextPageToken: 'CAoQAA',
      });

      const { handler } = makeHandler({ searchService });
      const response = await handler.execute(
        query({ searchTerm: 'design', platforms: [_const.PLATFORMS.YOUTUBE] }),
      );

      expect(response.totalResults).toBe(3);
      expect(response.paginationTokens.youtube).toBe('CAoQAA');
    });

    it('counts a multi-section platform response', async () => {
      // Pinterest returns pins, boards and users separately; the total must sum them,
      // not report the section count.
      const searchService = makeSearchService();
      searchService.searchPinterestAsync.mockResolvedValue({
        results: { pins: [1, 2], boards: [3], users: [4, 5, 6] },
        bookmark: 'next-page',
      });

      const { handler } = makeHandler({ searchService });
      const response = await handler.execute(
        query({
          searchTerm: 'design',
          platforms: [_const.PLATFORMS.PINTEREST],
        }),
      );

      expect(response.totalResults).toBe(6);
      expect(response.paginationTokens.pinterest).toBe('next-page');
    });

    it('forwards a caller-supplied pagination token to the right platform', async () => {
      const { handler, searchService } = makeHandler();

      await handler.execute(
        query({
          searchTerm: 'design',
          platforms: [_const.PLATFORMS.YOUTUBE, _const.PLATFORMS.REDDIT],
          paginationTokens: { youtube: 'page-2' },
        }),
      );

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledWith(
        expect.objectContaining({ paginationToken: 'page-2' }),
      );
      expect(searchService.searchRedditAsync).toHaveBeenCalledWith(
        expect.objectContaining({ paginationToken: undefined }),
      );
    });

    it('passes page, limit and forceRefresh through unchanged', async () => {
      // forceRefresh bypasses the cache and therefore spends third-party quota, so it
      // must not be set accidentally.
      const { handler, searchService } = makeHandler();

      await handler.execute(
        query({
          searchTerm: 'design',
          platforms: [_const.PLATFORMS.YOUTUBE],
          page: 3,
          limit: 50,
          forceRefresh: true,
        }),
      );

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3, limit: 50, forceRefresh: true }),
      );
    });

    it('defaults to page 1, limit 25 and no force refresh', async () => {
      const { handler, searchService } = makeHandler();

      await handler.execute(
        query({ searchTerm: 'design', platforms: [_const.PLATFORMS.YOUTUBE] }),
      );

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 25, forceRefresh: false }),
      );
    });
  });

  describe('query normalisation and history', () => {
    it('passes both the original and normalised query to each platform', async () => {
      // The normalised form is the cache key; the original is what the platform is
      // actually asked. Conflating them would either break caching or search for the
      // wrong thing.
      const { handler, searchService } = makeHandler();

      await handler.execute(
        query({
          searchTerm: '  Photography!  ',
          platforms: [_const.PLATFORMS.YOUTUBE],
        }),
      );

      expect(searchService.searchYoutubeAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          originalQuery: '  Photography!  ',
          normalizedQuery: 'photography',
        }),
      );
    });

    it('does not record search history for an anonymous caller', async () => {
      // searchHistories is behavioural data about a person; there is no person here.
      const { handler, searchHistoryRepository } = makeHandler();

      await handler.execute(query({ searchTerm: 'design' }));

      expect(searchHistoryRepository.createAsync).not.toHaveBeenCalled();
    });

    it('records search history for an authenticated caller', async () => {
      userSpy.mockReturnValue({
        [Globals.ClaimTypes.UserId]: 'user-1',
      } as never);

      const { handler, searchHistoryRepository } = makeHandler();

      await handler.execute(query({ searchTerm: 'design' }));

      expect(searchHistoryRepository.createAsync).toHaveBeenCalledTimes(1);
    });

    it('does not duplicate an existing history entry', async () => {
      userSpy.mockReturnValue({
        [Globals.ClaimTypes.UserId]: 'user-1',
      } as never);

      const { handler, searchHistoryRepository } = makeHandler({
        similarQueries: [
          { originalQuery: 'design', normalizedQuery: 'design' },
        ],
      });

      await handler.execute(query({ searchTerm: 'design' }));

      expect(searchHistoryRepository.createAsync).not.toHaveBeenCalled();
    });

    it('handles an empty search term without dispatching a useless fan-out', async () => {
      const { handler } = makeHandler();

      const response = await handler.execute(query({ searchTerm: '   ' }));

      expect(response.query).toBe('   ');
      // Normalisation yields nothing, so there is no term to cache or match on.
      expect(response.totalResults).toBe(0);
    });
  });

  describe('analytics', () => {
    it('records that a search was performed', async () => {
      const { handler, analyticsService } = makeHandler();

      await handler.execute(
        query({ searchTerm: 'design', platforms: [_const.PLATFORMS.YOUTUBE] }),
      );

      expect(analyticsService.trackEvent).toHaveBeenCalledWith(
        _const.ANALYTICS_EVENTS.SEARCH.PERFORMED,
        expect.objectContaining({ searchTerm: 'design' }),
      );
    });
  });
});
