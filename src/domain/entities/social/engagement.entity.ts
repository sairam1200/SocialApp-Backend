import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import { EngagementKind, ReactionType, Visibility } from '../../enums';

/** A reaction on a post. One row per (post, profile) — changing it updates `type`. */
@Entity({ name: 'reactions', schema: 'social' })
@Unique('uq_reactions_post_profile', ['postId', 'profileId'])
export class Reaction extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_reactions_post')
  postId: string;

  @Column({ type: 'uuid' })
  @Index('idx_reactions_profile')
  profileId: string;

  @Column({ type: 'enum', enum: ReactionType, default: ReactionType.Like })
  type: ReactionType;

  constructor(request: Partial<Reaction> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * An external share. Recorded on the outbound click, not the inbound visit, so
 * a share still counts when the recipient never opens it — and matched to
 * arriving traffic afterwards via `referralCode`.
 *
 * Sharing a post grows the author's profile: `sharerProfileId` is who shared,
 * `postId` resolves the author, and the analytics rollups credit both.
 */
@Entity({ name: 'shares', schema: 'social' })
export class Share extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_shares_post')
  postId: string;

  @Column({ type: 'uuid', nullable: true })
  @Index('idx_shares_sharer')
  sharerProfileId?: string | null;

  /** `copy_link`, `x`, `whatsapp`, `email`, `native`… */
  @Column({ type: 'varchar', length: 40 })
  channel: string;

  /** Short code embedded in the shared URL, so arriving traffic is attributable. */
  @Column({ type: 'varchar', length: 32, unique: true })
  @Index('idx_shares_referral_code')
  referralCode: string;

  @Column({ type: 'integer', default: 0 })
  visitsCount: number;

  constructor(request: Partial<Share> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * The recommender's signal store.
 *
 * Append-only and deliberately narrow — one row per interaction, no joins
 * needed to compute an affinity. Rows older than the retention window are
 * pruned by a scheduled job; the derived affinities in `topic_affinities`
 * survive the pruning, which is what keeps this table from growing without
 * bound while the model keeps its memory.
 */
@Entity({ name: 'engagement_events', schema: 'social' })
@Index('idx_engagement_actor_time', ['actorProfileId', 'createdOn'])
@Index('idx_engagement_subject_time', ['subjectId', 'createdOn'])
export class EngagementEvent extends BaseEntity {
  @Column({ type: 'uuid' })
  actorProfileId: string;

  /** The post, profile, product or course that was engaged with. */
  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'varchar', length: 24 })
  subjectKind: string;

  @Column({ type: 'enum', enum: EngagementKind })
  @Index('idx_engagement_kind')
  kind: EngagementKind;

  /** Dwell seconds, watch fraction, purchase amount — meaning depends on `kind`. */
  @Column({ type: 'double precision', default: 1 })
  value: number;

  /** Which surface produced it: `feed_recommended`, `feed_latest`, `explore`… */
  @Column({ type: 'varchar', length: 40, nullable: true })
  surface?: string;

  /** Position in the ranked list, for offline evaluation of the ranker. */
  @Column({ type: 'integer', nullable: true })
  position?: number;

  constructor(request: Partial<EngagementEvent> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * A viewer's learned affinity for a topic, decayed on write.
 *
 * This is the compact user representation the recommender retrieves against —
 * the equivalent of a user embedding, but interpretable, which matters because
 * the product promise is that the reader stays in control of the algorithm.
 * A user can see and edit these.
 */
@Entity({ name: 'topic_affinities', schema: 'social' })
@Unique('uq_topic_affinities_profile_topic', ['profileId', 'topic'])
export class TopicAffinity extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_topic_affinities_profile')
  profileId: string;

  @Column({ type: 'varchar', length: 80 })
  @Index('idx_topic_affinities_topic')
  topic: string;

  /** Decayed sum of weighted engagement. Non-negative. */
  @Column({ type: 'double precision', default: 0 })
  weight: number;

  /** Set when the user edits it in settings — pinned weights stop decaying. */
  @Column({ type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ type: 'boolean', default: false })
  isMuted: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  decayedOn?: Date | null;

  constructor(request: Partial<TopicAffinity> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** Profiles a viewer has chosen not to see. Applied before ranking, not after. */
@Entity({ name: 'mutes', schema: 'social' })
@Unique('uq_mutes_profile_target', ['profileId', 'targetProfileId'])
export class Mute extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_mutes_profile')
  profileId: string;

  @Column({ type: 'uuid' })
  targetProfileId: string;

  /** A block is mutual invisibility; a mute is one-directional. */
  @Column({ type: 'boolean', default: false })
  isBlock: boolean;

  constructor(request: Partial<Mute> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * Membership of an author's narrower audiences.
 *
 * `Visibility.CloseFriends` and `Visibility.BrandPartners` both resolve through
 * this one table — the audience name is the visibility level it grants, so
 * adding a third audience later needs no new table and no new filter branch.
 */
@Entity({ name: 'audience_members', schema: 'social' })
@Unique('uq_audience_members', [
  'ownerProfileId',
  'memberProfileId',
  'audience',
])
export class AudienceMember extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_audience_members_owner')
  ownerProfileId: string;

  @Column({ type: 'uuid' })
  @Index('idx_audience_members_member')
  memberProfileId: string;

  @Column({ type: 'enum', enum: Visibility })
  audience: Visibility;

  constructor(request: Partial<AudienceMember> = {}) {
    super();
    Object.assign(this, request);
  }
}
