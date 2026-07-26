import { Inject, Injectable } from '@nestjs/common';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import {
  CandidateFeatures,
  DEFAULT_FEED_PREFERENCES,
  FeedPreferences,
  RankedList,
  ScoredCandidate,
  SparseVector,
  VisibilityScope,
  blendSponsored,
  cosineSimilarity,
  diversify,
  explain,
  reciprocalRankFusion,
  resolveFeedPreferences,
  scoreCandidate,
  topicVector,
  toSparseVector,
} from '../../../core/utils/recommendation';
import { Post, SocialProfile } from '../../../domain/entities/social';
import { RecommendableKind } from '../../../domain/enums';
import {
  ICommerceRepository,
  IEngagementRepository,
  IPostRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';

/** How far back each candidate source looks. Tuned per source, not globally. */
const LOOKBACK_HOURS = {
  inNetwork: 24 * 14,
  topic: 24 * 7,
  trending: 48,
  fresh: 12,
  coEngagement: 24 * 7,
} as const;

/** Candidates pulled per source before fusion. */
const PER_SOURCE_LIMIT = 120;

export interface RecommendationRequest {
  viewerProfileId: string | null;
  scope: VisibilityScope;
  limit: number;
  preferences?: Partial<FeedPreferences> | null;
  /** Exclude ids the client already has, so infinite scroll does not repeat. */
  excludeIds?: string[];
}

export interface RankedPost {
  post: Post;
  score: number;
  /** Short machine-readable reasons — `followed`, `topic-match`, `trending`. */
  reasons: string[];
}

/**
 * The recommender.
 *
 * A two-stage pipeline, the same shape every large feed converged on:
 *
 *   1. **Retrieve** — several cheap, independent sources each produce a ranked
 *      list of ids. None of them is smart; together they cover in-network,
 *      topical, collaborative, trending and exploratory supply.
 *   2. **Fuse** — Reciprocal Rank Fusion merges the lists on *rank*, so
 *      sources with incomparable scores can be combined without calibration.
 *   3. **Rank** — a multi-objective scorer predicts each engagement type and
 *      takes a weighted sum, with recency and exploration applied on top.
 *   4. **Diversify** — MMR plus a hard per-author cap.
 *   5. **Blend** — sponsored posts inserted at a fixed cadence, never ranked in.
 *
 * Every stage is the reader's to adjust. `preferences.sources` are the fusion
 * weights, `preferences.objectives` the ranking weights, and setting all
 * sources but `following` to zero produces a pure following feed. The user
 * stays in control of the algorithm because the algorithm is made of numbers
 * they own.
 *
 * The same pipeline serves creators, brands and products — see
 * `recommendEntitiesAsync`. One engine, four surfaces.
 */
@Injectable()
export class RecommendationService {
  constructor(
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(_const.IENGAGEMENT_REPOSITORY)
    private readonly engagement: IEngagementRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.ICOMMERCE_REPOSITORY)
    private readonly commerce: ICommerceRepository,
  ) {}

  /**
   * The For You feed.
   *
   * A failing source degrades to fewer candidates, never to an error — the
   * feed is the product, and half a feed beats a 500. `Promise.allSettled`
   * rather than `Promise.all` is what makes that true.
   */
  public async recommendPostsAsync(
    request: RecommendationRequest,
  ): Promise<RankedPost[]> {
    const preferences = resolveFeedPreferences(request.preferences);
    const viewerProfileId = request.viewerProfileId;

    const affinities = viewerProfileId
      ? await this.engagement.getAffinitiesAsync(viewerProfileId)
      : [];
    const viewerTopics = affinities
      .filter((a) => !a.isMuted && a.weight > 0)
      .slice(0, 25)
      .map((a) => a.topic);
    const mutedTopics = new Set([
      ...preferences.mutedTopics,
      ...affinities.filter((a) => a.isMuted).map((a) => a.topic),
    ]);
    const viewerVector = toSparseVector(
      affinities.filter((a) => !a.isMuted).map((a) => a.topic),
      (topic) => affinities.find((a) => a.topic === topic)?.weight ?? 1,
    );

    const following = request.scope.followingProfileIds;
    const weights = preferences.sources;

    const sources = await this.retrieveAsync({
      viewerProfileId,
      scope: request.scope,
      following,
      viewerTopics,
      weights,
      includeOutOfNetwork: preferences.includeOutOfNetwork,
    });

    const fused = reciprocalRankFusion(sources);
    if (fused.length === 0) return [];

    const excluded = new Set(request.excludeIds ?? []);
    const candidateIds = fused
      .filter((c) => !excluded.has(c.id))
      // Rank ~6× the requested page so diversification has room to reject.
      .slice(0, Math.max(request.limit * 6, 60))
      .map((c) => c.id);

    const [candidates, authors] = await this.hydrateAsync(candidateIds);
    if (candidates.length === 0) return [];

    const maxFusedScore = Math.max(...fused.map((c) => c.score), 1e-9);
    const now = new Date();
    const contributionsById = new Map(
      fused.map((c) => [c.id, c.contributions]),
    );

    const scored: Array<ScoredCandidate & { post: Post; reasons: string[] }> =
      [];

    for (const post of candidates) {
      if (post.topics.some((t) => mutedTopics.has(t.toLowerCase()))) continue;

      const author = authors.get(post.authorProfileId);
      const postVector = topicVector({
        topics: post.topics,
        tags: post.tags,
        body: post.body,
      });

      const features: CandidateFeatures = {
        id: post.id,
        authorId: post.authorProfileId,
        publishedOn: post.publishedOn ?? post.createdOn,
        impressions: post.impressionsCount,
        likes: post.likesCount,
        comments: post.commentsCount,
        reposts: post.repostsCount,
        shares: post.sharesCount,
        clicks: post.clicksCount,
        topicAffinity: cosineSimilarity(viewerVector, postVector),
        isFollowed: following.includes(post.authorProfileId) ? 1 : 0,
        authorAffinity: this.authorAffinity(author, viewerTopics),
        authorQuality: author?.authorQuality ?? 0.5,
        retrievalScore:
          (fused.find((c) => c.id === post.id)?.score ?? 0) / maxFusedScore,
        hasMedia: post.kind === 'photo' || post.kind === 'video' ? 1 : 0,
        isSponsored: post.isSponsored ? 1 : 0,
        isDownranked: 0,
      };

      const result = scoreCandidate(features, preferences, now);
      scored.push({
        ...result,
        post,
        reasons: explain(features, contributionsById.get(post.id) ?? []),
      });
    }

    const organic = scored.filter((s) => !s.post.isSponsored);
    const sponsored = scored.filter((s) => s.post.isSponsored);

    const diversified = diversify(
      organic.map((s) => ({
        id: s.id,
        score: s.score,
        vector: topicVector({
          topics: s.post.topics,
          tags: s.post.tags,
          body: s.post.body,
        }),
        groupId: s.post.authorProfileId,
      })),
      {
        lambda: preferences.diversityLambda,
        limit: request.limit,
        maxPerGroup: preferences.maxPostsPerAuthor,
      },
    );

    const byId = new Map(scored.map((s) => [s.id, s]));
    const organicRanked = diversified
      .map((d) => byId.get(d.id))
      .filter((s): s is (typeof scored)[number] => Boolean(s));

    const blended = blendSponsored(
      organicRanked,
      sponsored.sort((a, b) => b.score - a.score).slice(0, 4),
      preferences.sponsoredEveryN,
    );

    return blended.map((s) => ({
      post: s.post,
      score: s.score,
      reasons: s.reasons,
    }));
  }

  /**
   * Run every candidate source concurrently, tolerating individual failures.
   *
   * Weight 0 skips a source entirely rather than fetching and discarding — the
   * reader turning a source off should cost the database nothing.
   */
  private async retrieveAsync(input: {
    viewerProfileId: string | null;
    scope: VisibilityScope;
    following: string[];
    viewerTopics: string[];
    weights: FeedPreferences['sources'];
    includeOutOfNetwork: boolean;
  }): Promise<RankedList[]> {
    const { weights, includeOutOfNetwork } = input;
    const jobs: Array<{
      source: string;
      weight: number;
      run: () => Promise<string[]>;
    }> = [];

    if (weights.following > 0 && input.following.length > 0) {
      jobs.push({
        source: 'following',
        weight: weights.following,
        run: () =>
          this.posts.getInNetworkCandidateIdsAsync(
            input.following,
            input.scope,
            LOOKBACK_HOURS.inNetwork,
            PER_SOURCE_LIMIT,
          ),
      });
    }

    if (includeOutOfNetwork) {
      if (weights.topicAffinity > 0 && input.viewerTopics.length > 0) {
        jobs.push({
          source: 'topic-match',
          weight: weights.topicAffinity,
          run: () =>
            this.posts.getTopicCandidateIdsAsync(
              input.viewerTopics,
              LOOKBACK_HOURS.topic,
              PER_SOURCE_LIMIT,
            ),
        });
      }
      if (weights.coEngagement > 0 && input.viewerProfileId) {
        jobs.push({
          source: 'similar-readers',
          weight: weights.coEngagement,
          run: () =>
            this.posts.getCoEngagementCandidateIdsAsync(
              input.viewerProfileId as string,
              LOOKBACK_HOURS.coEngagement,
              PER_SOURCE_LIMIT,
            ),
        });
      }
      if (weights.trending > 0) {
        jobs.push({
          source: 'trending',
          weight: weights.trending,
          run: () =>
            this.posts.getTrendingCandidateIdsAsync(
              LOOKBACK_HOURS.trending,
              PER_SOURCE_LIMIT,
            ),
        });
      }
      if (weights.fresh > 0) {
        jobs.push({
          source: 'fresh',
          weight: weights.fresh,
          run: () =>
            this.posts.getFreshCandidateIdsAsync(
              LOOKBACK_HOURS.fresh,
              PER_SOURCE_LIMIT,
            ),
        });
      }
    }

    // A reader who follows nobody and has no history would otherwise get an
    // empty feed on their first visit. Trending is the honest fallback.
    if (jobs.length === 0) {
      jobs.push({
        source: 'trending',
        weight: 1,
        run: () =>
          this.posts.getTrendingCandidateIdsAsync(
            LOOKBACK_HOURS.trending,
            PER_SOURCE_LIMIT,
          ),
      });
    }

    const settled = await Promise.allSettled(jobs.map((j) => j.run()));

    const lists: RankedList[] = [];
    settled.forEach((result, index) => {
      const job = jobs[index];
      if (result.status === 'fulfilled') {
        lists.push({
          source: job.source,
          ids: result.value,
          weight: job.weight,
        });
        return;
      }
      logger.warn(
        `[recommendation] candidate source "${job.source}" failed; continuing without it`,
        result.reason,
      );
    });
    return lists;
  }

  /** Posts plus their authors, in two queries rather than 2N. */
  private async hydrateAsync(
    ids: string[],
  ): Promise<[Post[], Map<string, SocialProfile>]> {
    if (ids.length === 0) return [[], new Map()];
    const posts = await this.posts.getManyByIdsAsync(ids);
    const authors = await this.profiles.getManyByIdsAsync(
      Array.from(new Set(posts.map((p) => p.authorProfileId))),
    );
    return [posts, new Map(authors.map((a) => [a.id, a]))];
  }

  private authorAffinity(
    author: SocialProfile | undefined,
    viewerTopics: string[],
  ): number {
    if (!author || viewerTopics.length === 0) return 0;
    const overlap = author.topics.filter((t) =>
      viewerTopics.includes(t.toLowerCase()),
    ).length;
    return Math.min(1, overlap / Math.max(3, viewerTopics.length));
  }

  /**
   * Recommend creators, brands, products or courses.
   *
   * Same fusion and diversification, different retrieval — which is the whole
   * argument for keeping the pipeline generic. The brand↔creator matcher in
   * `creatorMatching.service.ts` is this function with the roles swapped.
   */
  public async recommendEntitiesAsync(input: {
    kind: RecommendableKind;
    viewerProfileId: string | null;
    topics: string[];
    excludeIds?: string[];
    limit: number;
  }): Promise<Array<{ id: string; score: number; reasons: string[] }>> {
    const exclude = new Set(input.excludeIds ?? []);
    const lists: RankedList[] = [];

    if (
      input.kind === RecommendableKind.Creator ||
      input.kind === RecommendableKind.Brand
    ) {
      const suggestions = await this.profiles.getSuggestionsAsync(
        Array.from(exclude),
        input.topics,
        100,
      );
      lists.push({
        source: 'topic-match',
        ids: suggestions
          .filter((p) =>
            input.kind === RecommendableKind.Brand
              ? p.kind === 'brand'
              : p.kind !== 'brand',
          )
          .map((p) => p.id),
        weight: 1,
      });
      lists.push({
        source: 'popular',
        ids: [...suggestions]
          .sort((a, b) => b.followersCount - a.followersCount)
          .map((p) => p.id),
        weight: 0.5,
      });
    } else if (input.kind === RecommendableKind.Product) {
      lists.push({
        source: 'topic-match',
        ids: await this.commerce.getProductCandidateIdsAsync(input.topics, 100),
        weight: 1,
      });
    }

    return reciprocalRankFusion(lists)
      .filter((c) => !exclude.has(c.id))
      .slice(0, input.limit)
      .map((c) => ({
        id: c.id,
        score: c.score,
        reasons: Array.from(
          new Set(c.contributions.map((x) => x.source)),
        ).slice(0, 3),
      }));
  }

  /** Defaults, exposed so the settings screen can show what "off" means. */
  public getDefaultPreferences(): FeedPreferences {
    return { ...DEFAULT_FEED_PREFERENCES, mutedTopics: [] };
  }

  /** Cosine between two topic sets. Used by the brand↔creator matcher. */
  public similarity(a: SparseVector, b: SparseVector): number {
    return cosineSimilarity(a, b);
  }
}
