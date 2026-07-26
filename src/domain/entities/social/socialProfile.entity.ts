import { Entity, Column, Index, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import { User } from '../identity/user.entity';
import { ProfileKind, Visibility } from '../../enums';

/**
 * The Community-facing identity of a user.
 *
 * Deliberately a satellite of `identity.users` rather than more columns on it:
 * a person can become a creator or a brand without touching the auth tables,
 * and everything monetisation-related stays out of the login path.
 *
 * A brand is not a separate entity type. A brand is a profile with
 * `kind = brand`, which is what lets one storefront, one campaign engine and
 * one recommender serve people, creators and brands without branching.
 */
@Entity({ name: 'profiles', schema: 'social' })
export class SocialProfile extends BaseEntity {
  @Column({ type: 'uuid', unique: true })
  @Index('idx_social_profiles_user')
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  /** Lowercased, unique. The `@handle` used in mentions and public URLs. */
  @Column({ type: 'varchar', length: 64, unique: true })
  @Index('idx_social_profiles_handle')
  handle: string;

  @Column({ type: 'varchar', length: 120 })
  displayName: string;

  @Column({ type: 'enum', enum: ProfileKind, default: ProfileKind.Person })
  @Index('idx_social_profiles_kind')
  kind: ProfileKind;

  @Column({ type: 'varchar', length: 160, nullable: true })
  headline?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  bannerUrl?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  location?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  websiteUrl?: string;

  /** Free-form category — "Fashion", "Developer tools". Feeds brand matching. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  @Index('idx_social_profiles_category')
  category?: string;

  /** Topic slugs this profile is about. Primary signal for creator↔brand matching. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  topics: string[];

  /** Default visibility applied to new posts unless the composer overrides it. */
  @Column({ type: 'enum', enum: Visibility, default: Visibility.Public })
  defaultPostVisibility: Visibility;

  /** Whether the profile itself is discoverable. Enforced in every read path. */
  @Column({ type: 'enum', enum: Visibility, default: Visibility.Public })
  profileVisibility: Visibility;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  /** Creator accepts brand campaigns and appears in the matching pool. */
  @Column({ type: 'boolean', default: false })
  @Index('idx_social_profiles_open_to_collabs')
  openToCollaborations: boolean;

  @Column({ type: 'boolean', default: false })
  tipsEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  subscriptionsEnabled: boolean;

  /** Denormalised counters. Source of truth is the underlying tables; these are read-path caches. */
  @Column({ type: 'integer', default: 0 })
  followersCount: number;

  @Column({ type: 'integer', default: 0 })
  followingCount: number;

  @Column({ type: 'integer', default: 0 })
  postsCount: number;

  /**
   * Rolling reputation in [0,1], recomputed from engagement.
   * Used as an author-quality prior by the ranker, never shown as a raw number.
   */
  @Column({ type: 'double precision', default: 0.5 })
  authorQuality: number;

  /** Media kit / rate card, brand-side matching inputs. Free-form by design. */
  @Column({ type: 'jsonb', nullable: true })
  creatorProfile?: {
    ratePerPost?: number;
    currency?: string;
    audienceCountries?: string[];
    audienceAgeRanges?: string[];
    pastBrands?: string[];
    languages?: string[];
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  brandProfile?: {
    legalName?: string;
    vatNumber?: string;
    industry?: string;
    sizeBucket?: string;
    campaignBudgetCurrency?: string;
  } | null;

  constructor(request: Partial<SocialProfile> = {}) {
    super();
    Object.assign(this, request);
  }
}
