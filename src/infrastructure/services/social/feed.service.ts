import { Inject, Injectable } from '@nestjs/common';
import _const from '../../../core/utils/const';
import {
  FeedPageModel,
  PostModel,
} from '../../../domain/contracts/social.model';
import {
  PostMapContext,
  emptyPostMapContext,
  mapPost,
} from '../../../domain/mappers/social.mapper';
import { Post } from '../../../domain/entities/social';
import {
  FeedMode,
  PostKind,
  PostStatus,
  Visibility,
} from '../../../domain/enums';
import {
  FeedCursor,
  ICommerceRepository,
  IEngagementRepository,
  IPostRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import {
  PUBLIC_SCOPE,
  VisibilityScope,
} from '../../../core/utils/recommendation';
import { RecommendationService } from './recommendation.service';
import { VisibilityService } from './visibility.service';

export interface FeedRequest {
  mode: FeedMode;
  viewerUserId: string | null;
  limit: number;
  before?: string | null;
  topics?: string[];
  kinds?: PostKind[];
  /** Restrict to one author — the profile timeline uses this. */
  authorProfileId?: string;
  /** Mix in what the profile's follows are posting, for a profile page. */
  includeFollowedByAuthor?: boolean;
  excludeIds?: string[];
}

/**
 * Assembles feed responses.
 *
 * The two feeds share everything except how the ids are chosen: Latest orders
 * by `publishedOn`, Recommended asks `RecommendationService`. Hydration,
 * mapping, viewer state and pagination are identical, and written once.
 *
 * That is the point of the split — the reader's choice between "show me
 * everything in order" and "show me what you think I want" should change the
 * ordering and nothing else. Same posts, same data, same controls.
 */
@Injectable()
export class FeedService {
  constructor(
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.IENGAGEMENT_REPOSITORY)
    private readonly engagement: IEngagementRepository,
    @Inject(_const.ICOMMERCE_REPOSITORY)
    private readonly commerce: ICommerceRepository,
    private readonly visibility: VisibilityService,
    private readonly recommendation: RecommendationService,
  ) {}

  public async getFeedAsync(request: FeedRequest): Promise<FeedPageModel> {
    const viewer = request.viewerUserId
      ? await this.profiles.getByUserIdAsync(request.viewerUserId)
      : null;
    const viewerProfileId = viewer?.id ?? null;

    const resolved =
      await this.visibility.resolveFeedLevelsAsync(viewerProfileId);
    const scope = await this.buildScopeAsync(viewerProfileId, resolved);

    const limit = Math.min(Math.max(request.limit, 1), 50);

    let posts: Post[];
    let reasonsById: Map<string, string[]> | undefined;

    if (request.mode === FeedMode.Recommended && !request.authorProfileId) {
      const ranked = await this.recommendation.recommendPostsAsync({
        viewerProfileId,
        scope,
        limit,
        preferences: viewer ? await this.loadPreferencesAsync(viewer.id) : null,
        excludeIds: request.excludeIds,
      });
      posts = ranked.map((r) => r.post);
      reasonsById = new Map(ranked.map((r) => [r.post.id, r.reasons]));

      // A brand-new instance with no engagement history can rank nothing.
      // Falling through to chronological is better than an empty screen.
      if (posts.length === 0) {
        posts = await this.posts.getFeedPageAsync({
          mode: FeedMode.Latest,
          viewerProfileId,
          scope,
          limit,
          before: request.before,
          topics: request.topics,
          kinds: request.kinds,
        });
      }
    } else {
      const authorProfileIds = await this.resolveTimelineAuthorsAsync(request);
      posts = await this.posts.getFeedPageAsync({
        mode: FeedMode.Latest,
        viewerProfileId,
        scope,
        limit,
        before: request.before,
        topics: request.topics,
        kinds: request.kinds,
        authorProfileIds,
      });
    }

    const items = await this.mapPostsAsync(posts, {
      viewerProfileId,
      followingProfileIds: resolved.followingProfileIds,
      reasonsById,
    });

    const last = posts[posts.length - 1];
    return {
      mode: request.mode,
      items,
      nextCursor:
        posts.length === limit && last
          ? (last.publishedOn ?? last.createdOn).toISOString()
          : null,
      hasMore: posts.length === limit,
    };
  }

  /**
   * A profile page mixes the profile's own posts with those of the profiles it
   * follows, when asked. `authorProfileIds = undefined` means "no author
   * filter", which is what the global feed wants — so the two cases must not
   * collapse into an empty array.
   */
  private async resolveTimelineAuthorsAsync(
    request: FeedRequest,
  ): Promise<string[] | undefined> {
    if (!request.authorProfileId) return undefined;
    if (!request.includeFollowedByAuthor) return [request.authorProfileId];

    const owner = await this.profiles.getByIdAsync(request.authorProfileId);
    if (!owner) return [request.authorProfileId];

    const followed = await this.visibility.resolveFeedLevelsAsync(owner.id);
    return Array.from(
      new Set([request.authorProfileId, ...followed.followingProfileIds]),
    );
  }

  private async buildScopeAsync(
    viewerProfileId: string | null,
    resolved: Awaited<ReturnType<VisibilityService['resolveFeedLevelsAsync']>>,
  ): Promise<VisibilityScope> {
    if (!viewerProfileId) return { ...PUBLIC_SCOPE };

    const granted =
      await this.engagement.listAudiencesForMemberAsync(viewerProfileId);
    return {
      viewerProfileId,
      followingProfileIds: resolved.followingProfileIds,
      closeFriendOfProfileIds: granted
        .filter((g) => g.audience === Visibility.CloseFriends)
        .map((g) => g.ownerProfileId),
      brandPartnerOfProfileIds: granted
        .filter((g) => g.audience === Visibility.BrandPartners)
        .map((g) => g.ownerProfileId),
      excludedProfileIds: Array.from(
        new Set([...resolved.blockedProfileIds, ...resolved.mutedProfileIds]),
      ),
    };
  }

  /** Public helper — other services need the same scope. */
  public async resolveScopeAsync(viewerUserId: string | null): Promise<{
    scope: VisibilityScope;
    viewerProfileId: string | null;
    followingProfileIds: string[];
  }> {
    const viewer = viewerUserId
      ? await this.profiles.getByUserIdAsync(viewerUserId)
      : null;
    const resolved = await this.visibility.resolveFeedLevelsAsync(
      viewer?.id ?? null,
    );
    return {
      scope: await this.buildScopeAsync(viewer?.id ?? null, resolved),
      viewerProfileId: viewer?.id ?? null,
      followingProfileIds: resolved.followingProfileIds,
    };
  }

  /**
   * Hydrate and map a page of posts.
   *
   * Six queries regardless of page size — authors, media, poll options,
   * product tags, viewer reactions, viewer votes — instead of six per post.
   * Every list endpoint goes through here so none of them can regress into an
   * N+1 on its own.
   */
  public async mapPostsAsync(
    posts: Post[],
    input: {
      viewerProfileId: string | null;
      followingProfileIds: string[];
      reasonsById?: Map<string, string[]>;
    },
  ): Promise<PostModel[]> {
    if (posts.length === 0) return [];

    const postIds = posts.map((p) => p.id);
    const repostTargetIds = posts
      .map((p) => p.repostOfId)
      .filter((id): id is string => Boolean(id));

    const [media, pollOptions, productTags, reposted] = await Promise.all([
      this.posts.getMediaForPostsAsync(postIds),
      this.posts.getPollOptionsForPostsAsync(postIds),
      this.posts.getProductTagsForPostsAsync(postIds),
      repostTargetIds.length > 0
        ? this.posts.getManyByIdsAsync(repostTargetIds)
        : Promise.resolve([]),
    ]);

    const allPosts = [...posts, ...reposted];
    const allPostIds = allPosts.map((p) => p.id);

    const profileIds = new Set<string>();
    for (const post of allPosts) {
      profileIds.add(post.authorProfileId);
      if (post.sponsorProfileId) profileIds.add(post.sponsorProfileId);
      for (const id of post.mentionedProfileIds ?? []) profileIds.add(id);
    }

    const [authors, repostedMedia, products, reactions, votes] =
      await Promise.all([
        this.profiles.getManyByIdsAsync(Array.from(profileIds)),
        reposted.length > 0
          ? this.posts.getMediaForPostsAsync(reposted.map((p) => p.id))
          : Promise.resolve([]),
        productTags.length > 0
          ? this.commerce.getProductsAsync(
              Array.from(new Set(productTags.map((t) => t.productId))),
            )
          : Promise.resolve([]),
        input.viewerProfileId
          ? this.engagement.getReactionsForPostsAsync(
              allPostIds,
              input.viewerProfileId,
            )
          : Promise.resolve([]),
        input.viewerProfileId
          ? this.engagement.getPollVotesForPostsAsync(
              allPostIds,
              input.viewerProfileId,
            )
          : Promise.resolve([]),
      ]);

    const context: PostMapContext = {
      ...emptyPostMapContext(input.viewerProfileId),
      authors: new Map(authors.map((a) => [a.id, a])),
      media: groupBy([...media, ...repostedMedia], (m) => m.postId),
      pollOptions: groupBy(pollOptions, (o) => o.postId),
      productTags: groupBy(productTags, (t) => t.postId),
      products: new Map(products.map((p) => [p.id, p])),
      viewerReactions: new Map(reactions.map((r) => [r.postId, r])),
      viewerPollVotes: new Map(votes.map((v) => [v.postId, v])),
      followingProfileIds: new Set(input.followingProfileIds),
      reasonsById: input.reasonsById,
      repostTargets: new Map(reposted.map((p) => [p.id, p])),
    };

    return posts.map((post) => mapPost(post, context));
  }

  /** A single post, with the same hydration as a feed page. */
  public async mapPostAsync(
    post: Post,
    viewerUserId: string | null,
  ): Promise<PostModel> {
    const resolved = await this.resolveScopeAsync(viewerUserId);
    const [model] = await this.mapPostsAsync([post], {
      viewerProfileId: resolved.viewerProfileId,
      followingProfileIds: resolved.followingProfileIds,
    });
    return model;
  }

  public async getRepliesAsync(
    parentId: string,
    viewerUserId: string | null,
    cursor: FeedCursor,
  ): Promise<PostModel[]> {
    const resolved = await this.resolveScopeAsync(viewerUserId);
    const replies = await this.posts.getRepliesAsync(
      parentId,
      resolved.scope,
      cursor,
    );
    return this.mapPostsAsync(replies, {
      viewerProfileId: resolved.viewerProfileId,
      followingProfileIds: resolved.followingProfileIds,
    });
  }

  /** The caller's drafts, mapped like any other list of posts. */
  public async getDraftsAsync(
    viewerUserId: string,
    cursor: FeedCursor,
  ): Promise<PostModel[]> {
    const resolved = await this.resolveScopeAsync(viewerUserId);
    if (!resolved.viewerProfileId) return [];

    const drafts = await this.posts.getDraftsAsync(
      resolved.viewerProfileId,
      cursor,
    );
    return this.mapPostsAsync(drafts, {
      viewerProfileId: resolved.viewerProfileId,
      followingProfileIds: resolved.followingProfileIds,
    });
  }

  /**
   * The content calendar.
   *
   * A view over `posts`, not a second store — a calendar that keeps its own
   * copy of what is scheduled is a calendar that will disagree with what
   * actually publishes.
   */
  public async getCalendarAsync(input: {
    viewerUserId: string;
    from: Date;
    to: Date;
    statuses: PostStatus[];
  }): Promise<Post[]> {
    const resolved = await this.resolveScopeAsync(input.viewerUserId);
    if (!resolved.viewerProfileId) return [];
    return this.posts.getCalendarAsync(
      resolved.viewerProfileId,
      input.from,
      input.to,
      input.statuses,
    );
  }

  /**
   * Feed preferences live on the profile's `creatorProfile` JSONB today rather
   * than in their own table — they are a single small document read only by
   * their owner. `resolveFeedPreferences` clamps whatever comes back, so a
   * malformed document degrades to the defaults instead of breaking the feed.
   */
  private async loadPreferencesAsync(profileId: string): Promise<unknown> {
    const profile = await this.profiles.getByIdAsync(profileId);
    const stored = (profile?.creatorProfile ?? null) as Record<
      string,
      unknown
    > | null;
    return stored?.feedPreferences ?? null;
  }
}

/** Group a flat list into a map by key. Used by every batch hydration. */
export function groupBy<T>(
  items: T[],
  keyOf: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
