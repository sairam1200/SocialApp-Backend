import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import community from '../features/community';
import { UnifiedSearchController } from '../features/search/unified-search.endpoint';
import { UnifiedSearchService } from '../infrastructure/services/search/unified-search.service';
import { dependency } from '../infrastructure/dependency';
import {
  AffiliateClick,
  AffiliateLink,
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
  StreamModeration,
  StreamSession,
  StreamTarget,
  SubscriptionTier,
  TopicAffinity,
} from '../domain/entities/social';
import {
  ContentStream,
  ExternalJob,
  Project,
  Role,
  RoleClaim,
  Topic,
  User,
  UserBiometric,
  UserClaim,
  UserFollow,
  UserRole,
  UserTopic,
} from '../domain/entities';
import {
  BrandedEmailService,
  CommunityEventListener,
  CommunityProfileService,
  CommunityScheduler,
  ComposerService,
  CreatorAnalyticsService,
  CreatorMatchingService,
  EngagementService,
  ExploreService,
  FeedService,
  InviteService,
  LearningService,
  MessagingService,
  MonetizationService,
  RecommendationService,
  StreamControlService,
  TwoFactorEmailService,
  VisibilityService,
} from '../infrastructure/services/social';

/**
 * Community — the social layer.
 *
 * Registers every social entity with TypeORM, the seven aggregate
 * repositories, the services, the scheduler and the event listener.
 *
 * **Unified search lives here, not in `IntegrationsModule`.** It reaches every
 * source at once — Community posts, profiles, live channels, Gaddr Jobs and
 * aggregated platform content — and all but the last two are already wired
 * here. Registering it in the search module instead would mean duplicating the
 * whole social provider graph into a second module, which is the shape that
 * eventually drifts. `GET /search/results` is untouched and stays where it is.
 *
 * Community dispatches `FollowUserCommand`/`UnfollowUserCommand` rather than
 * keeping a second follow graph. Those handlers are **not** re-registered
 * here: `CqrsModule` scans every module once at bootstrap and registers each
 * handler into one global `CommandBus`, so `FollowModule` registering them is
 * enough. Re-registering would construct a second copy in this module's
 * injector — and fail at boot, because they depend on `ProfileCacheService`,
 * which lives in `ProfileModule`.
 *
 * **`TwoFactorEmailService` and `BrandedEmailService` are exported** because
 * the auth module's 2FA handlers depend on them. Nest resolves a provider in
 * the module where it is *used*, so an unexported service here would fail at
 * boot with "Nest can't resolve dependencies of the LoginCommandHandler" —
 * the same class of failure the C5 guard fix hit. See `AGENTS.md`: after any
 * change to a provider or module, boot the process, because neither typecheck
 * nor unit tests evaluate a DI graph.
 */
@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      // Community
      SocialProfile,
      Post,
      PostMedia,
      PollOption,
      PollVote,
      Reaction,
      Share,
      EngagementEvent,
      TopicAffinity,
      Mute,
      AudienceMember,
      Product,
      PostProduct,
      AffiliateLink,
      AffiliateClick,
      Campaign,
      CampaignApplication,
      SubscriptionTier,
      CreatorSubscription,
      LedgerEntry,
      Payout,
      LiveStream,
      StreamSession,
      StreamTarget,
      StreamClip,
      StreamChatMessage,
      StreamModeration,
      Conversation,
      ConversationMember,
      Message,
      Report,
      Course,
      Lesson,
      Enrollment,
      Certification,
      Invite,
      // Identity, for the follow graph and topic vocabulary
      User,
      UserFollow,
      UserBiometric,
      UserClaim,
      UserRole,
      Role,
      RoleClaim,
      Topic,
      UserTopic,
      // Unified search reaches past Community: aggregated cross-platform
      // content, and Gaddr Jobs over the shared database.
      ContentStream,
      Project,
      ExternalJob,
    ]),
  ],
  controllers: [...community.addControllers(), UnifiedSearchController],
  providers: [
    JwtService,

    dependency.SocialProfileRepository,
    dependency.PostRepository,
    dependency.EngagementRepository,
    dependency.CommerceRepository,
    dependency.StreamRepository,
    dependency.MessagingRepository,
    dependency.LearningRepository,

    // Shared with the rest of the application.
    dependency.IdentityRepository,
    dependency.UserFollowRepository,
    dependency.TopicRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.RoleClaimRepository,
    dependency.EmailService,
    dependency.ContentStreamRepository,
    dependency.GaddrJobsRepository,

    VisibilityService,
    RecommendationService,
    FeedService,
    ComposerService,
    EngagementService,
    CommunityProfileService,
    MessagingService,
    ExploreService,
    MonetizationService,
    CreatorMatchingService,
    CreatorAnalyticsService,
    StreamControlService,
    LearningService,
    InviteService,
    BrandedEmailService,
    TwoFactorEmailService,

    UnifiedSearchService,

    CommunityScheduler,
    CommunityEventListener,
  ],
  exports: [
    UnifiedSearchService,
    BrandedEmailService,
    TwoFactorEmailService,
    FeedService,
    RecommendationService,
    CommunityProfileService,
  ],
})
export class CommunityModule {}
