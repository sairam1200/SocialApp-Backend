import {
  AudienceMember,
  Campaign,
  CampaignApplication,
  Certification,
  Conversation,
  ConversationMember,
  Course,
  CreatorSubscription,
  EngagementEvent,
  Enrollment,
  Invite,
  LedgerEntry,
  Lesson,
  LiveStream,
  Message,
  Mute,
  Payout,
  PollOption,
  PollVote,
  Post,
  PostMedia,
  PostProduct,
  Product,
  Reaction,
  Report,
  Share,
  SocialProfile,
  StreamChatMessage,
  StreamClip,
  StreamSession,
  StreamTarget,
  SubscriptionTier,
  TopicAffinity,
  AffiliateLink,
  AffiliateClick,
} from '../entities/social';
import {
  CampaignStatus,
  FeedMode,
  PostKind,
  PostStatus,
  Visibility,
} from '../enums';
import { PaginatedResult } from './iuserFollow.repository';
import { VisibilityScope } from '../../core/utils/recommendation/visibility-scope';

/**
 * Repository contracts for the Community social layer.
 *
 * Grouped by aggregate rather than by table — a caller that needs a post also
 * needs its media, its poll options and its reaction state, and splitting
 * those across four injectables only moves the joins into the handlers.
 *
 * Every method that reads content takes the viewer's visible levels, because
 * filtering after the query silently shrinks pages and breaks pagination.
 */

/** Shared cursor shape. Keyset pagination — `OFFSET` on a feed is a slow lie. */
export interface FeedCursor {
  /** ISO timestamp of the last item on the previous page. */
  before?: string | null;
  limit: number;
}

export interface FeedQuery extends FeedCursor {
  mode: FeedMode;
  viewerProfileId: string | null;
  /** Audience memberships that decide what this viewer may see. */
  scope: VisibilityScope;
  /** Restrict to these authors. Used by the Latest feed and profile timelines. */
  authorProfileIds?: string[];
  kinds?: PostKind[];
  topics?: string[];
  excludeAuthorProfileIds?: string[];
}

export interface ISocialProfileRepository {
  getByIdAsync(id: string): Promise<SocialProfile | null>;
  getByUserIdAsync(userId: string): Promise<SocialProfile | null>;
  getByHandleAsync(handle: string): Promise<SocialProfile | null>;
  getManyByIdsAsync(ids: string[]): Promise<SocialProfile[]>;
  getByUserIdsAsync(userIds: string[]): Promise<SocialProfile[]>;
  createAsync(profile: SocialProfile): Promise<SocialProfile>;
  updateAsync(
    id: string,
    changes: Partial<SocialProfile>,
  ): Promise<SocialProfile | null>;
  handleExistsAsync(handle: string, exceptId?: string): Promise<boolean>;
  incrementCountersAsync(
    id: string,
    deltas: Partial<
      Pick<SocialProfile, 'followersCount' | 'followingCount' | 'postsCount'>
    >,
  ): Promise<void>;
  searchAsync(
    term: string,
    limit: number,
    kinds?: string[],
  ): Promise<SocialProfile[]>;
  /** Profiles open to brand collaborations, for the matching engine. */
  getCollaborationPoolAsync(
    topics: string[],
    minFollowers: number,
    limit: number,
  ): Promise<SocialProfile[]>;
  getSuggestionsAsync(
    excludeIds: string[],
    topics: string[],
    limit: number,
  ): Promise<SocialProfile[]>;
}

export interface IPostRepository {
  getByIdAsync(id: string): Promise<Post | null>;
  getManyByIdsAsync(ids: string[]): Promise<Post[]>;
  createAsync(post: Post): Promise<Post>;
  updateAsync(id: string, changes: Partial<Post>): Promise<Post | null>;
  deleteAsync(id: string): Promise<void>;

  /** Chronological page. The Latest feed, and the fallback when ranking fails. */
  getFeedPageAsync(query: FeedQuery): Promise<Post[]>;

  /**
   * Candidate ids for the recommender, by source. Returns ids only — hydration
   * happens once, after fusion, instead of once per source.
   */
  getInNetworkCandidateIdsAsync(
    authorProfileIds: string[],
    scope: VisibilityScope,
    sinceHours: number,
    limit: number,
  ): Promise<string[]>;
  getTopicCandidateIdsAsync(
    topics: string[],
    sinceHours: number,
    limit: number,
  ): Promise<string[]>;
  getTrendingCandidateIdsAsync(
    sinceHours: number,
    limit: number,
  ): Promise<string[]>;
  getFreshCandidateIdsAsync(
    sinceHours: number,
    limit: number,
  ): Promise<string[]>;
  getCoEngagementCandidateIdsAsync(
    viewerProfileId: string,
    sinceHours: number,
    limit: number,
  ): Promise<string[]>;
  getSponsoredCandidateIdsAsync(
    topics: string[],
    limit: number,
  ): Promise<string[]>;

  getThreadAsync(
    rootId: string,
    scope: VisibilityScope,
    limit: number,
  ): Promise<Post[]>;
  getRepliesAsync(
    parentId: string,
    scope: VisibilityScope,
    cursor: FeedCursor,
  ): Promise<Post[]>;

  getScheduledDueAsync(now: Date, limit: number): Promise<Post[]>;
  getCalendarAsync(
    authorProfileId: string,
    from: Date,
    to: Date,
    statuses: PostStatus[],
  ): Promise<Post[]>;
  getDraftsAsync(authorProfileId: string, cursor: FeedCursor): Promise<Post[]>;

  incrementCountersAsync(
    id: string,
    deltas: Partial<
      Pick<
        Post,
        | 'likesCount'
        | 'commentsCount'
        | 'repostsCount'
        | 'sharesCount'
        | 'impressionsCount'
        | 'clicksCount'
      >
    >,
  ): Promise<void>;

  searchAsync(
    term: string,
    scope: VisibilityScope,
    limit: number,
  ): Promise<Post[]>;

  /** Media, polls and product tags for a page of posts, in one round trip each. */
  getMediaForPostsAsync(postIds: string[]): Promise<PostMedia[]>;
  getPollOptionsForPostsAsync(postIds: string[]): Promise<PollOption[]>;
  getProductTagsForPostsAsync(postIds: string[]): Promise<PostProduct[]>;
  replaceMediaAsync(postId: string, media: PostMedia[]): Promise<PostMedia[]>;
  replacePollOptionsAsync(
    postId: string,
    options: PollOption[],
  ): Promise<PollOption[]>;
  replaceProductTagsAsync(
    postId: string,
    tags: PostProduct[],
  ): Promise<PostProduct[]>;

  countByAuthorAsync(authorProfileId: string): Promise<number>;
  /** Move expired stories and closed polls out of the live indexes. */
  archiveExpiredAsync(now: Date): Promise<number>;
}

export interface IEngagementRepository {
  getReactionAsync(postId: string, profileId: string): Promise<Reaction | null>;
  getReactionsForPostsAsync(
    postIds: string[],
    profileId: string,
  ): Promise<Reaction[]>;
  upsertReactionAsync(reaction: Reaction): Promise<Reaction>;
  removeReactionAsync(postId: string, profileId: string): Promise<boolean>;

  createShareAsync(share: Share): Promise<Share>;
  getShareByCodeAsync(code: string): Promise<Share | null>;
  incrementShareVisitAsync(code: string): Promise<void>;

  recordEventsAsync(events: EngagementEvent[]): Promise<void>;
  getRecentEventsAsync(
    actorProfileId: string,
    sinceHours: number,
    limit: number,
  ): Promise<EngagementEvent[]>;

  getAffinitiesAsync(profileId: string): Promise<TopicAffinity[]>;
  upsertAffinitiesAsync(affinities: TopicAffinity[]): Promise<void>;
  setAffinityFlagsAsync(
    profileId: string,
    topic: string,
    flags: { isPinned?: boolean; isMuted?: boolean; weight?: number },
  ): Promise<void>;

  getMutedIdsAsync(profileId: string): Promise<string[]>;
  getBlockedPairIdsAsync(profileId: string): Promise<string[]>;
  setMuteAsync(mute: Mute): Promise<Mute>;
  removeMuteAsync(profileId: string, targetProfileId: string): Promise<boolean>;

  getAudienceMembershipAsync(
    ownerProfileId: string,
    memberProfileId: string,
  ): Promise<AudienceMember[]>;
  listAudienceAsync(
    ownerProfileId: string,
    audience: Visibility,
  ): Promise<AudienceMember[]>;
  /** Audiences the viewer has been *granted* by other authors. */
  listAudiencesForMemberAsync(
    memberProfileId: string,
  ): Promise<AudienceMember[]>;
  addToAudienceAsync(member: AudienceMember): Promise<AudienceMember>;
  removeFromAudienceAsync(
    ownerProfileId: string,
    memberProfileId: string,
    audience: Visibility,
  ): Promise<boolean>;

  getPollVoteAsync(
    postId: string,
    voterProfileId: string,
  ): Promise<PollVote | null>;
  getPollVotesForPostsAsync(
    postIds: string[],
    voterProfileId: string,
  ): Promise<PollVote[]>;
  castPollVoteAsync(vote: PollVote): Promise<PollVote>;
  incrementPollOptionAsync(optionId: string, delta: number): Promise<void>;

  createReportAsync(report: Report): Promise<Report>;
  listReportsAsync(status: string | null, limit: number): Promise<Report[]>;
}

export interface ICommerceRepository {
  /* products & storefront */
  getProductAsync(id: string): Promise<Product | null>;
  getProductsAsync(ids: string[]): Promise<Product[]>;
  listProductsAsync(profileId: string, limit: number): Promise<Product[]>;
  saveProductAsync(product: Product): Promise<Product>;
  deleteProductAsync(id: string): Promise<void>;
  searchProductsAsync(term: string, limit: number): Promise<Product[]>;
  getProductCandidateIdsAsync(
    topics: string[],
    limit: number,
  ): Promise<string[]>;
  incrementProductCountersAsync(
    id: string,
    deltas: Partial<Pick<Product, 'clicksCount' | 'salesCount'>>,
  ): Promise<void>;

  /* campaigns */
  getCampaignAsync(id: string): Promise<Campaign | null>;
  listCampaignsAsync(
    filters: {
      brandProfileId?: string;
      status?: CampaignStatus;
      topics?: string[];
    },
    limit: number,
  ): Promise<Campaign[]>;
  saveCampaignAsync(campaign: Campaign): Promise<Campaign>;
  getApplicationAsync(
    campaignId: string,
    creatorProfileId: string,
  ): Promise<CampaignApplication | null>;
  listApplicationsAsync(campaignId: string): Promise<CampaignApplication[]>;
  listApplicationsForCreatorAsync(
    creatorProfileId: string,
  ): Promise<CampaignApplication[]>;
  saveApplicationAsync(
    application: CampaignApplication,
  ): Promise<CampaignApplication>;

  /* affiliate */
  getAffiliateLinkByCodeAsync(code: string): Promise<AffiliateLink | null>;
  listAffiliateLinksAsync(creatorProfileId: string): Promise<AffiliateLink[]>;
  saveAffiliateLinkAsync(link: AffiliateLink): Promise<AffiliateLink>;
  recordAffiliateClickAsync(click: AffiliateClick): Promise<AffiliateClick>;

  /* money */
  createLedgerEntryAsync(entry: LedgerEntry): Promise<LedgerEntry>;
  getLedgerEntryByIdempotencyKeyAsync(key: string): Promise<LedgerEntry | null>;
  listLedgerAsync(profileId: string, limit: number): Promise<LedgerEntry[]>;
  getBalanceMinorAsync(profileId: string): Promise<{
    availableMinor: string;
    pendingMinor: string;
    currency: string;
  }>;
  createPayoutAsync(payout: Payout): Promise<Payout>;
  listPayoutsAsync(profileId: string, limit: number): Promise<Payout[]>;
  updatePayoutAsync(
    id: string,
    changes: Partial<Payout>,
  ): Promise<Payout | null>;

  /* subscriptions */
  listTiersAsync(creatorProfileId: string): Promise<SubscriptionTier[]>;
  getTierAsync(id: string): Promise<SubscriptionTier | null>;
  saveTierAsync(tier: SubscriptionTier): Promise<SubscriptionTier>;
  getSubscriptionAsync(
    tierId: string,
    subscriberProfileId: string,
  ): Promise<CreatorSubscription | null>;
  listSubscriptionsForCreatorAsync(
    creatorProfileId: string,
  ): Promise<CreatorSubscription[]>;
  listSubscriptionsForSubscriberAsync(
    subscriberProfileId: string,
  ): Promise<CreatorSubscription[]>;
  saveSubscriptionAsync(
    subscription: CreatorSubscription,
  ): Promise<CreatorSubscription>;
}

export interface IStreamRepository {
  getByProfileAsync(profileId: string): Promise<LiveStream | null>;
  getByChannelKeyAsync(channelKey: string): Promise<LiveStream | null>;
  getByIdAsync(id: string): Promise<LiveStream | null>;
  saveAsync(stream: LiveStream): Promise<LiveStream>;
  updateAsync(
    id: string,
    changes: Partial<LiveStream>,
  ): Promise<LiveStream | null>;
  listLiveAsync(limit: number): Promise<LiveStream[]>;

  startSessionAsync(session: StreamSession): Promise<StreamSession>;
  endSessionAsync(
    id: string,
    changes: Partial<StreamSession>,
  ): Promise<StreamSession | null>;
  getActiveSessionAsync(streamId: string): Promise<StreamSession | null>;
  listSessionsAsync(streamId: string, limit: number): Promise<StreamSession[]>;

  listTargetsAsync(streamId: string): Promise<StreamTarget[]>;
  saveTargetAsync(target: StreamTarget): Promise<StreamTarget>;
  deleteTargetAsync(id: string): Promise<void>;

  saveClipAsync(clip: StreamClip): Promise<StreamClip>;
  listClipsAsync(streamId: string, limit: number): Promise<StreamClip[]>;

  appendChatAsync(message: StreamChatMessage): Promise<StreamChatMessage>;
  listChatAsync(streamId: string, limit: number): Promise<StreamChatMessage[]>;
  moderateChatAsync(
    id: string,
    changes: Partial<StreamChatMessage>,
  ): Promise<void>;
  getActiveSanctionAsync(
    streamId: string,
    targetProfileId: string,
  ): Promise<{ action: string; expiresOn: Date | null } | null>;
  saveSanctionAsync(sanction: {
    streamId: string;
    targetProfileId: string;
    action: string;
    byProfileId: string;
    reason?: string;
    expiresOn?: Date | null;
  }): Promise<void>;
}

export interface IMessagingRepository {
  getConversationAsync(id: string): Promise<Conversation | null>;
  getDirectConversationAsync(directKey: string): Promise<Conversation | null>;
  createConversationAsync(
    conversation: Conversation,
    members: ConversationMember[],
  ): Promise<Conversation>;
  listConversationsAsync(
    profileId: string,
    cursor: FeedCursor,
  ): Promise<Conversation[]>;
  getMembersAsync(conversationId: string): Promise<ConversationMember[]>;
  getMemberAsync(
    conversationId: string,
    profileId: string,
  ): Promise<ConversationMember | null>;
  updateMemberAsync(
    id: string,
    changes: Partial<ConversationMember>,
  ): Promise<void>;
  appendMessageAsync(message: Message): Promise<Message>;
  listMessagesAsync(
    conversationId: string,
    cursor: FeedCursor,
  ): Promise<Message[]>;
  markReadAsync(conversationId: string, profileId: string): Promise<void>;
  countUnreadAsync(profileId: string): Promise<number>;
  getActiveMembersAsync(
    conversationIds: string[],
  ): Promise<ConversationMember[]>;
}

export interface ILearningRepository {
  getCourseAsync(idOrSlug: string): Promise<Course | null>;
  listCoursesAsync(
    filters: { topics?: string[]; level?: string; publishedOnly?: boolean },
    limit: number,
  ): Promise<Course[]>;
  saveCourseAsync(course: Course): Promise<Course>;
  listLessonsAsync(courseId: string): Promise<Lesson[]>;
  getLessonAsync(id: string): Promise<Lesson | null>;
  saveLessonAsync(lesson: Lesson): Promise<Lesson>;

  getEnrollmentAsync(
    courseId: string,
    profileId: string,
  ): Promise<Enrollment | null>;
  listEnrollmentsAsync(profileId: string): Promise<Enrollment[]>;
  saveEnrollmentAsync(enrollment: Enrollment): Promise<Enrollment>;

  listCertificationsAsync(profileId: string): Promise<Certification[]>;
  getCertificationByCodeAsync(code: string): Promise<Certification | null>;
  saveCertificationAsync(certification: Certification): Promise<Certification>;

  getInviteByCodeAsync(code: string): Promise<Invite | null>;
  listInvitesAsync(inviterProfileId: string): Promise<Invite[]>;
  saveInviteAsync(invite: Invite): Promise<Invite>;
  countAcceptedInvitesAsync(inviterProfileId: string): Promise<number>;
}

export type { PaginatedResult };
