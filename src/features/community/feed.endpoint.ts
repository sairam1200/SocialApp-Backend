import * as Joi from 'joi';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post as HttpPost,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  FeedPageModel,
  FeedPreferencesModel,
  PostModel,
  ThreadModel,
} from '../../domain/contracts/social.model';
import {
  EngagementKind,
  FeedMode,
  PostKind,
  ReactionType,
} from '../../domain/enums';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { UserAccoutGuard } from '../../core/passport';
import { FeedService } from '../../infrastructure/services/social/feed.service';
import { EngagementService } from '../../infrastructure/services/social/engagement.service';
import { RecommendationService } from '../../infrastructure/services/social/recommendation.service';
import { CommunityProfileService } from '../../infrastructure/services/social/community-profile.service';
import { resolveFeedPreferences } from '../../core/utils/recommendation';
import { Inject } from '@nestjs/common';
import _const from '../../core/utils/const';
import {
  IEngagementRepository,
  IPostRepository,
  ISocialProfileRepository,
} from '../../domain/repositories/isocial.repository';

/**
 * Anonymous callers get a real feed.
 *
 * `HttpContext.getCurrentUserId` is populated by the middleware from a session
 * cookie or a JWT and is empty for a visitor. Community is public by default,
 * so an empty caller is a supported state everywhere here, not an error.
 */
function currentUserIdOrNull(): string | null {
  const id = HttpContext.getCurrentUserId;
  return id && id.length > 0 ? id : null;
}

const feedQueryValidations = Joi.object({
  mode: Joi.string()
    .valid(...Object.values(FeedMode))
    .default(FeedMode.Recommended),
  limit: Joi.number().integer().min(1).max(50).default(20),
  before: Joi.string().isoDate().allow('', null),
  topics: Joi.string().allow('', null),
  kinds: Joi.string().allow('', null),
});

const reactValidations = Joi.object({
  type: Joi.string()
    .valid(...Object.values(ReactionType))
    .default(ReactionType.Like),
});

const signalValidations = Joi.object({
  events: Joi.array()
    .items(
      Joi.object({
        subjectId: Joi.string().uuid().required(),
        subjectKind: Joi.string().max(24).default('post'),
        kind: Joi.string()
          .valid(...Object.values(EngagementKind))
          .required(),
        value: Joi.number().min(0).max(3600).default(1),
        surface: Joi.string().max(40).allow('', null),
        position: Joi.number().integer().min(0).max(10000).allow(null),
      }),
    )
    .max(100)
    .required(),
});

@ApiTags('Community')
@Controller({ path: '/community', version: '1' })
export class CommunityFeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly engagement: EngagementService,
    private readonly recommendation: RecommendationService,
    private readonly profileService: CommunityProfileService,
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.IENGAGEMENT_REPOSITORY)
    private readonly engagementRepository: IEngagementRepository,
  ) {}

  @Get('feed')
  @ApiOperation({
    summary: 'The feed',
    description:
      'Two feeds, and the reader chooses. `recommended` runs the two-stage ranker; `latest` is strictly chronological. Both honour the same visibility rules.',
  })
  @ApiQuery({ name: 'mode', enum: FeedMode, required: false })
  @ApiResponse({ status: 200, type: FeedPageModel })
  public async getFeed(
    @Query() query: Record<string, string>,
  ): Promise<FeedPageModel> {
    const value = await feedQueryValidations.validateAsync(query, {
      stripUnknown: true,
    });

    return this.feed.getFeedAsync({
      mode: value.mode as FeedMode,
      viewerUserId: currentUserIdOrNull(),
      limit: value.limit,
      before: value.before || null,
      topics: splitList(value.topics),
      kinds: splitList(value.kinds) as PostKind[] | undefined,
    });
  }

  @Get('profiles/:handle/feed')
  @ApiOperation({
    summary: 'A profile timeline',
    description:
      "The profile's own posts, optionally mixed with posts from the profiles it follows.",
  })
  @ApiResponse({ status: 200, type: FeedPageModel })
  public async getProfileFeed(
    @Param('handle') handle: string,
    @Query() query: Record<string, string>,
  ): Promise<FeedPageModel> {
    const profile = await this.profiles.getByHandleAsync(handle);
    if (!profile) throw new NotFoundException('Profile not found.');

    const value = await feedQueryValidations.validateAsync(query, {
      stripUnknown: true,
    });

    return this.feed.getFeedAsync({
      mode: FeedMode.Latest,
      viewerUserId: currentUserIdOrNull(),
      limit: value.limit,
      before: value.before || null,
      authorProfileId: profile.id,
      includeFollowedByAuthor: query.includeFollowing === 'true',
      kinds: splitList(value.kinds) as PostKind[] | undefined,
    });
  }

  @Get('posts/:postId')
  @ApiResponse({ status: 200, type: PostModel })
  public async getPost(@Param('postId') postId: string): Promise<PostModel> {
    const viewerUserId = currentUserIdOrNull();
    // Not `getByIdAsync` — that is a raw primary-key lookup with no visibility
    // check, and using it here leaked the body of a close-friends post to
    // anonymous callers. "Not found" rather than "forbidden": saying forbidden
    // confirms the post exists, which is itself a leak.
    const post = await this.feed.getVisiblePostAsync(postId, viewerUserId);
    if (!post) throw new NotFoundException('Post not found.');

    const model = await this.feed.mapPostAsync(post, viewerUserId);

    // A permalink read is a real signal — it is the strongest evidence short
    // of an explicit reaction that the reader wanted this.
    if (viewerUserId) {
      await this.engagement
        .recordBatchAsync({
          viewerUserId,
          events: [
            {
              subjectId: post.id,
              subjectKind: 'post',
              kind: EngagementKind.Click,
              surface: 'permalink',
            },
          ],
        })
        .catch(() => undefined);
    }
    return model;
  }

  @Get('posts/:postId/thread')
  @ApiOperation({ summary: 'A post and its replies' })
  @ApiResponse({ status: 200, type: ThreadModel })
  public async getThread(
    @Param('postId') postId: string,
    @Query('limit') limit?: string,
  ): Promise<ThreadModel> {
    const viewerUserId = currentUserIdOrNull();
    const post = await this.feed.getVisiblePostAsync(postId, viewerUserId);
    if (!post) throw new NotFoundException('Post not found.');

    const root = await this.feed.mapPostAsync(post, viewerUserId);
    const replies = await this.feed.getRepliesAsync(post.id, viewerUserId, {
      limit: clampInt(limit, 20, 1, 100),
    });
    return { root, replies };
  }

  @Get('posts/:postId/replies')
  @ApiResponse({ status: 200, type: [PostModel] })
  public async getReplies(
    @Param('postId') postId: string,
    @Query('limit') limit?: string,
    @Query('after') after?: string,
  ): Promise<PostModel[]> {
    return this.feed.getRepliesAsync(postId, currentUserIdOrNull(), {
      limit: clampInt(limit, 20, 1, 100),
      before: after ?? null,
    });
  }

  @HttpPost('posts/:postId/react')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'React, or take a reaction back',
    description:
      'Sending the same reaction twice removes it. The server decides, so two clients cannot disagree about the state.',
  })
  public async react(
    @Param('postId') postId: string,
    @Body() body: { type?: ReactionType },
  ): Promise<{ reacted: boolean; likesCount: number }> {
    const value = await reactValidations.validateAsync(body ?? {}, {
      stripUnknown: true,
    });
    return this.engagement.reactAsync({
      postId,
      viewerUserId: HttpContext.getCurrentUserId,
      type: value.type,
    });
  }

  @HttpPost('posts/:postId/vote')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Vote in a poll, or change your vote' })
  public async vote(
    @Param('postId') postId: string,
    @Body() body: { optionId: string },
  ): Promise<{ ok: true }> {
    await Joi.object({
      optionId: Joi.string().uuid().required(),
    }).validateAsync(body);
    await this.engagement.votePollAsync({
      postId,
      optionId: body.optionId,
      viewerUserId: HttpContext.getCurrentUserId,
    });
    return { ok: true };
  }

  @HttpPost('posts/:postId/share')
  @ApiOperation({
    summary: 'Register an outbound share',
    description:
      'Mints an attribution code so traffic arriving from the share is credited to both the sharer and the author.',
  })
  public async share(
    @Param('postId') postId: string,
    @Body() body: { channel?: string },
  ): Promise<{ referralCode: string; url: string }> {
    return this.engagement.shareAsync({
      postId,
      viewerUserId: currentUserIdOrNull(),
      channel: body?.channel ?? 'copy_link',
    });
  }

  @HttpPost('posts/:postId/not-interested')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Tell the ranker to show less like this' })
  public async notInterested(
    @Param('postId') postId: string,
  ): Promise<{ ok: true }> {
    await this.engagement.notInterestedAsync({
      viewerUserId: HttpContext.getCurrentUserId,
      postId,
    });
    return { ok: true };
  }

  @HttpPost('signals')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Report impressions, dwell and watch time',
    description:
      'Batched from the client. Values are clamped and the batch is capped — the ranker is downstream of whatever it is told.',
  })
  public async signals(
    @Body() body: { events: unknown[] },
  ): Promise<{ recorded: number }> {
    const value = await signalValidations.validateAsync(body, {
      stripUnknown: true,
    });
    const recorded = await this.engagement.recordBatchAsync({
      viewerUserId: HttpContext.getCurrentUserId,
      events: value.events,
    });
    return { recorded };
  }

  /* ------------------------------------------------------ algorithm controls */

  @Get('feed/preferences')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: "How this reader's feed is weighted",
    description:
      'Every knob the ranker uses, with the defaults. Setting every source but `following` to 0 turns the recommended feed into a following timeline.',
  })
  @ApiResponse({ status: 200, type: FeedPreferencesModel })
  public async getPreferences(): Promise<{
    preferences: FeedPreferencesModel;
    defaults: FeedPreferencesModel;
    topics: Array<{
      topic: string;
      weight: number;
      isPinned: boolean;
      isMuted: boolean;
    }>;
  }> {
    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    const stored = (profile.creatorProfile ?? {}) as Record<string, unknown>;
    const preferences = resolveFeedPreferences(stored.feedPreferences as never);
    const affinities = await this.engagementRepository.getAffinitiesAsync(
      profile.id,
    );

    return {
      preferences: preferences as unknown as FeedPreferencesModel,
      defaults:
        this.recommendation.getDefaultPreferences() as unknown as FeedPreferencesModel,
      topics: affinities.slice(0, 60).map((a) => ({
        topic: a.topic,
        weight: Number(a.weight.toFixed(3)),
        isPinned: a.isPinned,
        isMuted: a.isMuted,
      })),
    };
  }

  @HttpPost('feed/preferences')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Change how the feed is weighted' })
  public async setPreferences(
    @Body() body: Record<string, unknown>,
  ): Promise<{ preferences: FeedPreferencesModel }> {
    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    // Clamped on the way in *and* on the way out. This is a trust boundary:
    // a NaN half-life makes every score NaN and the feed silently empties.
    const preferences = resolveFeedPreferences(body as never);

    await this.profiles.updateAsync(profile.id, {
      creatorProfile: {
        ...(profile.creatorProfile ?? {}),
        feedPreferences: preferences,
      } as never,
    });
    return { preferences: preferences as unknown as FeedPreferencesModel };
  }

  @HttpPost('feed/topics/:topic')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Pin or mute a topic',
    description:
      'A pinned topic stops decaying. A muted topic is filtered before ranking and can never be raised by implicit behaviour.',
  })
  public async setTopicPreference(
    @Param('topic') topic: string,
    @Body() body: { isPinned?: boolean; isMuted?: boolean; weight?: number },
  ): Promise<{ ok: true }> {
    const value = await Joi.object({
      isPinned: Joi.boolean(),
      isMuted: Joi.boolean(),
      weight: Joi.number().min(0).max(50),
    }).validateAsync(body ?? {}, { stripUnknown: true });

    const profile = await this.profileService.ensureAsync(
      HttpContext.getCurrentUserId,
    );
    await this.engagementRepository.setAffinityFlagsAsync(
      profile.id,
      topic,
      value,
    );
    return { ok: true };
  }
}

/** `a,b,c` → `['a','b','c']`, and empty → `undefined` so filters stay optional. */
export function splitList(value?: string | null): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}
