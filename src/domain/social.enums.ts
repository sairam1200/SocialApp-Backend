/**
 * Enums for the Community social layer.
 *
 * Kept in their own file rather than appended to `enums.ts` because there are
 * enough of them to drown the existing ones, but re-exported from `enums.ts`
 * so every consumer keeps importing from a single place. Adding a second
 * import path for enums would be exactly the kind of duplication the
 * engineering philosophy in `docs/ENGINEERING_PHILOSOPHY.md` forbids.
 */

/**
 * One table stores every timeline object. `kind` is what distinguishes them.
 *
 * This is deliberate: a comment is a post with a parent, a repost is a post
 * with a target, a story is a post that expires. Splitting them into separate
 * tables would fork visibility filtering, ranking, moderation, metrics and
 * notification fan-out five ways over.
 */
export enum PostKind {
  Update = 'update',
  Photo = 'photo',
  Video = 'video',
  Story = 'story',
  Poll = 'poll',
  Article = 'article',
  Comment = 'comment',
  Repost = 'repost',
  Live = 'live',
  Clip = 'clip',
}

export enum PostStatus {
  Draft = 'draft',
  Scheduled = 'scheduled',
  Published = 'published',
  Archived = 'archived',
  Removed = 'removed',
}

/**
 * Who may see a post or a profile field.
 *
 * The order is meaningful — it runs from widest to narrowest, and
 * `visibility.util.ts` relies on that ordering when it resolves the
 * effective visibility of a reply against its parent.
 */
export enum Visibility {
  Public = 'public',
  Followers = 'followers',
  CloseFriends = 'close_friends',
  BrandPartners = 'brand_partners',
  Private = 'private',
}

/** What a social profile represents. Drives storefronts, campaigns and badges. */
export enum ProfileKind {
  Person = 'person',
  Creator = 'creator',
  Brand = 'brand',
}

export enum ReactionType {
  Like = 'like',
  Celebrate = 'celebrate',
  Insightful = 'insightful',
  Support = 'support',
  Funny = 'funny',
}

/** What a post points at, when it points at something. */
export enum AttachmentKind {
  Moment = 'moment',
  Place = 'place',
  Product = 'product',
  Profile = 'profile',
  Link = 'link',
  Stream = 'stream',
  Course = 'course',
}

export enum MediaKind {
  Image = 'image',
  Video = 'video',
  Audio = 'audio',
  Document = 'document',
}

/** Paid-partnership disclosure. Rendered as a label the author cannot hide. */
export enum DisclosureKind {
  None = 'none',
  PaidPartnership = 'paid_partnership',
  Gifted = 'gifted',
  Affiliate = 'affiliate',
  OwnBrand = 'own_brand',
}

export enum CampaignStatus {
  Draft = 'draft',
  Open = 'open',
  Closed = 'closed',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum CampaignApplicationStatus {
  Applied = 'applied',
  Shortlisted = 'shortlisted',
  Accepted = 'accepted',
  Declined = 'declined',
  Withdrawn = 'withdrawn',
  Delivered = 'delivered',
}

/** Double-entry-ish ledger: every movement of value is one row. */
export enum LedgerEntryKind {
  Tip = 'tip',
  Subscription = 'subscription',
  AffiliateCommission = 'affiliate_commission',
  CampaignPayment = 'campaign_payment',
  ProductSale = 'product_sale',
  Payout = 'payout',
  Adjustment = 'adjustment',
  ReferralReward = 'referral_reward',
}

export enum LedgerEntryStatus {
  Pending = 'pending',
  Cleared = 'cleared',
  Reversed = 'reversed',
  Failed = 'failed',
}

export enum PayoutStatus {
  Requested = 'requested',
  Processing = 'processing',
  Paid = 'paid',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum StreamStatus {
  Idle = 'idle',
  Ready = 'ready',
  Live = 'live',
  Ended = 'ended',
  Errored = 'errored',
}

/** Ingest protocols we accept. All open standards — no proprietary ingest. */
export enum StreamIngestProtocol {
  Rtmp = 'rtmp',
  Srt = 'srt',
  Whip = 'whip',
}

export enum StreamPlaybackProtocol {
  Hls = 'hls',
  LlHls = 'll-hls',
  Whep = 'whep',
}

export enum StreamTargetStatus {
  Disabled = 'disabled',
  Enabled = 'enabled',
  Errored = 'errored',
}

export enum ModerationAction {
  None = 'none',
  Warned = 'warned',
  Muted = 'muted',
  Timeout = 'timeout',
  Banned = 'banned',
  Deleted = 'deleted',
}

export enum ReportReason {
  Spam = 'spam',
  Harassment = 'harassment',
  Nudity = 'nudity',
  Violence = 'violence',
  Misinformation = 'misinformation',
  Impersonation = 'impersonation',
  UndisclosedAd = 'undisclosed_ad',
  Other = 'other',
}

export enum ReportStatus {
  Open = 'open',
  Reviewing = 'reviewing',
  Actioned = 'actioned',
  Dismissed = 'dismissed',
}

/** The two feeds the reader picks between. The choice is theirs, always. */
export enum FeedMode {
  Recommended = 'recommended',
  Latest = 'latest',
}

/**
 * Every implicit and explicit signal the recommender learns from.
 *
 * Weights live in `recommendation/ranking-weights.ts`, not here — this enum is
 * only the vocabulary.
 */
export enum EngagementKind {
  Impression = 'impression',
  Dwell = 'dwell',
  Click = 'click',
  Like = 'like',
  Comment = 'comment',
  Repost = 'repost',
  Share = 'share',
  Bookmark = 'bookmark',
  ProfileVisit = 'profile_visit',
  Follow = 'follow',
  VideoWatch = 'video_watch',
  Purchase = 'purchase',
  NotInterested = 'not_interested',
  Mute = 'mute',
  Block = 'block',
  Report = 'report',
}

/** What the recommender can be asked to rank. One engine, four surfaces. */
export enum RecommendableKind {
  Post = 'post',
  Creator = 'creator',
  Brand = 'brand',
  Product = 'product',
  Course = 'course',
}

export enum ConversationKind {
  Direct = 'direct',
  Group = 'group',
}

export enum CourseLevel {
  Beginner = 'beginner',
  Intermediate = 'intermediate',
  Advanced = 'advanced',
}

export enum LessonKind {
  Article = 'article',
  Video = 'video',
  Quiz = 'quiz',
}

export enum EnrollmentStatus {
  Enrolled = 'enrolled',
  InProgress = 'in_progress',
  Completed = 'completed',
  Abandoned = 'abandoned',
}

export enum InviteStatus {
  Sent = 'sent',
  Accepted = 'accepted',
  Rewarded = 'rewarded',
  Expired = 'expired',
}

export enum SubscriptionStatus {
  Active = 'active',
  PastDue = 'past_due',
  Cancelled = 'cancelled',
  Expired = 'expired',
}

/** How a second factor is delivered. Switchable in Settings → Security. */
export enum TwoFactorMethod {
  Totp = 'totp',
  Email = 'email',
}
