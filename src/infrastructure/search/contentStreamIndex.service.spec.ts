import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentStreamIndexService } from './contentStreamIndex.service';
import { ContentStream } from '../../domain/entities/contentStream.entity';
import { StreamEntityType } from '../../domain/enums';

function buildService(): {
  service: ContentStreamIndexService;
  execute: jest.Mock;
  emitted: jest.Mock;
  captured: () => {
    values?: Record<string, any>;
    orUpdate?: { cols: string[]; target: string[] };
  };
} {
  const latest: {
    values?: Record<string, any>;
    orUpdate?: { cols: string[]; target: string[] };
  } = {};
  const execute = jest.fn().mockResolvedValue(undefined);
  const emitted = jest.fn();
  const values = jest.fn((v: Record<string, any>) => {
    latest.values = v;
    return {
      orUpdate: jest.fn((cols: string[], target: string[]) => {
        latest.orUpdate = { cols, target };
        return { execute };
      }),
    };
  });
  const into = jest.fn(() => ({ values }));
  const insert = jest.fn(() => ({ into }));
  const repository = {
    createQueryBuilder: jest.fn(() => ({ insert })),
  } as unknown as Repository<ContentStream>;
  const service = new ContentStreamIndexService(repository, {
    emit: emitted,
  } as unknown as EventEmitter2);
  return {
    service,
    execute,
    emitted,
    captured: () => latest,
  };
}

describe('ContentStreamIndexService', () => {
  it('indexes a document through the (platform, externalId) upsert', async () => {
    const { service, execute, emitted, captured } = buildService();
    const content = new ContentStream({
      type: StreamEntityType.Content,
      subType: 'video',
      title: 'Hello World',
      platform: 'youtube',
      externalId: 'abc123',
      metaData: {
        description: 'A test video',
        publishedAt: '2021-01-01T00:00:00.000Z',
      },
    });

    await service.index(content);

    expect(execute).toHaveBeenCalled();
    expect(captured().values?.platform).toBe('youtube');
    expect(captured().values?.externalId).toBe('abc123');
    expect(captured().values?.title).toBe('Hello World');
    expect(captured().orUpdate?.cols).toEqual(
      expect.arrayContaining([
        'searchText',
        'publishedAt',
        'engagementScore',
        'creatorId',
        'metaData',
        'lastRefreshed',
      ]),
    );
    expect(captured().orUpdate?.target).toEqual(['platform', 'externalId']);
    expect(emitted).toHaveBeenCalledWith(
      'content.indexed',
      expect.objectContaining({ platform: 'youtube' }),
    );
  });

  it('normalizes TikTok nested stats into a canonical engagement object', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'video',
        title: 'TikTok clip',
        platform: 'tiktok',
        externalId: 'tv1',
        metaData: {
          stats: {
            likeCount: 2,
            commentCount: 3,
            shareCount: 4,
            viewCount: 1000,
          },
        },
      }),
    );

    const metaData = captured().values?.metaData;
    expect(metaData.engagement).toEqual({
      viewCount: 1000,
      likeCount: 2,
      commentCount: 3,
      shareCount: 4,
      subscriberCount: 0,
      followerCount: 0,
    });
    expect(captured().values?.engagementScore).toBeGreaterThan(0);
  });

  it('preserves original provider fields while adding canonical ones', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'pin',
        title: 'A pin',
        platform: 'pinterest',
        externalId: 'pin1',
        metaData: {
          image_cover_url: 'https://img.example.com/pin.png',
          pin_count: 12,
        },
      }),
    );

    const metaData = captured().values?.metaData;
    expect(metaData.image_cover_url).toBe('https://img.example.com/pin.png');
    expect(metaData.thumbnailUrl).toBe('https://img.example.com/pin.png');
    expect(metaData.engagement.pin_count).toBeUndefined();
  });

  it('derives publishedAt from TikTok unix-seconds createTime', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'video',
        title: 'TikTok clip',
        platform: 'tiktok',
        externalId: 'tv2',
        metaData: { createTime: 1609459200 },
      }),
    );

    expect(captured().values?.publishedAt?.toISOString()).toBe(
      '2021-01-01T00:00:00.000Z',
    );
  });

  it('derives publishedAt from Reddit createdUtc', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'post',
        title: 'Reddit post',
        platform: 'reddit',
        externalId: 'rp1',
        metaData: { createdUtc: 1609459200 },
      }),
    );

    expect(captured().values?.publishedAt?.toISOString()).toBe(
      '2021-01-01T00:00:00.000Z',
    );
  });

  it('parses a bare Spotify release year as publishedAt', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'track',
        title: 'A track',
        platform: 'spotify',
        externalId: 'sp1',
        metaData: { releaseDate: '2021' },
      }),
    );

    expect(captured().values?.publishedAt?.toISOString()).toBe(
      '2021-01-01T00:00:00.000Z',
    );
  });

  it('keeps the engagement score formula unchanged', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'video',
        title: 'Video',
        platform: 'youtube',
        externalId: 'yt1',
        metaData: {
          viewCount: 10000000,
          likeCount: 1000000,
          commentCount: 100000,
          subscriberCount: 10000000,
        },
      }),
    );

    // view*0.4 + like*0.3 + comment*0.2 + subscriber*0.1, each capped at 1.
    expect(captured().values?.engagementScore).toBeCloseTo(1.0, 5);
  });

  it('resolves a reddit author into a canonical creator name', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'post',
        title: 'A post',
        platform: 'reddit',
        externalId: 'rp2',
        metaData: { author: 'someuser' },
      }),
    );

    expect(captured().values?.metaData.creatorName).toBe('someuser');
    expect(captured().values?.searchText).toContain('someuser');
  });

  it('nulls out non-uuid platform creator ids', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'video',
        title: 'Video',
        platform: 'youtube',
        externalId: 'yt2',
        metaData: { channelId: 'UCnotauuid' },
      }),
    );

    expect(captured().values?.creatorId).toBeNull();
  });

  it('keeps a real uuid creatorId from user content', async () => {
    const { service, captured } = buildService();
    const uuid = '11111111-1111-1111-1111-111111111111';
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'video',
        title: 'Video',
        platform: 'youtube',
        externalId: 'yt3',
        creatorId: uuid,
      }),
    );

    expect(captured().values?.creatorId).toBe(uuid);
  });

  it('builds cleaned searchText from title, description, tags and creator', async () => {
    const { service, captured } = buildService();
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'post',
        title: 'Amazing Content!',
        platform: 'reddit',
        externalId: 'rp3',
        metaData: {
          description: 'Deep-dive into cooking',
          tags: ['cooking', 'recipe'],
          author: 'chef_k',
        },
      }),
    );

    const searchText = captured().values?.searchText;
    expect(searchText).toContain('amazing content');
    expect(searchText).toContain('deep-dive into cooking');
    expect(searchText).toContain('cooking recipe');
    expect(searchText).toContain('chefk');
  });

  it('re-indexing an existing (platform, externalId) upserts the row instead of inserting a duplicate', async () => {
    const upserts: Array<{
      values: Record<string, any>;
      orUpdate: { cols: string[]; target: string[] };
    }> = [];
    const execute = jest.fn().mockResolvedValue(undefined);
    const values = jest.fn((v: Record<string, any>) => {
      upserts.push({ values: v, orUpdate: undefined as any });
      return {
        orUpdate: jest.fn((cols: string[], target: string[]) => {
          upserts[upserts.length - 1].orUpdate = { cols, target };
          return { execute };
        }),
      };
    });
    const into = jest.fn(() => ({ values }));
    const insert = jest.fn(() => ({ into }));
    const repository = {
      createQueryBuilder: jest.fn(() => ({ insert })),
    } as unknown as Repository<ContentStream>;
    const service = new ContentStreamIndexService(repository, {
      emit: jest.fn(),
    } as unknown as EventEmitter2);

    const older = new Date(2021, 0, 1);
    const newer = new Date(2025, 0, 1);

    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'video',
        title: 'First fetch',
        platform: 'youtube',
        externalId: 'dup1',
        metaData: {},
        lastRefreshed: older,
      }),
    );
    await service.index(
      new ContentStream({
        type: StreamEntityType.Content,
        subType: 'video',
        title: 'Second fetch',
        platform: 'youtube',
        externalId: 'dup1',
        metaData: {},
        lastRefreshed: newer,
      }),
    );

    expect(upserts).toHaveLength(2);
    for (const upsert of upserts) {
      // Every write is the same conflict-target upsert — never a plain insert.
      expect(upsert.orUpdate.target).toEqual(['platform', 'externalId']);
      expect(upsert.orUpdate.cols).toEqual(
        expect.arrayContaining(['lastRefreshed', 'searchText', 'metaData']),
      );
    }
    // The second fetch's freshness flows through the upsert, refreshing the
    // existing row rather than adding a duplicate.
    expect(upserts[1].values.lastRefreshed.getTime()).toBeGreaterThan(
      upserts[0].values.lastRefreshed.getTime(),
    );
    expect(upserts[1].values.title).toBe('Second fetch');
  });
});
