import {
  SearchMode,
  SearchResultKind,
  SearchSourcePlatform,
} from '../../../domain/contracts/unified-search.model';
import { ContentStream } from '../../../domain/entities';
import { StreamControlService } from '../social/stream-control.service';
import { UnifiedSearchService, normaliseTopic } from './unified-search.service';

/**
 * The ranking, filtering and faceting layer.
 *
 * Every source is stubbed to empty except the aggregated one, which is the
 * cheapest way to put results with chosen topics, platforms and dates into the
 * pool. What is under test is what the service does *after* retrieval — the
 * part that decides what a reader sees and which filters they can still reach.
 */

interface FakeEntry {
  id: string;
  platform: string;
  title: string;
  tags?: string[];
  publishedAt?: Date;
  type?: string;
}

function build(entries: FakeEntry[]): UnifiedSearchService {
  const empty = () => Promise.resolve([]);

  const contentStreams = {
    getEntriesAsync: () =>
      Promise.resolve([
        entries.map((entry) => ({
          ...entry,
          url: `https://${entry.platform}.test/${entry.id}`,
        })) as unknown as ContentStream[],
        entries.length,
      ] as [ContentStream[], number]),
  };

  return new UnifiedSearchService(
    { searchGlobalAsync: () => Promise.resolve([[], 0]) } as never,
    contentStreams as never,
    {
      searchAsync: empty,
      getTrendingCandidateIdsAsync: empty,
      getManyByIdsAsync: empty,
      getMediaForPostsAsync: empty,
    } as never,
    {
      getByUserIdAsync: () => Promise.resolve(null),
      getManyByIdsAsync: empty,
    } as never,
    { getAffinitiesAsync: empty } as never,
    { listLiveAsync: empty } as never,
    {
      searchProjectsAsync: empty,
      recentProjectsAsync: empty,
      searchExternalJobsAsync: empty,
    } as never,
    {
      playbackUrls: () => ({ llHlsUrl: 'https://stream.test/index.m3u8' }),
    } as unknown as StreamControlService,
  );
}

const base = {
  keyword: 'anything',
  viewerUserId: null,
  page: 1,
  limit: 50,
};

describe('normaliseTopic', () => {
  it('gives one theme one spelling', () => {
    // Six sources, six conventions. Without this the rail shows "Design",
    // "design" and "#design" as three categories that filter each other out.
    expect(normaliseTopic(' #Design ')).toBe('design');
    expect(normaliseTopic('##FITNESS')).toBe('fitness');
    expect(normaliseTopic('design')).toBe('design');
  });
});

describe('UnifiedSearchService topics', () => {
  it('counts a theme once per result, not once per mention', async () => {
    const service = build([
      {
        id: '1',
        platform: 'youtube',
        title: 'A',
        tags: ['Design', '#design', 'design'],
      },
      { id: '2', platform: 'youtube', title: 'B', tags: ['design', 'fitness'] },
    ]);

    const result = await service.searchAsync({ ...base, mode: SearchMode.All });

    expect(result.topics).toEqual([
      { topic: 'design', count: 2 },
      { topic: 'fitness', count: 1 },
    ]);
  });

  it('narrows to results carrying any of the chosen themes', async () => {
    const service = build([
      { id: '1', platform: 'youtube', title: 'A', tags: ['design'] },
      { id: '2', platform: 'youtube', title: 'B', tags: ['fitness'] },
      { id: '3', platform: 'youtube', title: 'C', tags: ['cooking'] },
    ]);

    const result = await service.searchAsync({
      ...base,
      mode: SearchMode.All,
      topics: ['design', 'fitness'],
    });

    expect(result.total).toBe(2);
    expect(result.items.map((i) => i.title)).toEqual(
      expect.arrayContaining(['A', 'B']),
    );
  });

  it('matches a theme however it was written', async () => {
    const service = build([
      { id: '1', platform: 'youtube', title: 'A', tags: ['#Design'] },
    ]);

    const result = await service.searchAsync({
      ...base,
      mode: SearchMode.All,
      topics: ['design'],
    });

    expect(result.total).toBe(1);
  });
});

describe('UnifiedSearchService facets', () => {
  it('keeps the other platforms reachable once one is picked', async () => {
    // The bug this guards: counting every facet over the fully filtered list
    // deletes every chip the reader has not already selected, and the filter
    // becomes a one-way door — no way to add a second platform.
    const service = build([
      { id: '1', platform: 'youtube', title: 'A' },
      { id: '2', platform: 'reddit', title: 'B' },
    ]);

    const result = await service.searchAsync({
      ...base,
      mode: SearchMode.All,
      platforms: [SearchSourcePlatform.YouTube],
    });

    expect(result.total).toBe(1);
    expect(result.sources.map((s) => s.platform)).toEqual(
      expect.arrayContaining([
        SearchSourcePlatform.YouTube,
        SearchSourcePlatform.Reddit,
      ]),
    );
  });

  it('still narrows the other facets by the filters that are not their own', async () => {
    const service = build([
      { id: '1', platform: 'youtube', title: 'A', tags: ['design'] },
      { id: '2', platform: 'reddit', title: 'B', tags: ['fitness'] },
    ]);

    const result = await service.searchAsync({
      ...base,
      mode: SearchMode.All,
      platforms: [SearchSourcePlatform.YouTube],
    });

    // Platform facet ignores the platform filter; the topic facet does not.
    expect(result.topics).toEqual([{ topic: 'design', count: 1 }]);
  });

  it('reports kinds present in the results', async () => {
    const service = build([
      { id: '1', platform: 'youtube', title: 'A', type: 'video' },
      { id: '2', platform: 'youtube', title: 'B', type: 'video' },
    ]);

    const result = await service.searchAsync({ ...base, mode: SearchMode.All });

    expect(result.kinds[0]).toEqual({
      kind: SearchResultKind.Video,
      count: 2,
    });
  });
});

describe('UnifiedSearchService modes', () => {
  it('orders latest purely by date', async () => {
    const service = build([
      {
        id: 'old',
        platform: 'youtube',
        title: 'Old',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        id: 'new',
        platform: 'youtube',
        title: 'New',
        publishedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.searchAsync({
      ...base,
      mode: SearchMode.Latest,
    });

    expect(result.items.map((i) => i.title)).toEqual(['New', 'Old']);
  });

  it('shuffles the same way for the same seed, so paging is stable', async () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      platform: 'youtube',
      title: `T${index}`,
    }));

    const first = await build(entries).searchAsync({
      ...base,
      mode: SearchMode.Random,
      seed: 'abc',
    });
    const again = await build(entries).searchAsync({
      ...base,
      mode: SearchMode.Random,
      seed: 'abc',
    });
    const other = await build(entries).searchAsync({
      ...base,
      mode: SearchMode.Random,
      seed: 'xyz',
    });

    const order = (r: typeof first) => r.items.map((i) => i.title);
    expect(order(again)).toEqual(order(first));
    expect(order(other)).not.toEqual(order(first));
  });

  it('pages without repeating or dropping a result', async () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      platform: 'youtube',
      title: `T${index}`,
    }));
    const service = build(entries);

    const page1 = await service.searchAsync({
      ...base,
      mode: SearchMode.Random,
      seed: 'abc',
      limit: 4,
      page: 1,
    });
    const page2 = await service.searchAsync({
      ...base,
      mode: SearchMode.Random,
      seed: 'abc',
      limit: 4,
      page: 2,
    });

    expect(page1.hasMore).toBe(true);
    expect(
      new Set([...page1.items, ...page2.items].map((i) => i.id)).size,
    ).toBe(8);
  });
});
