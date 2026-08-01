import axios from 'axios';
import { SearchService } from './search.service';
import type { ContentStream } from '../../domain/entities/contentStream.entity';
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
});
