import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import {
  CampaignApplicationStatus,
  CampaignStatus,
  LedgerEntryKind,
  LedgerEntryStatus,
  PayoutStatus,
  SubscriptionStatus,
  Visibility,
} from '../../enums';

/** A product in a brand's storefront. Taggable in posts, shoppable in the feed. */
@Entity({ name: 'products', schema: 'social' })
export class Product extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_products_profile')
  profileId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Minor units — cents. Never a float: money in a double is a bug waiting. */
  @Column({ type: 'bigint', nullable: true })
  priceMinor?: string;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  imageUrl?: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  externalUrl?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  sku?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  @Index('idx_products_category')
  category?: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  topics: string[];

  @Column({ type: 'boolean', default: true })
  @Index('idx_products_active')
  isActive: boolean;

  @Column({ type: 'integer', default: 0 })
  clicksCount: number;

  @Column({ type: 'integer', default: 0 })
  salesCount: number;

  /** Commission offered to creators who drive a sale, in basis points. */
  @Column({ type: 'integer', default: 0 })
  affiliateRateBps: number;

  @Column({ type: 'text', nullable: true })
  searchText?: string;

  constructor(request: Partial<Product> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** Product tagged on a post. Renders as a shoppable pin over the media. */
@Entity({ name: 'post_products', schema: 'social' })
@Unique('uq_post_products', ['postId', 'productId'])
export class PostProduct extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_post_products_post')
  postId: string;

  @Column({ type: 'uuid' })
  @Index('idx_post_products_product')
  productId: string;

  /** Normalised 0–1 coordinates of the tag over the media, when placed visually. */
  @Column({ type: 'double precision', nullable: true })
  x?: number;

  @Column({ type: 'double precision', nullable: true })
  y?: number;

  @Column({ type: 'integer', nullable: true })
  mediaIndex?: number;

  constructor(request: Partial<PostProduct> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * A creator's trackable link to a product or any URL.
 *
 * The short code is the unit of attribution: clicks land on our redirector,
 * which records the click and forwards. Commission is settled from
 * `affiliate_clicks` joined to conversions.
 */
@Entity({ name: 'affiliate_links', schema: 'social' })
export class AffiliateLink extends BaseEntity {
  @Column({ type: 'varchar', length: 24, unique: true })
  @Index('idx_affiliate_links_code')
  code: string;

  @Column({ type: 'uuid' })
  @Index('idx_affiliate_links_creator')
  creatorProfileId: string;

  @Column({ type: 'uuid', nullable: true })
  @Index('idx_affiliate_links_product')
  productId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  postId?: string | null;

  @Column({ type: 'varchar', length: 1024 })
  targetUrl: string;

  @Column({ type: 'integer', default: 0 })
  clicksCount: number;

  @Column({ type: 'integer', default: 0 })
  conversionsCount: number;

  @Column({ type: 'bigint', default: 0 })
  earnedMinor: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  constructor(request: Partial<AffiliateLink> = {}) {
    super();
    Object.assign(this, request);
  }
}

@Entity({ name: 'affiliate_clicks', schema: 'social' })
export class AffiliateClick extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_affiliate_clicks_link')
  linkId: string;

  @Column({ type: 'uuid', nullable: true })
  visitorProfileId?: string | null;

  /** Truncated to /24 (or /48) before storage — enough to dedupe, not to identify. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ipPrefix?: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  referrer?: string;

  @Column({ type: 'boolean', default: false })
  converted: boolean;

  @Column({ type: 'bigint', nullable: true })
  conversionValueMinor?: string;

  constructor(request: Partial<AffiliateClick> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** A brand's campaign brief. Creators apply; the matcher ranks them. */
@Entity({ name: 'campaigns', schema: 'social' })
export class Campaign extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_campaigns_brand')
  brandProfileId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  brief: string;

  @Column({ type: 'enum', enum: CampaignStatus, default: CampaignStatus.Draft })
  @Index('idx_campaigns_status')
  status: CampaignStatus;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  topics: string[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  deliverables: string[];

  @Column({ type: 'bigint', nullable: true })
  budgetMinor?: string;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Column({ type: 'integer', nullable: true })
  minFollowers?: number;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  targetCountries: string[];

  @Column({ type: 'timestamptz', nullable: true })
  applicationsCloseOn?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliverBy?: Date | null;

  @Column({ type: 'integer', default: 0 })
  applicationsCount: number;

  @Column({ type: 'text', nullable: true })
  searchText?: string;

  constructor(request: Partial<Campaign> = {}) {
    super();
    Object.assign(this, request);
  }
}

@Entity({ name: 'campaign_applications', schema: 'social' })
@Unique('uq_campaign_applications', ['campaignId', 'creatorProfileId'])
export class CampaignApplication extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_campaign_applications_campaign')
  campaignId: string;

  @Column({ type: 'uuid' })
  @Index('idx_campaign_applications_creator')
  creatorProfileId: string;

  @Column({
    type: 'enum',
    enum: CampaignApplicationStatus,
    default: CampaignApplicationStatus.Applied,
  })
  status: CampaignApplicationStatus;

  @Column({ type: 'text', nullable: true })
  pitch?: string;

  @Column({ type: 'bigint', nullable: true })
  quotedMinor?: string;

  /** Match score at application time, kept for the brand's ranking view. */
  @Column({ type: 'double precision', default: 0 })
  matchScore: number;

  @Column({ type: 'uuid', nullable: true })
  deliveredPostId?: string | null;

  constructor(request: Partial<CampaignApplication> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** A creator's paid tier. Subscribers get `Visibility.CloseFriends`-grade access. */
@Entity({ name: 'subscription_tiers', schema: 'social' })
export class SubscriptionTier extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_subscription_tiers_creator')
  creatorProfileId: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'bigint' })
  priceMinor: string;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  benefits: string[];

  /** Which audience a subscriber joins. Defaults to close friends. */
  @Column({ type: 'enum', enum: Visibility, default: Visibility.CloseFriends })
  grantsAudience: Visibility;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'integer', default: 0 })
  subscribersCount: number;

  constructor(request: Partial<SubscriptionTier> = {}) {
    super();
    Object.assign(this, request);
  }
}

@Entity({ name: 'subscriptions', schema: 'social' })
@Unique('uq_subscriptions', ['tierId', 'subscriberProfileId'])
export class CreatorSubscription extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_subscriptions_tier')
  tierId: string;

  @Column({ type: 'uuid' })
  @Index('idx_subscriptions_creator')
  creatorProfileId: string;

  @Column({ type: 'uuid' })
  @Index('idx_subscriptions_subscriber')
  subscriberProfileId: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.Active,
  })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd?: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  externalSubscriptionId?: string;

  constructor(request: Partial<CreatorSubscription> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * Every movement of value: a tip in, a commission in, a payout out.
 *
 * A balance is `SUM(amountMinor) WHERE status = cleared` — never a mutable
 * column. That is what makes the number reconstructible when something goes
 * wrong, which for money is the only property that matters.
 */
@Entity({ name: 'ledger_entries', schema: 'social' })
@Index('idx_ledger_profile_time', ['profileId', 'createdOn'])
export class LedgerEntry extends BaseEntity {
  @Column({ type: 'uuid' })
  profileId: string;

  @Column({ type: 'enum', enum: LedgerEntryKind })
  @Index('idx_ledger_kind')
  kind: LedgerEntryKind;

  @Column({
    type: 'enum',
    enum: LedgerEntryStatus,
    default: LedgerEntryStatus.Pending,
  })
  @Index('idx_ledger_status')
  status: LedgerEntryStatus;

  /** Signed minor units. Credits positive, debits negative. */
  @Column({ type: 'bigint' })
  amountMinor: string;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  /** Platform fee taken from this entry, for the free tier's accounting. */
  @Column({ type: 'bigint', default: 0 })
  feeMinor: string;

  @Column({ type: 'uuid', nullable: true })
  counterpartyProfileId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  relatedPostId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  relatedEntityId?: string | null;

  /** Caller-supplied idempotency key. Unique — a retried charge cannot double-post. */
  @Column({ type: 'varchar', length: 128, nullable: true, unique: true })
  idempotencyKey?: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  description?: string;

  constructor(request: Partial<LedgerEntry> = {}) {
    super();
    Object.assign(this, request);
  }
}

@Entity({ name: 'payouts', schema: 'social' })
export class Payout extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_payouts_profile')
  profileId: string;

  @Column({ type: 'bigint' })
  amountMinor: string;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Column({ type: 'enum', enum: PayoutStatus, default: PayoutStatus.Requested })
  @Index('idx_payouts_status')
  status: PayoutStatus;

  @Column({ type: 'varchar', length: 40, default: 'stripe' })
  provider: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  externalTransferId?: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  failureReason?: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidOn?: Date | null;

  constructor(request: Partial<Payout> = {}) {
    super();
    Object.assign(this, request);
  }
}
