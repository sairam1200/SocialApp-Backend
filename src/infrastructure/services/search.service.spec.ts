import axios from 'axios';
import { SearchService } from './search.service';
import { ContentStream } from '../../domain/entities';
import { SearchCacheService } from './searchCache.service';
import { IContentStreamRepository } from '../../domain/repositories/icontentStream.repository';
import { ILinkedAccountRepository } from '../../domain/repositories/ilinkedAccount.repository';
import { IContentStreamIndexService } from '../../domain/services/icontentStreamIndex.service';
import { PlatformSearchParamsModel } from 'domain/contracts/platform-search.model';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../domain/entities', () => ({
  ContentStream: class ContentStream {
    constructor(init: Partial<ContentStream> = {}) {
      Object.assign(this, init);
    }
  },
  LinkedAccount: class LinkedAccount {},
  UserContent: class UserContent {},
}));

const mockedAxiosGet = axios.get as jest.Mock;

function buildService(indexBatch: jest.Mock): SearchService {
  const cacheService = {
    getCachedResults: jest.fn().mockResolvedValue(null),
    waitForCachedResults: jest.fn().mockResolvedValue(null),
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(undefined),
    setCachedResults: jest.fn().mockResolvedValue(undefined),
  };

  const emptyRepository = {
    getEntriesAsync: jest.fn().mockResolvedValue([[], 0]),
  };

  return new SearchService(
    emptyRepository as unknown as IContentStreamRepository,
    emptyRepository as unknown as ILinkedAccountRepository,
    cacheService as unknown as SearchCacheService,
    { indexBatch } as unknown as IContentStreamIndexService,
  );
}

const FACEBOOK_ITEMS = [
  {
    id: 'fb_1',
    name: 'Gaddr Community',
    message: 'Hello from Gaddr',
    type: 'page',
    full_picture: 'https://img.example.com/community.png',
    link: 'https://facebook.com/gaddr',
  },
  {
    id: 'fb_2',
    name: 'Gaddr Open Source',
    message: 'Contributions welcome',
    type: 'page',
    full_picture: 'https://img.example.com/oss.png',
    link: 'https://facebook.com/gaddr-oss',
  },
];

function facebookParams(overrides: Partial<PlatformSearchParamsModel> = {}) {
  return {
    page: 1,
    normalizedQuery: 'gaddr',
    originalQuery: 'gaddr',
    limit: 25,
    filters: {},
    accessToken: 'test-token',
    forceRefresh: true,
    ...overrides,
  } as PlatformSearchParamsModel;
}

describe('SearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('indexes every fetched item through indexBatch without deduplication', async () => {
    mockedAxiosGet.mockResolvedValue({ data: { data: FACEBOOK_ITEMS } });
    const indexBatch = jest.fn().mockResolvedValue(undefined);
    const service = buildService(indexBatch);

    const response = await service.searchFacebookAsync(facebookParams());

    expect(indexBatch).toHaveBeenCalledTimes(1);
    const indexed = indexBatch.mock.calls[0][0] as ContentStream[];
    expect(indexed.map((c) => c.externalId).sort()).toEqual(['fb_1', 'fb_2']);
    expect(indexed.length).toBe(FACEBOOK_ITEMS.length);

    // Response building is untouched by the persistence change.
    expect(response.query).toBe('gaddr');
  });

  it('skips indexing entirely when the upstream fetch returns nothing', async () => {
    mockedAxiosGet.mockResolvedValue({ data: { data: [] } });
    const indexBatch = jest.fn().mockResolvedValue(undefined);
    const service = buildService(indexBatch);

    const response = await service.searchFacebookAsync(facebookParams());

    expect(indexBatch).not.toHaveBeenCalled();
    expect(response.query).toBe('gaddr');
  });

  it('still returns a response when indexing fails, logging instead of aborting', async () => {
    mockedAxiosGet.mockResolvedValue({ data: { data: FACEBOOK_ITEMS } });
    const indexBatch = jest.fn().mockRejectedValue(new Error('db down'));
    const service = buildService(indexBatch);

    const response = await service.searchFacebookAsync(facebookParams());

    expect(indexBatch).toHaveBeenCalledTimes(1);
    expect(response.query).toBe('gaddr');
  });

  describe('YouTube search statistics enrichment', () => {
    const YOUTUBE_SEARCH_ITEMS = [
      {
        id: { kind: 'youtube#video', videoId: 'vid_1' },
        snippet: {
          channelId: 'chan_1',
          channelTitle: 'Gaddr',
          title: 'Gaddr intro',
          description: 'First video',
          publishedAt: '2024-01-01T00:00:00.000Z',
        },
      },
    ];

    function youtubeParams(
      overrides: Partial<PlatformSearchParamsModel> = {},
    ): PlatformSearchParamsModel {
      return {
        page: 1,
        normalizedQuery: 'gaddr',
        originalQuery: 'gaddr',
        limit: 25,
        filters: {},
        accessToken: 'test-token',
        forceRefresh: true,
        ...overrides,
      };
    }

    function mockYoutubeAxios(statistics: Record<string, any>) {
      mockedAxiosGet.mockImplementation((url: string) => {
        if (url.includes('/youtube/v3/search')) {
          return Promise.resolve({ data: { items: YOUTUBE_SEARCH_ITEMS } });
        }
        if (url.includes('/youtube/v3/channels')) {
          return Promise.resolve({ data: { items: [] } });
        }
        if (url.includes('/youtube/v3/videos')) {
          return Promise.resolve({
            data: { items: [{ id: 'vid_1', statistics }] },
          });
        }
        return Promise.resolve({ data: { items: [] } });
      });
    }

    it('persists batched videos.list statistics as flat metaData on the ContentStream', async () => {
      mockYoutubeAxios({
        viewCount: '12345',
        likeCount: '678',
        commentCount: '90',
        favoriteCount: '12',
      });
      const indexBatch = jest.fn().mockResolvedValue(undefined);
      const service = buildService(indexBatch);

      await service.searchYoutubeAsync(youtubeParams());

      expect(indexBatch).toHaveBeenCalledTimes(1);
      const indexed = indexBatch.mock.calls[0][0] as ContentStream[];
      expect(indexed[0].metaData?.viewCount).toBe(12345);
      expect(indexed[0].metaData?.likeCount).toBe(678);
      expect(indexed[0].metaData?.commentCount).toBe(90);
      expect(indexed[0].metaData?.favoriteCount).toBe(12);
      expect(indexed[0].metaData?.shareCount).toBeNull();
    });

    it('defaults missing statistics to zero and shareCount to null', async () => {
      mockYoutubeAxios({});
      const indexBatch = jest.fn().mockResolvedValue(undefined);
      const service = buildService(indexBatch);

      await service.searchYoutubeAsync(youtubeParams());

      const indexed = indexBatch.mock.calls[0][0] as ContentStream[];
      expect(indexed[0].metaData?.viewCount).toBe(0);
      expect(indexed[0].metaData?.likeCount).toBe(0);
      expect(indexed[0].metaData?.commentCount).toBe(0);
      expect(indexed[0].metaData?.favoriteCount).toBe(0);
      expect(indexed[0].metaData?.shareCount).toBeNull();
    });

    it('skips enrichment when the videos.list call fails, still returning a response', async () => {
      mockedAxiosGet.mockImplementation((url: string) => {
        if (url.includes('/youtube/v3/search')) {
          return Promise.resolve({ data: { items: YOUTUBE_SEARCH_ITEMS } });
        }
        if (url.includes('/youtube/v3/channels')) {
          return Promise.resolve({ data: { items: [] } });
        }
        if (url.includes('/youtube/v3/videos')) {
          return Promise.reject(new Error('quota exceeded'));
        }
        return Promise.resolve({ data: { items: [] } });
      });
      const indexBatch = jest.fn().mockResolvedValue(undefined);
      const service = buildService(indexBatch);

      const response = await service.searchYoutubeAsync(youtubeParams());

      const indexed = indexBatch.mock.calls[0][0] as ContentStream[];
      expect(indexed[0].metaData?.viewCount).toBeUndefined();
      expect(indexed[0].metaData?.shareCount).toBeUndefined();
      expect(response.query).toBe('gaddr');
    });

    it('exposes favoriteCount and shareCount on the search response', async () => {
      mockYoutubeAxios({
        viewCount: '5',
        likeCount: '1',
        commentCount: '0',
        favoriteCount: '2',
      });
      const contentStream = new ContentStream({
        externalId: 'vid_1',
        subType: 'video',
        title: 'Gaddr intro',
        metaData: {
          viewCount: 5,
          likeCount: 1,
          commentCount: 0,
          favoriteCount: 2,
          shareCount: null,
        },
      });
      const contentRepo = {
        getEntriesAsync: jest.fn().mockResolvedValue([[contentStream], 1]),
      };
      const cacheService = {
        getCachedResults: jest.fn().mockResolvedValue(null),
        waitForCachedResults: jest.fn().mockResolvedValue(null),
        acquireLock: jest.fn().mockResolvedValue(true),
        releaseLock: jest.fn().mockResolvedValue(undefined),
        setCachedResults: jest.fn().mockResolvedValue(undefined),
      };
      const emptyRepo = {
        getEntriesAsync: jest.fn().mockResolvedValue([[], 0]),
      };
      const indexBatch = jest.fn().mockResolvedValue(undefined);
      const service = new SearchService(
        contentRepo as unknown as IContentStreamRepository,
        emptyRepo as unknown as ILinkedAccountRepository,
        cacheService as unknown as SearchCacheService,
        { indexBatch } as unknown as IContentStreamIndexService,
      );

      const response = await service.searchYoutubeAsync(youtubeParams());

      expect(response.results[0].favoriteCount).toBe(2);
      expect(response.results[0].shareCount).toBeNull();
    });
  });
});
