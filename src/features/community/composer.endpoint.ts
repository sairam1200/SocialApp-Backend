import * as Joi from 'joi';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PostModel } from '../../domain/contracts/social.model';
import {
  AttachmentKind,
  DisclosureKind,
  MediaKind,
  PostKind,
  PostStatus,
  Visibility,
} from '../../domain/enums';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { UserAccoutGuard } from '../../core/passport';
import { ComposerService } from '../../infrastructure/services/social/composer.service';
import { FeedService } from '../../infrastructure/services/social/feed.service';
import { clampInt } from './feed.endpoint';

const mediaSchema = Joi.object({
  kind: Joi.string()
    .valid(...Object.values(MediaKind))
    .default(MediaKind.Image),
  url: Joi.string().uri().max(1024).required(),
  thumbnailUrl: Joi.string().uri().max(1024).allow('', null),
  width: Joi.number().integer().min(1).max(20000),
  height: Joi.number().integer().min(1).max(20000),
  duration: Joi.number().min(0).max(86400),
  mimeType: Joi.string().max(128),
  altText: Joi.string().max(1000).allow('', null),
  placeholderColor: Joi.string().max(16).allow('', null),
});

const composeValidations = Joi.object({
  kind: Joi.string()
    .valid(...Object.values(PostKind))
    .default(PostKind.Update),
  body: Joi.string().max(5000).allow('', null),
  visibility: Joi.string().valid(...Object.values(Visibility)),
  media: Joi.array().items(mediaSchema).max(10),
  pollOptions: Joi.array().items(Joi.string().max(200)).max(6),
  pollClosesInHours: Joi.number().integer().min(1).max(336),
  parentId: Joi.string().uuid(),
  repostOfId: Joi.string().uuid(),
  attachmentKind: Joi.string().valid(...Object.values(AttachmentKind)),
  attachmentTargetId: Joi.string().uuid(),
  place: Joi.object({
    name: Joi.string().max(200).required(),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
  }),
  productIds: Joi.array().items(Joi.string().uuid()).max(20),
  topics: Joi.array().items(Joi.string().max(80)).max(12),
  tags: Joi.array().items(Joi.string().max(80)).max(20),
  isSponsored: Joi.boolean().default(false),
  disclosure: Joi.string().valid(...Object.values(DisclosureKind)),
  sponsorProfileId: Joi.string().uuid(),
  campaignId: Joi.string().uuid(),
  scheduledFor: Joi.date().iso().allow(null),
  publish: Joi.boolean().default(true),
  externalPlatforms: Joi.array().items(Joi.string().max(40)).max(10),
  streamId: Joi.string().uuid(),
});

/**
 * The composer.
 *
 * One endpoint creates every kind of post: an update, a photo, a video, a
 * story, a poll, a reply, a repost, a live announcement. `kind` and the
 * presence of `parentId`/`repostOfId` are what differ. A second "quick reply"
 * endpoint that skipped topic inference or disclosure validation would be a
 * hole in both the ranker's inputs and the paid-content rules.
 */
@ApiTags('Community')
@Controller({ path: '/community', version: '1' })
export class CommunityComposerController {
  constructor(
    private readonly composer: ComposerService,
    private readonly feed: FeedService,
  ) {}

  @HttpPost('posts')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Create a post, a reply, a repost, a story or a poll',
    description:
      'Set `publish: false` to save a draft, or `scheduledFor` to schedule. Publishing here always succeeds; external platforms are dispatched afterwards and recorded on the post.',
  })
  @ApiResponse({ status: 201, type: PostModel })
  public async compose(
    @Body() body: Record<string, unknown>,
  ): Promise<PostModel> {
    const value = await composeValidations.validateAsync(body ?? {}, {
      stripUnknown: true,
    });
    const post = await this.composer.composeAsync({
      ...value,
      authorUserId: HttpContext.getCurrentUserId,
      scheduledFor: value.scheduledFor ? new Date(value.scheduledFor) : null,
    });
    return this.feed.mapPostAsync(post, HttpContext.getCurrentUserId);
  }

  @Patch('posts/:postId')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Edit a draft or a scheduled post' })
  @ApiResponse({ status: 200, type: PostModel })
  public async update(
    @Param('postId') postId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<PostModel> {
    const value = await composeValidations
      .fork(['kind', 'publish', 'isSponsored'], (schema) => schema.optional())
      .validateAsync(body ?? {}, { stripUnknown: true });

    const post = await this.composer.updateDraftAsync(
      postId,
      HttpContext.getCurrentUserId,
      {
        ...value,
        scheduledFor: value.scheduledFor
          ? new Date(value.scheduledFor)
          : undefined,
      },
    );
    return this.feed.mapPostAsync(post, HttpContext.getCurrentUserId);
  }

  @HttpPost('posts/:postId/publish')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Publish a draft or a scheduled post now' })
  @ApiResponse({ status: 200, type: PostModel })
  public async publish(@Param('postId') postId: string): Promise<PostModel> {
    const post = await this.composer.publishAsync(
      postId,
      HttpContext.getCurrentUserId,
    );
    return this.feed.mapPostAsync(post, HttpContext.getCurrentUserId);
  }

  @Delete('posts/:postId')
  @UseGuards(UserAccoutGuard)
  public async remove(@Param('postId') postId: string): Promise<{ ok: true }> {
    await this.composer.deleteAsync(postId, HttpContext.getCurrentUserId);
    return { ok: true };
  }

  @Get('drafts')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, type: [PostModel] })
  public async drafts(
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<PostModel[]> {
    return this.feed.getDraftsAsync(HttpContext.getCurrentUserId, {
      limit: clampInt(limit, 25, 1, 100),
      before: before ?? null,
    });
  }

  @Get('calendar')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'The content calendar',
    description:
      'Drafts, scheduled posts and what has already gone out, over a date range. One query — the calendar is a view of `posts`, not a second store.',
  })
  public async calendar(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('statuses') statuses?: string,
  ): Promise<{
    items: Array<{
      id: string;
      kind: PostKind;
      status: PostStatus;
      title: string;
      at: Date;
      visibility: Visibility;
      externalPlatforms: string[];
    }>;
  }> {
    const now = Date.now();
    const fromDate = from ? new Date(from) : new Date(now - 30 * 86_400_000);
    const toDate = to ? new Date(to) : new Date(now + 60 * 86_400_000);

    const requested = (statuses ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is PostStatus =>
        (Object.values(PostStatus) as string[]).includes(s),
      );

    const posts = await this.feed.getCalendarAsync({
      viewerUserId: HttpContext.getCurrentUserId,
      from: fromDate,
      to: toDate,
      statuses:
        requested.length > 0
          ? requested
          : [PostStatus.Draft, PostStatus.Scheduled, PostStatus.Published],
    });

    return {
      items: posts.map((p) => ({
        id: p.id,
        kind: p.kind,
        status: p.status,
        title: (p.body ?? '').slice(0, 80) || `${p.kind} post`,
        at: p.scheduledFor ?? p.publishedOn ?? p.createdOn,
        visibility: p.visibility,
        externalPlatforms: (p.externalTargets ?? []).map((t) => t.platform),
      })),
    };
  }
}
