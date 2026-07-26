import { Inject, Injectable } from '@nestjs/common';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import {
  SearchMode,
  SearchResultItem,
  SearchResultKind,
  SearchSourcePlatform,
  SOURCE_LABELS,
  NATIVE_PLATFORMS,
  UnifiedSearchResponse,
} from '../../../domain/contracts/unified-search.model';
import {
  mapCommunityPost,
  mapContentStream,
  mapExternalJob,
  mapGaddrProfile,
  mapLiveStream,
  mapProject,
} from '../../../domain/mappers/unified-search.mapper';
import { ContentStream } from '../../../domain/entities';
import {
  IGaddrJobsRepository,
  IIdentityRepository,
} from '../../../domain/repositories';
import { IContentStreamRepository } from '../../../domain/repositories/icontentStream.repository';
import {
  IEngagementRepository,
  IPostRepository,
  ISocialProfileRepository,
  IStreamRepository,
} from '../../../domain/repositories/isocial.repository';
import {
  PUBLIC_SCOPE,
  RankedList,
  VisibilityScope,
  ageInHours,
  cosineSimilarity,
  fnv1a,
  logSaturate,
  recencyDecay,
  reciprocalRankFusion,
  toSparseVector,
  topicVector,
} from '../../../core/utils/recommendation';
import { StreamControlService } from '../social/stream-control.service';

/** Pulled per source before fusion. Generous — fusion does the narrowing. */
const PER_SOURCE_LIMIT = 40;

export interface UnifiedSearchRequest {
  keyword: string;
  mode: SearchMode;
  viewerUserId: string | null;
  page: number;
  limit: number;
  /** Restrict to these platforms. Empty means all. */
  platforms?: SearchSourcePlatform[];
  kinds?: SearchResultKind[];
  /** Stable seed for `random`, so paging does not reshuffle. */
  seed?: string;
}

/**
 * One search across everything.
 *
 * The "All" tab never worked because there was nothing to put in it: search
 * returned five differently-shaped arrays and the client had to branch on each.
 * This normalises every source into `SearchResultItem` first, which is what
 * makes All, For You, sorting, filtering and a single card component possible.
 *
 * **It reuses the Community recommender rather than growing a second one.**
 * Retrieval is per-source, fusion is Reciprocal Rank Fusion, and For You adds
 * the reader's topic affinities on top. A separate search ranker would mean two
 * notions of "good" that disagree — and the reader would feel it as the feed
 * and the search results recommending different things.
 *
 * Seven sources, all concurrent, all failing soft. A dead credential on one
 * platform must cost that platform's results and nothing else — the same rule
 * that already governs aggregated search.
 */
@Injectable()
export class UnifiedSearchService {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly users: IIdentityRepository,
    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreams: IContentStreamRepository,
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.IENGAGEMENT_REPOSITORY)
    private readonly engagement: IEngagementRepository,
    @Inject(_const.ISTREAM_REPOSITORY)
    private readonly streams: IStreamRepository,
    @Inject(_const.IGADDRJOBS_REPOSITORY)
    private readonly jobs: IGaddrJobsRepository,
    private readonly streamControl: StreamControlService,
  ) {}

  public async searchAsync(
    request: UnifiedSearchRequest,
  ): Promise<UnifiedSearchResponse> {
    const keyword = (request.keyword ?? '').trim();
    const limit = Math.min(Math.max(request.limit, 1), 50);
    const page = Math.max(request.page, 1);

    const viewerProfile = request.viewerUserId
      ? await this.profiles.getByUserIdAsync(request.viewerUserId)
      : null;

    const lists = await this.retrieveAsync(keyword, viewerProfile?.id ?? null);

    // One flat pool, keyed by id — the same result can legitimately arrive
    // from two sources, and it should appear once.
    const byId = new Map<string, SearchResultItem>();
    for (const list of lists) {
      for (const item of list.items) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
    }

    let ranked = await this.rankAsync(
      request.mode,
      lists,
      byId,
      viewerProfile?.id ?? null,
      request.seed ?? keyword,
    );

    ranked = this.applyFilters(ranked, request);

    const start = (page - 1) * limit;
    const pageItems = ranked.slice(start, start + limit);

    return {
      mode: request.mode,
      keyword,
      items: pageItems,
      total: ranked.length,
      hasMore: start + limit < ranked.length,
      sources: this.countSources(ranked),
      kinds: this.countKinds(ranked),
    };
  }

  /* ------------------------------------------------------------ retrieval */

  /**
   * Every source, concurrently, each already mapped to `SearchResultItem`.
   *
   * `Promise.allSettled`, never `Promise.all`. Seven sources means seven ways
   * to fail, and any one of them taking down search would make the whole
   * feature less reliable than the worst platform it talks to.
   */
  private async retrieveAsync(
    keyword: string,
    viewerProfileId: string | null,
  ): Promise<
    Array<{ source: string; weight: number; items: SearchResultItem[] }>
  > {
    const scope: VisibilityScope = { ...PUBLIC_SCOPE, viewerProfileId };

    const jobs: Array<{
      source: string;
      weight: number;
      run: () => Promise<SearchResultItem[]>;
    }> = [
      {
        source: 'gaddr-community',
        // Our own content is weighted highest. It is the thing a reader can
        // actually watch, reply to and follow without leaving.
        weight: 1.3,
        run: () => this.communityPosts(keyword, scope),
      },
      {
        source: 'gaddr-profiles',
        weight: 1.1,
        run: () => this.gaddrProfiles(keyword, viewerProfileId),
      },
      {
        source: 'gaddr-live',
        weight: 1.2,
        run: () => this.liveStreams(keyword),
      },
      {
        source: 'gaddr-jobs-projects',
        weight: 1.0,
        run: () => this.projects(keyword),
      },
      {
        source: 'gaddr-jobs-external',
        weight: 0.7,
        run: () => this.externalJobs(keyword),
      },
      {
        source: 'platforms',
        weight: 0.9,
        run: () => this.aggregated(keyword),
      },
    ];

    const settled = await Promise.allSettled(jobs.map((j) => j.run()));

    const lists: Array<{
      source: string;
      weight: number;
      items: SearchResultItem[];
    }> = [];
    settled.forEach((result, index) => {
      const job = jobs[index];
      if (result.status === 'fulfilled') {
        lists.push({
          source: job.source,
          weight: job.weight,
          items: result.value,
        });
        return;
      }
      logger.warn(
        `[unified-search] source "${job.source}" failed; continuing without it`,
        result.reason,
      );
    });
    return lists;
  }

  private async communityPosts(
    keyword: string,
    scope: VisibilityScope,
  ): Promise<SearchResultItem[]> {
    const posts = keyword
      ? await this.posts.searchAsync(keyword, scope, PER_SOURCE_LIMIT)
      : await this.posts.getManyByIdsAsync(
          await this.posts.getTrendingCandidateIdsAsync(
            24 * 14,
            PER_SOURCE_LIMIT,
          ),
        );
    if (posts.length === 0) return [];

    const [authors, media] = await Promise.all([
      this.profiles.getManyByIdsAsync(
        Array.from(new Set(posts.map((p) => p.authorProfileId))),
      ),
      this.posts.getMediaForPostsAsync(posts.map((p) => p.id)),
    ]);

    const authorById = new Map(authors.map((a) => [a.id, a]));
    const mediaByPost = new Map<string, typeof media>();
    for (const item of media) {
      const bucket = mediaByPost.get(item.postId);
      if (bucket) bucket.push(item);
      else mediaByPost.set(item.postId, [item]);
    }

    return posts.map((post) =>
      mapCommunityPost(
        post,
        authorById.get(post.authorProfileId),
        (mediaByPost.get(post.id) ?? []).map((m) => ({
          url: m.url,
          kind: m.kind,
          thumbnailUrl: m.thumbnailUrl,
          duration: m.duration,
        })),
      ),
    );
  }

  private async gaddrProfiles(
    keyword: string,
    viewerProfileId: string | null,
  ): Promise<SearchResultItem[]> {
    if (!keyword) return [];
    const [users] = await this.users.searchGlobalAsync(
      keyword,
      viewerProfileId ?? '',
      1,
      PER_SOURCE_LIMIT,
    );
    return users.map((user) =>
      mapGaddrProfile({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        userName: user.userName,
        bio: user.bio,
        profileImage: user.profileImageUrl ?? undefined,
        followersCount: user.followersCount,
        verified: user.verified,
      }),
    );
  }

  private async liveStreams(keyword: string): Promise<SearchResultItem[]> {
    const live = await this.streams.listLiveAsync(PER_SOURCE_LIMIT);
    const matching = keyword
      ? live.filter((s) =>
          `${s.title ?? ''} ${s.category ?? ''} ${(s.topics ?? []).join(' ')}`
            .toLowerCase()
            .includes(keyword.toLowerCase()),
        )
      : live;
    if (matching.length === 0) return [];

    const owners = await this.profiles.getManyByIdsAsync(
      matching.map((s) => s.profileId),
    );
    const byId = new Map(owners.map((o) => [o.id, o]));

    return matching.map((stream) =>
      mapLiveStream(
        stream,
        byId.get(stream.profileId),
        this.streamControl.playbackUrls(stream.channelKey).llHlsUrl,
      ),
    );
  }

  private async projects(keyword: string): Promise<SearchResultItem[]> {
    const rows = keyword
      ? await this.jobs.searchProjectsAsync(keyword, PER_SOURCE_LIMIT)
      : await this.jobs.recentProjectsAsync(PER_SOURCE_LIMIT);
    return rows.map(mapProject);
  }

  private async externalJobs(keyword: string): Promise<SearchResultItem[]> {
    if (!keyword) return [];
    const rows = await this.jobs.searchExternalJobsAsync(
      keyword,
      PER_SOURCE_LIMIT,
    );
    return rows.map(mapExternalJob);
  }

  private async aggregated(keyword: string): Promise<SearchResultItem[]> {
    const [streams] = await this.contentStreams
      .getEntriesAsync({
        page: 1,
        pageSize: PER_SOURCE_LIMIT,
        searchQuery: keyword || undefined,
        orderBy: 'lastRefreshed',
        order: 'DESC',
      })
      .catch(() => [[], 0] as [ContentStream[], number]);
    return streams.map(mapContentStream);
  }

  /* -------------------------------------------------------------- ranking */

  private async rankAsync(
    mode: SearchMode,
    lists: Array<{ source: string; weight: number; items: SearchResultItem[] }>,
    byId: Map<string, SearchResultItem>,
    viewerProfileId: string | null,
    seed: string,
  ): Promise<SearchResultItem[]> {
    const pool = Array.from(byId.values());

    if (mode === SearchMode.Latest) {
      // No ranking at all. That is the promise of this mode, and adding a
      // tiebreak on popularity would quietly break it.
      return pool
        .slice()
        .sort(
          (a, b) =>
            (b.publishedOn?.getTime() ?? 0) - (a.publishedOn?.getTime() ?? 0),
        )
        .map((item) => ({ ...item, reasons: [] }));
    }

    if (mode === SearchMode.Random) {
      // Deterministic per seed, so page 2 does not reshuffle page 1 — the
      // thing that makes naive `Math.random()` shuffling unusable with paging.
      return pool
        .map((item) => ({ item, key: fnv1a(`${seed}:${item.id}`) }))
        .sort((a, b) => a.key - b.key)
        .map(({ item }) => ({ ...item, reasons: [] }));
    }

    const fused = reciprocalRankFusion(
      lists.map<RankedList>((list) => ({
        source: list.source,
        ids: list.items.map((i) => i.id),
        weight: list.weight,
      })),
    );

    const maxScore = Math.max(...fused.map((f) => f.score), 1e-9);

    // Affinities only matter for For You, and loading them costs a query.
    const affinities =
      mode === SearchMode.ForYou && viewerProfileId
        ? await this.engagement.getAffinitiesAsync(viewerProfileId)
        : [];
    const viewerVector = toSparseVector(
      affinities.filter((a) => !a.isMuted).map((a) => a.topic),
      (topic) => affinities.find((a) => a.topic === topic)?.weight ?? 1,
    );
    const mutedTopics = new Set(
      affinities.filter((a) => a.isMuted).map((a) => a.topic),
    );

    const now = new Date();
    const scored: SearchResultItem[] = [];

    for (const entry of fused) {
      const item = byId.get(entry.id);
      if (!item) continue;
      if (item.topics.some((t) => mutedTopics.has(t.toLowerCase()))) continue;

      const retrieval = entry.score / maxScore;
      const reasons = Array.from(
        new Set(entry.contributions.map((c) => c.source)),
      );

      if (mode === SearchMode.All) {
        // Relevance, lightly freshened. "All" is a search result list: what
        // was asked for comes first, recency only separates near-ties.
        const freshness = item.publishedOn
          ? recencyDecay(ageInHours(item.publishedOn, now), 24 * 30)
          : 0.5;
        scored.push({
          ...item,
          score: retrieval * 0.85 + freshness * 0.15,
          reasons: reasons.slice(0, 3),
        });
        continue;
      }

      // For You: the reader's topics, the result's own traction, and a
      // deliberate lift for our own content — it is the only kind they can
      // watch, answer and follow without leaving.
      const affinity = cosineSimilarity(
        viewerVector,
        topicVector({ topics: item.topics, body: item.description }),
      );
      const traction = logSaturate(
        (item.metrics?.likes ?? 0) +
          2 * (item.metrics?.comments ?? 0) +
          (item.metrics?.views ?? 0) / 50,
        500,
      );
      const freshness = item.publishedOn
        ? recencyDecay(ageInHours(item.publishedOn, now), 24 * 7)
        : 0.4;
      const nativeLift = item.source.isNative ? 0.12 : 0;

      const forYouReasons = [...reasons];
      if (affinity > 0.3) forYouReasons.unshift('topic-match');
      if (item.source.isNative) forYouReasons.unshift('on-gaddr');

      scored.push({
        ...item,
        score:
          retrieval * 0.4 +
          affinity * 0.3 +
          traction * 0.15 +
          freshness * 0.15 +
          nativeLift,
        reasons: forYouReasons.slice(0, 3),
      });
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  /* -------------------------------------------------------------- filters */

  private applyFilters(
    items: SearchResultItem[],
    request: UnifiedSearchRequest,
  ): SearchResultItem[] {
    let result = items;
    if (request.platforms?.length) {
      const wanted = new Set(request.platforms);
      result = result.filter((i) => wanted.has(i.source.platform));
    }
    if (request.kinds?.length) {
      const wanted = new Set(request.kinds);
      result = result.filter((i) => wanted.has(i.kind));
    }
    return result;
  }

  /**
   * Per-source counts, ours first.
   *
   * Shown as filter chips, and the honest answer to "why is there nothing from
   * X" — usually "that source returned nothing", which this says out loud
   * instead of leaving the reader to guess.
   */
  private countSources(
    items: SearchResultItem[],
  ): UnifiedSearchResponse['sources'] {
    const counts = new Map<SearchSourcePlatform, number>();
    for (const item of items) {
      counts.set(
        item.source.platform,
        (counts.get(item.source.platform) ?? 0) + 1,
      );
    }
    return Array.from(counts.entries())
      .map(([platform, count]) => ({
        platform,
        label: SOURCE_LABELS[platform],
        isNative: NATIVE_PLATFORMS.has(platform),
        count,
      }))
      .sort(
        (a, b) => Number(b.isNative) - Number(a.isNative) || b.count - a.count,
      );
  }

  private countKinds(
    items: SearchResultItem[],
  ): UnifiedSearchResponse['kinds'] {
    const counts = new Map<SearchResultKind, number>();
    for (const item of items) {
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
  }
}
