import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import {
  EngagementEvent,
  Mute,
  PollVote,
  Reaction,
  Share,
  TopicAffinity,
} from '../../../domain/entities/social';
import { EngagementKind, ReactionType } from '../../../domain/enums';
import {
  IEngagementRepository,
  IPostRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import {
  ENGAGEMENT_LEARNING_WEIGHTS,
  ageInHours,
  decayAffinity,
} from '../../../core/utils/recommendation';

/** Affinity half-life. A month of not reading about something halves it. */
const AFFINITY_HALF_LIFE_HOURS = 24 * 30;
/** Ceiling on a single affinity, so one obsession cannot own the whole feed. */
const MAX_AFFINITY_WEIGHT = 50;

/**
 * Records what readers do, and turns it into what the recommender knows.
 *
 * Two responsibilities that belong together: an engagement is written once,
 * and the affinity update happens in the same call. Splitting them into a
 * writer and a nightly batch is how a system ends up recommending yesterday's
 * interests — and how a batch job becomes load-bearing without anyone noticing.
 *
 * Affinities decay on read-modify-write rather than by a sweep, so they are
 * always current and there is no schedule to fall behind.
 */
@Injectable()
export class EngagementService {
  constructor(
    @Inject(_const.IENGAGEMENT_REPOSITORY)
    private readonly engagement: IEngagementRepository,
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * React to a post, or change an existing reaction.
   *
   * Returns the resulting state so the client does not have to guess whether
   * a second tap added or removed — the server decides, once.
   */
  public async reactAsync(input: {
    postId: string;
    viewerUserId: string;
    type: ReactionType;
  }): Promise<{ reacted: boolean; likesCount: number }> {
    const profile = await this.requireProfileAsync(input.viewerUserId);
    const post = await this.posts.getByIdAsync(input.postId);
    if (!post) throw new NotFoundException('Post not found.');

    const existing = await this.engagement.getReactionAsync(
      input.postId,
      profile.id,
    );

    if (existing && existing.type === input.type) {
      await this.engagement.removeReactionAsync(input.postId, profile.id);
      await this.posts.incrementCountersAsync(input.postId, {
        likesCount: -1,
      });
      return {
        reacted: false,
        likesCount: Math.max(0, post.likesCount - 1),
      };
    }

    await this.engagement.upsertReactionAsync(
      new Reaction({
        postId: input.postId,
        profileId: profile.id,
        type: input.type,
      }),
    );

    // Only a *new* reaction moves the counter; changing like → celebrate does
    // not add a second like.
    if (!existing) {
      await this.posts.incrementCountersAsync(input.postId, { likesCount: 1 });
    }

    await this.recordAsync({
      actorProfileId: profile.id,
      subjectId: input.postId,
      subjectKind: 'post',
      kind: EngagementKind.Like,
      topics: post.topics,
    });

    this.eventEmitter.emit('social.post.reacted', {
      postId: input.postId,
      authorProfileId: post.authorProfileId,
      actorProfileId: profile.id,
      type: input.type,
    });

    return {
      reacted: true,
      likesCount: existing ? post.likesCount : post.likesCount + 1,
    };
  }

  public async votePollAsync(input: {
    postId: string;
    optionId: string;
    viewerUserId: string;
  }): Promise<void> {
    const profile = await this.requireProfileAsync(input.viewerUserId);
    const post = await this.posts.getByIdAsync(input.postId);
    if (!post) throw new NotFoundException('Poll not found.');
    if (post.expiresOn && post.expiresOn.getTime() <= Date.now()) {
      throw new NotFoundException('This poll has closed.');
    }

    const existing = await this.engagement.getPollVoteAsync(
      input.postId,
      profile.id,
    );
    if (existing) {
      if (existing.optionId === input.optionId) return;
      // Changing a vote moves the tally rather than adding a second one.
      await this.engagement.incrementPollOptionAsync(existing.optionId, -1);
      existing.optionId = input.optionId;
      await this.engagement.castPollVoteAsync(existing);
    } else {
      await this.engagement.castPollVoteAsync(
        new PollVote({
          postId: input.postId,
          optionId: input.optionId,
          voterProfileId: profile.id,
        }),
      );
    }
    await this.engagement.incrementPollOptionAsync(input.optionId, 1);

    await this.recordAsync({
      actorProfileId: profile.id,
      subjectId: input.postId,
      subjectKind: 'post',
      kind: EngagementKind.Click,
      topics: post.topics,
    });
  }

  /**
   * Register an outbound share and mint its attribution code.
   *
   * The code goes into the shared URL. When traffic arrives carrying it,
   * `recordShareVisitAsync` credits both the sharer and the author — which is
   * what makes "sharing a post grows the author's profile" a measurable claim
   * rather than a slogan.
   */
  public async shareAsync(input: {
    postId: string;
    viewerUserId: string | null;
    channel: string;
  }): Promise<{ referralCode: string; url: string }> {
    const post = await this.posts.getByIdAsync(input.postId);
    if (!post) throw new NotFoundException('Post not found.');

    const profile = input.viewerUserId
      ? await this.profiles.getByUserIdAsync(input.viewerUserId)
      : null;

    const referralCode = nanoid(12);
    await this.engagement.createShareAsync(
      new Share({
        postId: input.postId,
        sharerProfileId: profile?.id ?? null,
        channel: input.channel.slice(0, 40),
        referralCode,
      }),
    );
    await this.posts.incrementCountersAsync(input.postId, { sharesCount: 1 });

    if (profile) {
      await this.recordAsync({
        actorProfileId: profile.id,
        subjectId: input.postId,
        subjectKind: 'post',
        kind: EngagementKind.Share,
        topics: post.topics,
      });
    }

    const author = await this.profiles.getByIdAsync(post.authorProfileId);
    return {
      referralCode,
      url: `/community/${author?.handle ?? 'unknown'}/${post.id}?ref=${referralCode}`,
    };
  }

  public async recordShareVisitAsync(referralCode: string): Promise<void> {
    const share = await this.engagement.getShareByCodeAsync(referralCode);
    if (!share) return;
    await this.engagement.incrementShareVisitAsync(referralCode);
    await this.posts.incrementCountersAsync(share.postId, { clicksCount: 1 });
  }

  /**
   * Batch of client-reported signals — impressions, dwell, video watch.
   *
   * Clamped and capped: a client can lie, and the recommender is downstream of
   * whatever it is told. One page of feed is 50 events, so anything larger is
   * either a bug or an attempt to poison a profile's affinities.
   */
  public async recordBatchAsync(input: {
    viewerUserId: string;
    events: Array<{
      subjectId: string;
      subjectKind: string;
      kind: EngagementKind;
      value?: number;
      surface?: string;
      position?: number;
    }>;
  }): Promise<number> {
    const profile = await this.profiles.getByUserIdAsync(input.viewerUserId);
    if (!profile) return 0;

    const events = input.events.slice(0, 100);
    if (events.length === 0) return 0;

    const rows = events.map(
      (e) =>
        new EngagementEvent({
          actorProfileId: profile.id,
          subjectId: e.subjectId,
          subjectKind: e.subjectKind.slice(0, 24),
          kind: e.kind,
          value: Math.min(Math.max(e.value ?? 1, 0), 3600),
          surface: e.surface?.slice(0, 40),
          position: e.position,
        }),
    );
    await this.engagement.recordEventsAsync(rows);

    const impressions = events.filter(
      (e) => e.kind === EngagementKind.Impression && e.subjectKind === 'post',
    );
    for (const impression of impressions) {
      await this.posts
        .incrementCountersAsync(impression.subjectId, { impressionsCount: 1 })
        .catch((error) =>
          logger.warn('[engagement] impression counter failed', error),
        );
    }

    // Affinity learning only from the meaningful signals. Impressions are kept
    // for measurement but weighted near zero, so scrolling past something is
    // not mistaken for interest in it.
    const learnable = events.filter(
      (e) => e.kind !== EngagementKind.Impression && e.subjectKind === 'post',
    );
    if (learnable.length > 0) {
      const posts = await this.posts.getManyByIdsAsync(
        Array.from(new Set(learnable.map((e) => e.subjectId))),
      );
      const topicsById = new Map(posts.map((p) => [p.id, p.topics]));
      for (const event of learnable) {
        await this.applyAffinityAsync(
          profile.id,
          topicsById.get(event.subjectId) ?? [],
          event.kind,
        );
      }
    }

    return rows.length;
  }

  /** "Not interested" — an explicit no that outweighs everything positive. */
  public async notInterestedAsync(input: {
    viewerUserId: string;
    postId: string;
  }): Promise<void> {
    const profile = await this.requireProfileAsync(input.viewerUserId);
    const post = await this.posts.getByIdAsync(input.postId);
    if (!post) return;

    await this.recordAsync({
      actorProfileId: profile.id,
      subjectId: input.postId,
      subjectKind: 'post',
      kind: EngagementKind.NotInterested,
      topics: post.topics,
    });
  }

  public async setMuteAsync(input: {
    viewerUserId: string;
    targetProfileId: string;
    isBlock: boolean;
    enabled: boolean;
  }): Promise<void> {
    const profile = await this.requireProfileAsync(input.viewerUserId);
    if (profile.id === input.targetProfileId) return;

    if (!input.enabled) {
      await this.engagement.removeMuteAsync(profile.id, input.targetProfileId);
      return;
    }
    await this.engagement.setMuteAsync(
      new Mute({
        profileId: profile.id,
        targetProfileId: input.targetProfileId,
        isBlock: input.isBlock,
      }),
    );
    await this.recordAsync({
      actorProfileId: profile.id,
      subjectId: input.targetProfileId,
      subjectKind: 'profile',
      kind: input.isBlock ? EngagementKind.Block : EngagementKind.Mute,
      topics: [],
    });
  }

  /* ------------------------------------------------------------- internals */

  private async requireProfileAsync(userId: string) {
    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) throw new NotFoundException('Community profile not found.');
    return profile;
  }

  private async recordAsync(input: {
    actorProfileId: string;
    subjectId: string;
    subjectKind: string;
    kind: EngagementKind;
    topics: string[];
    value?: number;
    surface?: string;
  }): Promise<void> {
    await this.engagement.recordEventsAsync([
      new EngagementEvent({
        actorProfileId: input.actorProfileId,
        subjectId: input.subjectId,
        subjectKind: input.subjectKind,
        kind: input.kind,
        value: input.value ?? 1,
        surface: input.surface,
      }),
    ]);
    await this.applyAffinityAsync(
      input.actorProfileId,
      input.topics,
      input.kind,
    );
  }

  /**
   * Fold one engagement into the reader's topic affinities.
   *
   * Existing weight decays by elapsed time first, then the new signal is
   * added. A pinned topic keeps its weight — the reader said so — and a muted
   * one is never raised by implicit behaviour, because muting something and
   * then reading it out of morbid curiosity should not undo the mute.
   */
  private async applyAffinityAsync(
    profileId: string,
    topics: string[],
    kind: EngagementKind,
  ): Promise<void> {
    if (topics.length === 0) return;
    const delta = ENGAGEMENT_LEARNING_WEIGHTS[kind] ?? 0;
    if (delta === 0) return;

    const existing = await this.engagement.getAffinitiesAsync(profileId);
    const byTopic = new Map(existing.map((a) => [a.topic, a]));
    const now = new Date();

    const updates: TopicAffinity[] = [];
    for (const rawTopic of topics.slice(0, 12)) {
      const topic = rawTopic.toLowerCase();
      const current = byTopic.get(topic);

      if (current?.isPinned) continue;
      if (current?.isMuted && delta > 0) continue;

      const decayed = current
        ? decayAffinity(
            current.weight,
            ageInHours(current.decayedOn ?? current.createdOn, now),
            AFFINITY_HALF_LIFE_HOURS,
          )
        : 0;

      updates.push(
        new TopicAffinity({
          ...(current ? { id: current.id } : {}),
          profileId,
          topic,
          weight: Math.min(MAX_AFFINITY_WEIGHT, Math.max(0, decayed + delta)),
          isPinned: current?.isPinned ?? false,
          isMuted: current?.isMuted ?? false,
          decayedOn: now,
        }),
      );
    }

    if (updates.length > 0) {
      await this.engagement.upsertAffinitiesAsync(updates);
    }
  }
}
