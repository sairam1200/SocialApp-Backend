import { ISearchRepository } from '../../../domain/contracts/search/search-repository.interface';
import { IndexDocument } from '../../../domain/contracts/search/index-document.model';
import { SearchEntityType } from '../../../domain/contracts/search/search-entity-type';
import { ContentStreamSearchRepository } from './content-stream.search.repository';
import { ProfileSearchRepository } from './profile.search.repository';
import { ProjectSearchRepository } from './project.search.repository';
import { JobSearchRepository } from './job.search.repository';

/**
 * Contract suite every ISearchRepository must satisfy. The backing store is
 * arranged by the caller's beforeEach (mocked dependencies mimicking the
 * database). The suite asserts the invariants the repository itself owns:
 * entity-type routing, blank-query short-circuit, IndexDocument shape,
 * 0-100 ranking primitives and limit forwarding. Database-bound guarantees
 * (privacy filtering, real ranking quality) are covered by manual DB
 * verification, not here.
 */
export function runSearchRepositoryContractSuite(opts: {
  repo: ISearchRepository;
  entityType: SearchEntityType;
  seedCount: number;
}): void {
  const { repo, entityType, seedCount } = opts;
  const baseQuery = {
    originalQuery: 'alpha',
    normalizedQuery: 'alpha',
    limit: 10,
  };

  describe(`SearchRepository contract: ${repo.name}`, () => {
    it('returns an array of results for a valid query', async () => {
      const results = await repo.search(baseQuery);
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeLessThanOrEqual(seedCount);
    });

    it('returns an empty list for a blank normalized query', async () => {
      const results = await repo.search({ ...baseQuery, normalizedQuery: '' });
      expect(results).toEqual([]);
    });

    it('returns an empty list when entityType does not match the repository', async () => {
      const other =
        entityType === SearchEntityType.CONTENT
          ? SearchEntityType.PROFILE
          : SearchEntityType.CONTENT;
      const results = await repo.search({ ...baseQuery, entityType: other });
      expect(results).toEqual([]);
    });

    it('passes through when entityType matches the repository', async () => {
      const results = await repo.search({ ...baseQuery, entityType });
      for (const doc of results) {
        expect(doc.type).toBe(entityType);
      }
    });

    it('shapes every document to the IndexDocument contract', async () => {
      const results = await repo.search(baseQuery);
      for (const doc of results) {
        expect(typeof doc.id).toBe('string');
        expect(doc.id.length).toBeGreaterThan(0);
        expect(typeof doc.subType).toBe('string');
        expect(doc.subType.length).toBeGreaterThan(0);
        expect(typeof doc.title).toBe('string');
        expect(doc.title.length).toBeGreaterThan(0);
        expect(doc.metadata).toEqual(expect.any(Object));
        expect(Object.values(SearchEntityType)).toContain(doc.type);
      }
    });

    it('keeps every ranking primitive within the 0-100 range', async () => {
      const results = await repo.search(baseQuery);
      for (const doc of results) {
        const ranking = doc.ranking;
        if (!ranking) continue;
        for (const value of Object.values(ranking)) {
          if (typeof value === 'number') {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(100);
          } else {
            expect(typeof value).toBe('boolean');
          }
        }
      }
    });

    it('forwards the limit to the backing store', async () => {
      const results = await repo.search({ ...baseQuery, limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
}

const contentRow = {
  id: '11111111-1111-1111-1111-111111111111',
  subType: 'video',
  title: 'Alpha Search Test Video',
  platform: 'youtube',
  externalId: 'video-abc',
  publishedAt: new Date('2025-01-01T00:00:00Z'),
  engagementScore: 50,
  creatorId: '22222222-2222-2222-2222-222222222222',
  metaData: {
    description: 'A description for alpha search.',
    channelName: 'Channel One',
    channelUsername: 'channelone',
    engagement: { views: 1000, likeCount: 50 },
  },
  phraseRank: 0.5,
  textRelevance: 0.6,
  textSimilarity: 0.7,
  exactMatch: 0,
  exactPhrase: 1,
  creatorUserId: '22222222-2222-2222-2222-222222222222',
  creatorFirstName: 'Alpha',
  creatorLastName: 'User',
  creatorUserName: 'alpha',
  followersCount: 100,
  creatorVerified: true,
};

describe('ContentStreamSearchRepository', () => {
  const contentStreamContext = { query: jest.fn() };
  const repo = new ContentStreamSearchRepository(contentStreamContext as any);
  const seed = Array.from({ length: 3 }, (_, i) => ({
    ...contentRow,
    id: `11111111-1111-1111-1111-11111111111${i}`,
    title: `Alpha Search Test Video ${i}`,
  }));

  beforeEach(() => {
    contentStreamContext.query.mockImplementation(
      async (_sql: string, params: unknown[]) =>
        seed.slice(0, params[params.length - 1] as number),
    );
  });

  runSearchRepositoryContractSuite({
    repo,
    entityType: SearchEntityType.CONTENT,
    seedCount: seed.length,
  });

  it('projects the index-facing ranking primitives', async () => {
    const results: IndexDocument[] = await repo.search({
      originalQuery: 'alpha',
      normalizedQuery: 'alpha',
      limit: 10,
    });
    expect(results.length).toBe(3);
    const first = results[0];
    expect(first.ranking?.textRelevance).toBe(60);
    expect(first.ranking?.textSimilarity).toBe(70);
    expect(first.ranking?.phraseRelevance).toBe(50);
    expect(first.ranking?.exactPhrase).toBe(true);
    expect(first.creatorName).toBe('Channel One');
    expect(first.creatorUsername).toBe('channelone');
    expect(first.verified).toBe(true);
    expect(first.creatorId).toBe(contentRow.creatorId);
  });
});

describe('ProfileSearchRepository', () => {
  const identityRepository = { searchGlobalAsync: jest.fn() };
  const repo = new ProfileSearchRepository(identityRepository as any);
  const seed = Array.from({ length: 3 }, (_, i) => ({
    id: `33333333-3333-3333-3333-33333333333${i}`,
    firstName: 'Alpha',
    lastName: 'User',
    userName: `alpha${i}`,
    bio: 'A test profile.',
    profileImage: 'https://img.example.com/avatar.png',
    verified: true,
    followersCount: 1000,
    totalPosts: 5,
  }));

  beforeEach(() => {
    identityRepository.searchGlobalAsync.mockImplementation(
      async (
        _query: string,
        _viewerUserId: string | null,
        _page: number,
        limit: number,
      ) => [seed.slice(0, limit), seed.length],
    );
  });

  runSearchRepositoryContractSuite({
    repo,
    entityType: SearchEntityType.PROFILE,
    seedCount: seed.length,
  });
});

describe('ProjectSearchRepository', () => {
  const projectRepository = { searchAsync: jest.fn() };
  const repo = new ProjectSearchRepository(projectRepository as any);
  const now = new Date();
  const seed = Array.from({ length: 3 }, (_, i) => ({
    id: 40 + i,
    clientId: `client-${i}`,
    title: `Alpha Project ${i}`,
    description: 'A test project.',
    projectType: 'open',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    skills: [],
    budget: null,
    currency: 'USD',
    paymentType: 'fixed',
    timeline: null,
    isConfidential: false,
    invitationList: [],
    bountyAmount: null,
  }));

  beforeEach(() => {
    projectRepository.searchAsync.mockImplementation(
      async (_opts: unknown, _page: number, limit: number) => ({
        result: seed.slice(0, limit),
        total: seed.length,
      }),
    );
  });

  runSearchRepositoryContractSuite({
    repo,
    entityType: SearchEntityType.PROJECT,
    seedCount: seed.length,
  });
});

describe('JobSearchRepository', () => {
  const repo = new JobSearchRepository();

  runSearchRepositoryContractSuite({
    repo,
    entityType: SearchEntityType.JOB,
    seedCount: 0,
  });

  it('returns no documents until a real job source exists', async () => {
    const results = await repo.search({
      originalQuery: 'alpha',
      normalizedQuery: 'alpha',
      limit: 10,
    });
    expect(results).toEqual([]);
  });
});
