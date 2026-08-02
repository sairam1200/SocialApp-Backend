import { Inject, Injectable } from '@nestjs/common';
import _const from '../../../core/utils/const';
import {
  PostModel,
  ProfileSummaryModel,
} from '../../../domain/contracts/social.model';
import { mapProfileSummary } from '../../../domain/mappers/social.mapper';
import { ProfileKind, RecommendableKind } from '../../../domain/enums';
import {
  ICommerceRepository,
  ILearningRepository,
  IPostRepository,
  ISocialProfileRepository,
  IStreamRepository,
} from '../../../domain/repositories/isocial.repository';
import { FeedService } from './feed.service';
import { RecommendationService } from './recommendation.service';

export interface ExploreResult {
  posts: PostModel[];
  people: ProfileSummaryModel[];
  brands: ProfileSummaryModel[];
  products: Array<{
    id: string;
    title: string;
    priceMinor?: string;
    currency: string;
    imageUrl?: string;
    profileId: string;
  }>;
  courses: Array<{
    id: string;
    slug: string;
    title: string;
    summary?: string;
    coverUrl?: string;
    level: string;
  }>;
  live: Array<{
    id: string;
    channelKey: string;
    title?: string;
    viewersCount: number;
    profileId: string;
  }>;
  topics: Array<{ topic: string; count: number }>;
}

/**
 * Explore and search across everything in Community.
 *
 * One request, five result types, run concurrently — a search box that returns
 * people and then makes you switch tabs to look for a post is a search box
 * people stop using.
 *
 * With no query this is the Explore surface, which uses the recommender rather
 * than a second "what's popular" implementation.
 */
@Injectable()
export class ExploreService {
  constructor(
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.ICOMMERCE_REPOSITORY)
    private readonly commerce: ICommerceRepository,
    @Inject(_const.ILEARNING_REPOSITORY)
    private readonly learning: ILearningRepository,
    @Inject(_const.ISTREAM_REPOSITORY)
    private readonly streams: IStreamRepository,
    private readonly feed: FeedService,
    private readonly recommendation: RecommendationService,
  ) {}

  public async searchAsync(input: {
    query: string;
    viewerUserId: string | null;
    limit?: number;
  }): Promise<ExploreResult> {
    const limit = Math.min(Math.max(input.limit ?? 12, 1), 40);
    const term = (input.query ?? '').trim();
    const resolved = await this.feed.resolveScopeAsync(input.viewerUserId);

    if (!term) return this.exploreAsync(input.viewerUserId, limit);

    const [postRows, people, brands, products, courses, live] =
      await Promise.all([
        this.posts.searchAsync(term, resolved.scope, limit),
        this.profiles.searchAsync(term, limit, [
          ProfileKind.Person,
          ProfileKind.Creator,
        ]),
        this.profiles.searchAsync(term, limit, [ProfileKind.Brand]),
        this.commerce.searchProductsAsync(term, limit),
        this.learning.listCoursesAsync({ publishedOnly: true }, 50),
        this.streams.listLiveAsync(limit),
      ]);

    const lowered = term.toLowerCase();
    return {
      posts: await this.feed.mapPostsAsync(postRows, {
        viewerProfileId: resolved.viewerProfileId,
        followingProfileIds: resolved.followingProfileIds,
      }),
      people: people.map((p) => mapProfileSummary(p)),
      brands: brands.map((p) => mapProfileSummary(p)),
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        priceMinor: p.priceMinor ?? undefined,
        currency: p.currency,
        imageUrl: p.imageUrl,
        profileId: p.profileId,
      })),
      // Course search is in-memory: the catalogue is small and bounded, and a
      // trigram index on a table of dozens buys nothing. Revisit past ~1000.
      courses: courses
        .filter(
          (c) =>
            c.title.toLowerCase().includes(lowered) ||
            (c.summary ?? '').toLowerCase().includes(lowered) ||
            c.topics.some((t) => t.includes(lowered)),
        )
        .slice(0, limit)
        .map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          summary: c.summary,
          coverUrl: c.coverUrl,
          level: c.level,
        })),
      live: live
        .filter((s) => (s.title ?? '').toLowerCase().includes(lowered))
        .map((s) => ({
          id: s.id,
          channelKey: s.channelKey,
          title: s.title,
          viewersCount: s.viewersCount,
          profileId: s.profileId,
        })),
      topics: this.topTopics(postRows.flatMap((p) => p.topics)),
    };
  }

  /**
   * Explore with no query.
   *
   * Uses the recommender for people, brands and products so the discovery
   * surface and the feed agree about what is good — two different notions of
   * "worth seeing" is how a product ends up feeling incoherent.
   */
  public async exploreAsync(
    viewerUserId: string | null,
    limit = 12,
  ): Promise<ExploreResult> {
    const resolved = await this.feed.resolveScopeAsync(viewerUserId);
    const viewerProfile = resolved.viewerProfileId
      ? await this.profiles.getByIdAsync(resolved.viewerProfileId)
      : null;
    const topics = viewerProfile?.topics ?? [];

    const [trendingIds, peopleRec, brandRec, productRec, courses, live] =
      await Promise.all([
        this.posts.getTrendingCandidateIdsAsync(48, limit * 2),
        this.recommendation.recommendEntitiesAsync({
          kind: RecommendableKind.Creator,
          viewerProfileId: resolved.viewerProfileId,
          topics,
          excludeIds: [
            ...resolved.followingProfileIds,
            ...(resolved.viewerProfileId ? [resolved.viewerProfileId] : []),
          ],
          limit,
        }),
        this.recommendation.recommendEntitiesAsync({
          kind: RecommendableKind.Brand,
          viewerProfileId: resolved.viewerProfileId,
          topics,
          excludeIds: resolved.followingProfileIds,
          limit,
        }),
        this.recommendation.recommendEntitiesAsync({
          kind: RecommendableKind.Product,
          viewerProfileId: resolved.viewerProfileId,
          topics,
          limit,
        }),
        this.learning.listCoursesAsync({ topics, publishedOnly: true }, limit),
        this.streams.listLiveAsync(limit),
      ]);

    const trendingPosts = await this.posts.getManyByIdsAsync(
      trendingIds.slice(0, limit),
    );
    const [people, brands, products] = await Promise.all([
      this.profiles.getManyByIdsAsync(peopleRec.map((r) => r.id)),
      this.profiles.getManyByIdsAsync(brandRec.map((r) => r.id)),
      this.commerce.getProductsAsync(productRec.map((r) => r.id)),
    ]);

    return {
      posts: await this.feed.mapPostsAsync(trendingPosts, {
        viewerProfileId: resolved.viewerProfileId,
        followingProfileIds: resolved.followingProfileIds,
      }),
      people: people.map((p) => mapProfileSummary(p)),
      brands: brands.map((p) => mapProfileSummary(p)),
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        priceMinor: p.priceMinor ?? undefined,
        currency: p.currency,
        imageUrl: p.imageUrl,
        profileId: p.profileId,
      })),
      courses: courses.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        summary: c.summary,
        coverUrl: c.coverUrl,
        level: c.level,
      })),
      live: live.map((s) => ({
        id: s.id,
        channelKey: s.channelKey,
        title: s.title,
        viewersCount: s.viewersCount,
        profileId: s.profileId,
      })),
      topics: this.topTopics(trendingPosts.flatMap((p) => p.topics)),
    };
  }

  private topTopics(
    topics: string[],
    limit = 12,
  ): Array<{ topic: string; count: number }> {
    const counts = new Map<string, number>();
    for (const topic of topics) {
      if (!topic) continue;
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([topic, count]) => ({ topic, count }));
  }
}
