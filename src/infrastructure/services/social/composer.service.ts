import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import {
  PollOption,
  Post,
  PostMedia,
  PostProduct,
  SocialProfile,
} from '../../../domain/entities/social';
import {
  AttachmentKind,
  DisclosureKind,
  MediaKind,
  PostKind,
  PostStatus,
  Visibility,
} from '../../../domain/enums';
import {
  IPostRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import { ITopicRepository } from '../../../domain/repositories';
import {
  buildSearchText,
  effectiveReplyVisibility,
  extractFirstUrl,
  extractHashtags,
  extractMentions,
  inferTopics,
  slugifyTopic,
} from '../../../core/utils/recommendation';

/** Body length ceiling. Long-form belongs in an article, not an update. */
const MAX_BODY_LENGTH = 5000;
const MAX_MEDIA_ITEMS = 10;
const MAX_POLL_OPTIONS = 6;
const STORY_LIFETIME_HOURS = 24;

export interface ComposeInput {
  authorUserId: string;
  kind: PostKind;
  body?: string;
  visibility?: Visibility;
  media?: Array<{
    kind: MediaKind;
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    duration?: number;
    mimeType?: string;
    altText?: string;
    placeholderColor?: string;
  }>;
  pollOptions?: string[];
  pollClosesInHours?: number;
  parentId?: string;
  repostOfId?: string;
  attachmentKind?: AttachmentKind;
  attachmentTargetId?: string;
  place?: { name: string; latitude?: number; longitude?: number };
  productIds?: string[];
  topics?: string[];
  tags?: string[];
  isSponsored?: boolean;
  disclosure?: DisclosureKind;
  sponsorProfileId?: string;
  campaignId?: string;
  scheduledFor?: Date | null;
  /** `false` saves a draft. `true` publishes now, or schedules if dated. */
  publish?: boolean;
  /** External platforms to simulcast to. Failure there never blocks here. */
  externalPlatforms?: string[];
  streamId?: string;
}

/**
 * The one composer.
 *
 * Drafts, scheduled posts, replies, reposts, stories, polls and live
 * announcements all enter through `composeAsync`. There is no second write
 * path — a "quick reply" endpoint that skipped topic inference or disclosure
 * validation would be a hole in both the recommender's inputs and the
 * paid-content rules.
 *
 * **Publishing here always succeeds.** External targets are recorded on the
 * post and dispatched afterwards; a dead Instagram token produces a `failed`
 * entry in `externalTargets`, never a failed publish. That ordering is the
 * product requirement, and it is enforced by this method returning before the
 * external dispatch is awaited.
 */
@Injectable()
export class ComposerService {
  constructor(
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.ITOPIC_REPOSITORY)
    private readonly topics: ITopicRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async composeAsync(input: ComposeInput): Promise<Post> {
    const author = await this.requireProfileAsync(input.authorUserId);

    const body = (input.body ?? '').slice(0, MAX_BODY_LENGTH).trim();
    const media = (input.media ?? []).slice(0, MAX_MEDIA_ITEMS);
    const pollOptions = (input.pollOptions ?? [])
      .map((label) => label.trim())
      .filter((label) => label.length > 0)
      .slice(0, MAX_POLL_OPTIONS);

    this.validate(input, body, media.length, pollOptions.length);

    const parent = input.parentId
      ? await this.posts.getByIdAsync(input.parentId)
      : null;
    if (input.parentId && !parent) {
      throw new NotFoundException(
        'The post you are replying to no longer exists.',
      );
    }

    const repostOf = input.repostOfId
      ? await this.posts.getByIdAsync(input.repostOfId)
      : null;
    if (input.repostOfId && !repostOf) {
      throw new NotFoundException(
        'The post you are resharing no longer exists.',
      );
    }

    const visibility = this.resolveVisibility(input, author, parent);
    const disclosure = this.resolveDisclosure(input);

    const { tags, topics } = await this.deriveTaxonomyAsync(
      body,
      input.tags,
      input.topics,
    );
    const mentionedProfileIds = await this.resolveMentionsAsync(body);

    const now = new Date();
    const status = this.resolveStatus(input, now);
    const publishedOn = status === PostStatus.Published ? now : null;

    const post = new Post({
      authorProfileId: author.id,
      kind: input.kind,
      status,
      visibility,
      body: body || undefined,
      parentId: parent?.id ?? null,
      rootId: parent ? (parent.rootId ?? parent.id) : null,
      repostOfId: repostOf?.id ?? null,
      attachmentKind: input.attachmentKind ?? null,
      attachmentTargetId: input.attachmentTargetId ?? null,
      place: input.place ?? null,
      linkPreview: this.buildLinkPreview(body),
      streamId: input.streamId ?? null,
      tags,
      topics,
      mentionedProfileIds,
      isSponsored: Boolean(input.isSponsored),
      disclosure,
      sponsorProfileId: input.sponsorProfileId ?? null,
      campaignId: input.campaignId ?? null,
      scheduledFor: status === PostStatus.Scheduled ? input.scheduledFor : null,
      publishedOn,
      expiresOn: this.resolveExpiry(input, now),
      // Written explicitly. A default on the column would be skipped by any
      // bulk insert that names its columns — see AGENTS.md.
      searchText: buildSearchText({
        body,
        tags,
        topics,
        authorHandle: author.handle,
        authorName: author.displayName,
      }),
      externalTargets: (input.externalPlatforms ?? []).map((platform) => ({
        platform,
        status: 'pending' as const,
      })),
    });

    const saved = await this.posts.createAsync(post);

    if (media.length > 0) {
      await this.posts.replaceMediaAsync(
        saved.id,
        media.map(
          (m, index) =>
            new PostMedia({ ...m, postId: saved.id, position: index }),
        ),
      );
    }

    if (input.kind === PostKind.Poll && pollOptions.length > 0) {
      await this.posts.replacePollOptionsAsync(
        saved.id,
        pollOptions.map(
          (label, index) =>
            new PollOption({ postId: saved.id, label, position: index }),
        ),
      );
    }

    if (input.productIds?.length) {
      await this.posts.replaceProductTagsAsync(
        saved.id,
        input.productIds
          .slice(0, 20)
          .map((productId) => new PostProduct({ postId: saved.id, productId })),
      );
    }

    if (saved.status === PostStatus.Published) {
      await this.onPublishedAsync(saved, author, parent);
    }

    return saved;
  }

  /** Publish a draft or a scheduled post. Idempotent — re-publishing is a no-op. */
  public async publishAsync(
    postId: string,
    authorUserId: string,
  ): Promise<Post> {
    const author = await this.requireProfileAsync(authorUserId);
    const post = await this.posts.getByIdAsync(postId);
    if (!post) throw new NotFoundException('Post not found.');
    if (post.authorProfileId !== author.id) {
      throw new ForbiddenException('You can only publish your own posts.');
    }
    if (post.status === PostStatus.Published) return post;

    const updated = await this.posts.updateAsync(postId, {
      status: PostStatus.Published,
      publishedOn: new Date(),
      scheduledFor: null,
    });
    if (!updated) throw new NotFoundException('Post not found.');

    const parent = updated.parentId
      ? await this.posts.getByIdAsync(updated.parentId)
      : null;
    await this.onPublishedAsync(updated, author, parent);
    return updated;
  }

  /**
   * The scheduler tick.
   *
   * Publishes everything whose time has come, one at a time, and never lets
   * one bad post stop the batch — a scheduled post that fails should not take
   * the next hour's queue with it.
   */
  public async publishDueScheduledAsync(now = new Date()): Promise<number> {
    const due = await this.posts.getScheduledDueAsync(now, 100);
    let published = 0;

    for (const post of due) {
      try {
        const author = await this.profiles.getByIdAsync(post.authorProfileId);
        if (!author) continue;
        const updated = await this.posts.updateAsync(post.id, {
          status: PostStatus.Published,
          publishedOn: now,
          scheduledFor: null,
        });
        if (!updated) continue;
        await this.onPublishedAsync(updated, author, null);
        published += 1;
      } catch (error) {
        logger.error(
          `[composer] scheduled post ${post.id} failed to publish`,
          error,
        );
      }
    }
    return published;
  }

  public async updateDraftAsync(
    postId: string,
    authorUserId: string,
    changes: Partial<ComposeInput>,
  ): Promise<Post> {
    const author = await this.requireProfileAsync(authorUserId);
    const post = await this.posts.getByIdAsync(postId);
    if (!post) throw new NotFoundException('Post not found.');
    if (post.authorProfileId !== author.id) {
      throw new ForbiddenException('You can only edit your own posts.');
    }

    const body =
      changes.body !== undefined
        ? changes.body.slice(0, MAX_BODY_LENGTH).trim()
        : (post.body ?? '');
    const { tags, topics } = await this.deriveTaxonomyAsync(
      body,
      changes.tags,
      changes.topics,
    );

    const updated = await this.posts.updateAsync(postId, {
      body: body || undefined,
      visibility: changes.visibility ?? post.visibility,
      scheduledFor:
        changes.scheduledFor !== undefined
          ? changes.scheduledFor
          : post.scheduledFor,
      status:
        changes.scheduledFor && post.status === PostStatus.Draft
          ? PostStatus.Scheduled
          : post.status,
      tags,
      topics,
      linkPreview: this.buildLinkPreview(body),
      searchText: buildSearchText({
        body,
        tags,
        topics,
        authorHandle: author.handle,
        authorName: author.displayName,
      }),
    });
    if (!updated) throw new NotFoundException('Post not found.');

    if (changes.media) {
      await this.posts.replaceMediaAsync(
        postId,
        changes.media
          .slice(0, MAX_MEDIA_ITEMS)
          .map((m, index) => new PostMedia({ ...m, postId, position: index })),
      );
    }
    return updated;
  }

  public async deleteAsync(
    postId: string,
    authorUserId: string,
  ): Promise<void> {
    const author = await this.requireProfileAsync(authorUserId);
    const post = await this.posts.getByIdAsync(postId);
    if (!post) return;
    if (post.authorProfileId !== author.id) {
      throw new ForbiddenException('You can only delete your own posts.');
    }
    await this.posts.deleteAsync(postId);
    await this.profiles.incrementCountersAsync(author.id, { postsCount: -1 });
  }

  /* ------------------------------------------------------------- internals */

  private async requireProfileAsync(userId: string): Promise<SocialProfile> {
    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) {
      throw new BadRequestException(
        'Set up your Community profile before posting.',
      );
    }
    return profile;
  }

  private validate(
    input: ComposeInput,
    body: string,
    mediaCount: number,
    pollOptionCount: number,
  ): void {
    const isRepostWithoutBody = Boolean(input.repostOfId) && body.length === 0;

    if (
      body.length === 0 &&
      mediaCount === 0 &&
      pollOptionCount === 0 &&
      !isRepostWithoutBody &&
      !input.streamId &&
      !input.attachmentTargetId
    ) {
      throw new BadRequestException(
        'A post needs text, media or an attachment.',
      );
    }

    if (input.kind === PostKind.Poll && pollOptionCount < 2) {
      throw new BadRequestException('A poll needs at least two options.');
    }

    // Undisclosed advertising is the one thing the composer refuses outright.
    //
    // Omitting `disclosure` is fine — `resolveDisclosure` fills in a paid
    // partnership. What is rejected is *explicitly* claiming no disclosure on
    // a post marked sponsored, because that is a contradiction the author has
    // to resolve rather than something to silently override.
    if (input.isSponsored && input.disclosure === DisclosureKind.None) {
      throw new BadRequestException(
        'A sponsored post must carry a paid-partnership disclosure.',
      );
    }

    if (input.scheduledFor && input.scheduledFor.getTime() < Date.now()) {
      throw new BadRequestException('Scheduled time must be in the future.');
    }
  }

  private resolveVisibility(
    input: ComposeInput,
    author: SocialProfile,
    parent: Post | null,
  ): Visibility {
    const requested = input.visibility ?? author.defaultPostVisibility;
    // A reply can never be more visible than what it replies to.
    return parent
      ? effectiveReplyVisibility(requested, parent.visibility)
      : requested;
  }

  private resolveDisclosure(input: ComposeInput): DisclosureKind {
    if (input.disclosure) return input.disclosure;
    if (input.isSponsored) return DisclosureKind.PaidPartnership;
    return DisclosureKind.None;
  }

  private resolveStatus(input: ComposeInput, now: Date): PostStatus {
    if (!input.publish) return PostStatus.Draft;
    if (input.scheduledFor && input.scheduledFor.getTime() > now.getTime()) {
      return PostStatus.Scheduled;
    }
    return PostStatus.Published;
  }

  private resolveExpiry(input: ComposeInput, now: Date): Date | null {
    if (input.kind === PostKind.Story) {
      return new Date(now.getTime() + STORY_LIFETIME_HOURS * 3_600_000);
    }
    if (input.kind === PostKind.Poll && input.pollClosesInHours) {
      const hours = Math.min(Math.max(input.pollClosesInHours, 1), 24 * 14);
      return new Date(now.getTime() + hours * 3_600_000);
    }
    return null;
  }

  private buildLinkPreview(body: string): Post['linkPreview'] {
    const url = extractFirstUrl(body);
    // Only the URL is stored synchronously; title, description and image are
    // filled in by the unfurl job. Fetching inline would put a third party's
    // latency on the critical path of publishing.
    return url ? { url } : null;
  }

  private async deriveTaxonomyAsync(
    body: string,
    explicitTags?: string[],
    explicitTopics?: string[],
  ): Promise<{ tags: string[]; topics: string[] }> {
    const tags = Array.from(
      new Set([
        ...extractHashtags(body),
        ...(explicitTags ?? []).map((t) => t.toLowerCase()),
      ]),
    ).slice(0, 20);

    let topics = (explicitTopics ?? []).map((t) => t.toLowerCase());
    if (topics.length === 0 && body.length > 0) {
      try {
        const vocabulary = await this.topics.getAllAsync();
        topics = inferTopics(
          body,
          // `identity.topics` has no slug column — the name is the identity.
          // Slugifying here keeps topic values consistent with hashtags, which
          // is what lets one `topics` array carry both.
          vocabulary
            .filter((t) => t.isActive)
            .map((t) => ({
              slug: slugifyTopic(t.name),
              label: t.name ?? '',
            })),
        );
      } catch (error) {
        // Topic inference is an optimisation, not a requirement. A post with
        // no topics still ranks — it just leans on the other signals.
        logger.warn('[composer] topic inference unavailable', error);
      }
    }
    return {
      tags,
      topics: Array.from(new Set([...topics, ...tags])).slice(0, 12),
    };
  }

  private async resolveMentionsAsync(body: string): Promise<string[]> {
    const handles = extractMentions(body);
    if (handles.length === 0) return [];
    const resolved = await Promise.all(
      handles.map((handle) => this.profiles.getByHandleAsync(handle)),
    );
    return resolved
      .filter((p): p is SocialProfile => Boolean(p))
      .map((p) => p.id);
  }

  /**
   * Everything that happens because a post became visible.
   *
   * Emitted as events rather than called directly so notification fan-out,
   * counter updates and external syndication can each fail independently.
   * Publishing has already succeeded by the time any of this runs.
   */
  private async onPublishedAsync(
    post: Post,
    author: SocialProfile,
    parent: Post | null,
  ): Promise<void> {
    await this.profiles.incrementCountersAsync(author.id, { postsCount: 1 });

    if (parent) {
      await this.posts.incrementCountersAsync(parent.id, { commentsCount: 1 });
    }
    if (post.repostOfId) {
      await this.posts.incrementCountersAsync(post.repostOfId, {
        repostsCount: 1,
      });
    }

    this.eventEmitter.emit('social.post.published', {
      postId: post.id,
      authorProfileId: author.id,
      parentId: parent?.id ?? null,
      repostOfId: post.repostOfId ?? null,
      mentionedProfileIds: post.mentionedProfileIds ?? [],
      externalTargets: post.externalTargets ?? [],
      visibility: post.visibility,
    });
  }
}
