import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IUserContentRepository } from '../../domain/repositories/iuserContent.repository';
import { DiscoverContentModel } from '../../domain/contracts/discover-content.model';
import { UserContent } from '../../domain/entities';
import { mapToYouTubeContentModel } from '../../domain/mappers/youtube.mapper';
import { mapToInstagramContentModel } from '../../domain/mappers/instagram.mapper';
import { mapUserContentToFacebookOnlineModel } from '../../domain/mappers/facebook.mapper';
import { mapToTikTokContentModel } from '../../domain/mappers/tiktok.mapper';
import { mapToUserTweetModel } from '../../domain/mappers/twitter.mapper';
import { mapToLinkedInContentModel } from '../../domain/mappers/linkedin.mapper';
import { mapToPinterestContentModel } from '../../domain/mappers/pinterest.mapper';
import { mapToThreadsContentModel } from '../../domain/mappers/threads.mapper';
import { mapToSpotifyContentModel } from '../../domain/mappers/spotify.mapper';
import { mapToRedditContentModel } from '../../domain/mappers/reddit.mapper';
import { mapToSnapchatContentModel } from '../../domain/mappers/snapchat.mapper';
import { mapToBehanceContentModel } from '../../domain/mappers/behance.mapper';
import _const from '../../core/utils/const';
import redis from '../../core/utils/redis.util';
import logger from '../../core/utils/winston.util';

export class DiscoverFeedQuery {
  cursor?: string;
  limit = 20;
  userId?: string;

  constructor(request: Partial<DiscoverFeedQuery> = {}) {
    Object.assign(this, request);
  }
}

const validateDiscoverFeedQuery = Joi.object<DiscoverFeedQuery>({
  cursor: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(50).default(20),
  userId: Joi.string().uuid().optional(),
});

const DISCOVER_FEED_CACHE_TTL = 30;

@CommandHandler(DiscoverFeedQuery)
export class DiscoverFeedQueryHandler
  implements
    ICommandHandler<
      DiscoverFeedQuery,
      {
        contents: DiscoverContentModel[];
        nextCursor: string | null;
        hasMore: boolean;
      }
    >
{
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  async execute(query: DiscoverFeedQuery): Promise<{
    contents: DiscoverContentModel[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    await validateDiscoverFeedQuery.validateAsync(query);

    const cacheKey = this.buildCacheKey(query);
    if (cacheKey) {
      try {
        const cached = await redis.getFromRedisAsync<{
          contents: DiscoverContentModel[];
          nextCursor: string | null;
          hasMore: boolean;
        }>(cacheKey);
        if (cached) return cached;
      } catch (err) {
        logger.warn(`Discover feed Redis read failed: ${err}`);
      }
    }

    const [items, nextCursor] =
      await this.userContentRepository.getDiscoverFeedAsync(
        query.cursor,
        query.limit,
        query.userId,
      );

    const contents = items.map((item) => this.toModel(item));

    const result = {
      contents,
      nextCursor,
      hasMore: nextCursor !== null,
    };

    if (cacheKey) {
      try {
        await redis.storeInRedisAsync(
          cacheKey,
          result as unknown as object,
          DISCOVER_FEED_CACHE_TTL,
        );
      } catch (err) {
        logger.warn(`Discover feed Redis write failed: ${err}`);
      }
    }

    return result;
  }

  private buildCacheKey(query: DiscoverFeedQuery): string | null {
    if (query.cursor || query.userId) return null;
    return redis.getRedisKey('discover:feed:v1', 'all');
  }

  private commonFields(uc: UserContent): Partial<DiscoverContentModel> {
    const firstName = uc.user?.firstName ?? '';
    const lastName = uc.user?.lastName ?? '';
    const userName = uc.user?.userName ?? '';
    return {
      id: uc.id,
      userId: uc.userId,
      userName: `${firstName} ${lastName}`.trim() || userName,
      userHandle: userName ? `@${userName}` : '',
      userProfileImage: uc.user?.biometrics?.profileImageUrl ?? null,
      platform: uc.platform,
      type: uc.type,
      title: uc.title,
      sourceUrl: uc.sourceUrl ?? null,
    };
  }

  private toModel(item: UserContent): DiscoverContentModel {
    switch (item.platform) {
      case 'youtube':
        return this.fromYouTube(item);
      case 'instagram':
        return this.fromInstagram(item);
      case 'facebook':
        return this.fromFacebook(item);
      case 'tiktok':
        return this.fromTikTok(item);
      case 'twitter':
        return this.fromTwitter(item);
      case 'linkedin':
        return this.fromLinkedIn(item);
      case 'pinterest':
        return this.fromPinterest(item);
      case 'threads':
        return this.fromThreads(item);
      case 'spotify':
        return this.fromSpotify(item);
      case 'reddit':
        return this.fromReddit(item);
      case 'snapchat':
        return this.fromSnapchat(item);
      case 'behance':
        return this.fromBehance(item);
      default:
        return this.fromUnknown(item);
    }
  }

  private fromYouTube(uc: UserContent): DiscoverContentModel {
    const m = mapToYouTubeContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.description ?? null,
      imageUrl: m.thumbnailUrl ?? null,
      publishedAt: m.publishedAt ? new Date(m.publishedAt) : null,
      views: m.viewCount ?? null,
      likes: m.likeCount ?? null,
      comments: m.commentCount ?? null,
    });
  }

  private fromInstagram(uc: UserContent): DiscoverContentModel {
    const m = mapToInstagramContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.caption ?? null,
      imageUrl: m.thumbnailUrl ?? m.mediaUrl ?? null,
      publishedAt: m.timestamp ? new Date(m.timestamp) : null,
      views: null,
      likes: m.likeCount ?? null,
      comments: m.commentsCount ?? null,
    });
  }

  private fromFacebook(uc: UserContent): DiscoverContentModel {
    const m = mapUserContentToFacebookOnlineModel(uc);
    const reactions = typeof m.reactions === 'number' ? m.reactions : null;
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.description ?? m.message ?? null,
      imageUrl: m.picture ?? null,
      publishedAt: m.createdAt ? new Date(m.createdAt) : null,
      views: null,
      likes: reactions,
      comments: m.commentCount ?? null,
    });
  }

  private fromTikTok(uc: UserContent): DiscoverContentModel {
    const m = mapToTikTokContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.caption ?? null,
      imageUrl: m.thumbnailUrl ?? null,
      publishedAt: m.createdAt ?? null,
      views: m.stats?.views ?? null,
      likes: m.stats?.likes ?? null,
      comments: m.stats?.comments ?? null,
    });
  }

  private fromTwitter(uc: UserContent): DiscoverContentModel {
    const m = mapToUserTweetModel(uc) as any;
    const mediaArray = Array.isArray(m.media) ? m.media : [];
    const firstMedia = mediaArray[0];
    const pubMetrics = m.publicMetrics || {};
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.tweet ?? null,
      imageUrl: firstMedia?.thumbnail ?? firstMedia?.url ?? null,
      publishedAt: m.createdAt ? new Date(m.createdAt) : null,
      views: pubMetrics.impressions ?? null,
      likes: pubMetrics.likes ?? null,
      comments: pubMetrics.replies ?? null,
    });
  }

  private fromLinkedIn(uc: UserContent): DiscoverContentModel {
    const m = mapToLinkedInContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.text ?? null,
      imageUrl: null,
      publishedAt: m.created ? new Date(m.created) : null,
      views: null,
      likes: null,
      comments: null,
    });
  }

  private fromPinterest(uc: UserContent): DiscoverContentModel {
    const m = mapToPinterestContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.description ?? null,
      imageUrl: m.imageUrl ?? null,
      publishedAt: m.createdAt ? new Date(m.createdAt) : null,
      views: null,
      likes: null,
      comments: null,
    });
  }

  private fromThreads(uc: UserContent): DiscoverContentModel {
    const m = mapToThreadsContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.description ?? null,
      imageUrl: m.imageUrl ?? null,
      publishedAt: m.createdAt ? new Date(m.createdAt) : null,
      views: null,
      likes: null,
      comments: null,
    });
  }

  private fromSpotify(uc: UserContent): DiscoverContentModel {
    const m = mapToSpotifyContentModel(uc);
    const imageUrl = (m as any).imageUrl ?? null;
    const description = (m as any).description ?? null;
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description,
      imageUrl,
      publishedAt: null,
      views: null,
      likes: null,
      comments: null,
    });
  }

  private fromReddit(uc: UserContent): DiscoverContentModel {
    const m = mapToRedditContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.selftext ?? null,
      imageUrl: m.thumbnail ?? null,
      publishedAt: m.createdUtc ? new Date(m.createdUtc * 1000) : null,
      views: null,
      likes: m.score ?? null,
      comments: m.numComments ?? null,
    });
  }

  private fromSnapchat(uc: UserContent): DiscoverContentModel {
    const m = mapToSnapchatContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.description ?? null,
      imageUrl: m.imageUrl ?? null,
      publishedAt: m.createdAt ? new Date(m.createdAt) : null,
      views: null,
      likes: null,
      comments: null,
    });
  }

  private fromBehance(uc: UserContent): DiscoverContentModel {
    const m = mapToBehanceContentModel(uc);
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: m.description ?? null,
      imageUrl: m.imageUrl ?? null,
      publishedAt: m.createdAt ? new Date(m.createdAt) : null,
      views: m.views ?? null,
      likes: m.likes ?? null,
      comments: null,
    });
  }

  private fromUnknown(uc: UserContent): DiscoverContentModel {
    const media = uc.media;
    const engagement = uc.engagement || {};
    return new DiscoverContentModel({
      ...this.commonFields(uc),
      description: uc.text ?? null,
      imageUrl: media?.[0]?.thumbnail ?? media?.[0]?.url ?? null,
      publishedAt: uc.publishedAt ?? null,
      views: engagement.views ?? null,
      likes: engagement.likes ?? null,
      comments: engagement.comments ?? null,
    });
  }
}
