import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import {
  AttachmentKind,
  DisclosureKind,
  PostKind,
  PostStatus,
  Visibility,
} from '../../enums';
import { SocialProfile } from './socialProfile.entity';

/**
 * A place a post can point at. Kept inline rather than in its own table because
 * it is always read with the post and never queried on its own.
 */
export interface PostPlace {
  name: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
  externalId?: string;
}

/** A resolved link preview — title, description, image, canonical URL. */
export interface PostLinkPreview {
  url: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

/**
 * Every object on a timeline is a row here.
 *
 * A comment is a post with `parentId`. A repost is a post with `repostOfId`. A
 * quote is a repost that also has a body. A story is a post with `expiresOn`.
 * A poll is a post with `poll_options` rows. A live is a post bound to a
 * stream. One table means one visibility filter, one ranker, one moderation
 * queue, one notification fan-out, one analytics rollup — instead of ten of
 * each drifting apart.
 *
 * `rootId` is the top of the thread and is denormalised so a whole conversation
 * loads in one indexed query rather than a recursive walk.
 */
@Entity({ name: 'posts', schema: 'social' })
@Index('idx_posts_feed', ['status', 'publishedOn'])
@Index('idx_posts_author_feed', ['authorProfileId', 'status', 'publishedOn'])
export class Post extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_posts_author')
  authorProfileId: string;

  @ManyToOne(() => SocialProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorProfileId' })
  author?: SocialProfile;

  @Column({ type: 'enum', enum: PostKind, default: PostKind.Update })
  @Index('idx_posts_kind')
  kind: PostKind;

  @Column({ type: 'enum', enum: PostStatus, default: PostStatus.Draft })
  @Index('idx_posts_status')
  status: PostStatus;

  @Column({ type: 'enum', enum: Visibility, default: Visibility.Public })
  @Index('idx_posts_visibility')
  visibility: Visibility;

  @Column({ type: 'text', nullable: true })
  body?: string;

  /** Direct parent — set on comments and replies. */
  @Column({ type: 'uuid', nullable: true })
  @Index('idx_posts_parent')
  parentId?: string | null;

  /** Top of the thread. Equals `id` for a root post. */
  @Column({ type: 'uuid', nullable: true })
  @Index('idx_posts_root')
  rootId?: string | null;

  /** Set on a repost; when `body` is also set the client renders a quote. */
  @Column({ type: 'uuid', nullable: true })
  @Index('idx_posts_repost_of')
  repostOfId?: string | null;

  /** What this post shares: a moment, a place, a product, a profile, a link. */
  @Column({ type: 'enum', enum: AttachmentKind, nullable: true })
  attachmentKind?: AttachmentKind | null;

  /** Id of the attached entity when the attachment is one of ours. */
  @Column({ type: 'uuid', nullable: true })
  @Index('idx_posts_attachment_target')
  attachmentTargetId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  place?: PostPlace | null;

  @Column({ type: 'jsonb', nullable: true })
  linkPreview?: PostLinkPreview | null;

  @Column({ type: 'uuid', nullable: true })
  @Index('idx_posts_stream')
  streamId?: string | null;

  /** Hashtags, lowercased and de-duplicated at write time. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  /** Topic slugs, from the author plus the classifier. Drives topical retrieval. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  topics: string[];

  /** Profile ids mentioned in the body. Powers notifications and the graph. */
  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  mentionedProfileIds: string[];

  /* ---------------------------------------------------------------- sponsored */

  @Column({ type: 'boolean', default: false })
  @Index('idx_posts_sponsored')
  isSponsored: boolean;

  /**
   * Disclosure is stored on the post, not derived at render time, so the label
   * survives export, syndication and the metadata we emit for external shares.
   */
  @Column({
    type: 'enum',
    enum: DisclosureKind,
    default: DisclosureKind.None,
  })
  disclosure: DisclosureKind;

  @Column({ type: 'uuid', nullable: true })
  @Index('idx_posts_sponsor')
  sponsorProfileId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  campaignId?: string | null;

  /* ------------------------------------------------------------- scheduling */

  @Column({ type: 'timestamptz', nullable: true })
  @Index('idx_posts_scheduled_for')
  scheduledFor?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedOn?: Date | null;

  /** Stories set this. A post past its expiry is filtered from every read path. */
  @Column({ type: 'timestamptz', nullable: true })
  @Index('idx_posts_expires_on')
  expiresOn?: Date | null;

  /* --------------------------------------------------------------- counters */

  @Column({ type: 'integer', default: 0 })
  likesCount: number;

  @Column({ type: 'integer', default: 0 })
  commentsCount: number;

  @Column({ type: 'integer', default: 0 })
  repostsCount: number;

  @Column({ type: 'integer', default: 0 })
  sharesCount: number;

  @Column({ type: 'integer', default: 0 })
  impressionsCount: number;

  @Column({ type: 'integer', default: 0 })
  clicksCount: number;

  /** Cached ranking score, refreshed by the scoring job. Never trusted for auth. */
  @Column({ type: 'double precision', default: 0 })
  @Index('idx_posts_hot_score')
  hotScore: number;

  /**
   * Denormalised search document (body + tags + topics + author handle).
   * Written by the application, not by a column default — a bulk INSERT that
   * names its columns skips defaults, which is how `searchText` landed NULL on
   * `contentStreams`. See `AGENTS.md`.
   */
  @Column({ type: 'text', nullable: true })
  searchText?: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  language?: string;

  /** Where this was published besides here, and what came back. */
  @Column({ type: 'jsonb', nullable: true })
  externalTargets?: Array<{
    platform: string;
    status: 'pending' | 'published' | 'failed' | 'skipped';
    externalId?: string;
    externalUrl?: string;
    error?: string;
  }> | null;

  constructor(request: Partial<Post> = {}) {
    super();
    Object.assign(this, request);
  }
}
