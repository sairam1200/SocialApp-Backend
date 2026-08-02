import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import integrations from '../features/integrations';
import search from '../features/search';
import { dependency } from '../infrastructure/dependency';
import { NotificationModule } from './notification.module';

import { AuthGuardsModule } from './authGuard.module';
import { AnalyticsModule } from './analytics.module';

import { ProfileModule } from './profile.module';

import { IntegrationHealthService } from '../infrastructure/services/integrationHealth.service';
import { IntegrationHealthController } from '../features/integrations/health/integration-health.endpoint';

import { SearchCacheService } from 'infrastructure/services';
import { ContentIndexCacheListener } from '../infrastructure/background/listeners/content-index-cache.listener';
import { PlatformRollbackListener } from '../infrastructure/background/listeners/platform-rollback.listener';
import { SocialAccountLinkedListener } from '../infrastructure/background/listeners/social-account-linked.listener';
import { LinkedAccountRemovedListener } from '../infrastructure/background/listeners/linked-account-removed.listener';
import { VideoCodecService } from '../shared/video/video-codec.service';
import { VideoTranscodingService } from '../shared/video/video-transcoding.service';
import {
  ContentStream,
  DataProtectionKey,
  LinkedAccount,
  PlaylistMember,
  Project,
  Role,
  SearchHistory,
  User,
  UserBiometric,
  UserClaim,
  UserContent,
  UserFollow,
  UserLogin,
  UserRole,
  YoutubeAccount,
  YoutubeVideo,
  UploadJob,
  PublishJob,
  YoutubeChannelAnalytics,
  YoutubeVideoAnalytics,
  FacebookPageAnalytics,
  FacebookPostAnalytics,
  FacebookVideoAnalytics,
} from '../domain/entities';
import { YoutubeAnalyticsCron } from '../infrastructure/background/cron/jobs/youtube-analytics.cron';
import { FacebookAnalyticsCron } from '../infrastructure/background/cron/jobs/facebook-analytics.cron';
import { R2CleanupCron } from '../infrastructure/background/cron/jobs/r2-cleanup.cron';

// Layered Search Pipeline
import {
  SearchOrchestratorService,
  SEARCH_REPOSITORIES,
  CandidateFactory,
  RankingEngine,
  RankingStrategyRegistry,
  ContentRankingStrategy,
  ProfileRankingStrategy,
  ProjectRankingStrategy,
  JobRankingStrategy,
  loadRankingWeights,
  loadRankingFeatureFlags,
  IRankingStrategy,
  ResponseAdapter,
  SearchIdentityResolver,
} from '../features/search';
import {
  ContentStreamSearchRepository,
  ProfileSearchRepository,
  ProjectSearchRepository,
  JobSearchRepository,
} from '../infrastructure/search/repositories';
@Module({
  imports: [
    CqrsModule,
    AuthGuardsModule,
    NotificationModule,
    AnalyticsModule,
    ProfileModule,
    TypeOrmModule.forFeature([
      User,
      UserRole,
      UserLogin,
      Role,
      UserClaim,
      UserBiometric,
      UserContent,
      LinkedAccount,
      SearchHistory,
      DataProtectionKey,
      ContentStream,
      YoutubeAccount,
      YoutubeVideo,
      UploadJob,
      PublishJob,
      YoutubeChannelAnalytics,
      YoutubeVideoAnalytics,
      FacebookPageAnalytics,
      FacebookPostAnalytics,
      FacebookVideoAnalytics,
      PlaylistMember,
      UserFollow,
      Project,
    ]),
  ],
  controllers: [
    ...integrations.addControllers(),
    ...search.addControllers(),
    // Admin-guarded live probe of every platform credential. Exists because the
    // search fan-out catches per-platform failures, so a dead credential is otherwise
    // indistinguishable from "no results".
    IntegrationHealthController,
  ],
  providers: [
    JwtService,
    IntegrationHealthService,
    SearchCacheService,
    ContentIndexCacheListener,
    PlatformRollbackListener,
    SocialAccountLinkedListener,
    LinkedAccountRemovedListener,
    YoutubeAnalyticsCron,
    ...integrations.addHandlers(),
    ...search.addHandlers(),

    // Layered Search Pipeline
    SearchOrchestratorService,
    CandidateFactory,
    ResponseAdapter,
    SearchIdentityResolver,
    RankingEngine,
    ContentStreamSearchRepository,
    ProfileSearchRepository,
    ProjectSearchRepository,
    JobSearchRepository,
    {
      provide: 'SEARCH_RANKING_WEIGHTS',
      useFactory: () => loadRankingWeights(),
    },
    {
      provide: 'SEARCH_RANKING_FLAGS',
      useFactory: () => loadRankingFeatureFlags(),
    },
    {
      provide: ContentRankingStrategy,
      useFactory: (
        weights: ReturnType<typeof loadRankingWeights>,
        flags: ReturnType<typeof loadRankingFeatureFlags>,
      ) => new ContentRankingStrategy(weights, flags),
      inject: ['SEARCH_RANKING_WEIGHTS', 'SEARCH_RANKING_FLAGS'],
    },
    {
      provide: ProfileRankingStrategy,
      useFactory: (flags: ReturnType<typeof loadRankingFeatureFlags>) =>
        new ProfileRankingStrategy(flags),
      inject: ['SEARCH_RANKING_FLAGS'],
    },
    {
      provide: ProjectRankingStrategy,
      useFactory: (flags: ReturnType<typeof loadRankingFeatureFlags>) =>
        new ProjectRankingStrategy(flags),
      inject: ['SEARCH_RANKING_FLAGS'],
    },
    {
      provide: JobRankingStrategy,
      useFactory: (flags: ReturnType<typeof loadRankingFeatureFlags>) =>
        new JobRankingStrategy(flags),
      inject: ['SEARCH_RANKING_FLAGS'],
    },
    {
      provide: 'SEARCH_RANKING_STRATEGIES',
      useFactory: (
        content: ContentRankingStrategy,
        profile: ProfileRankingStrategy,
        project: ProjectRankingStrategy,
        job: JobRankingStrategy,
      ) => [content, profile, project, job],
      inject: [
        ContentRankingStrategy,
        ProfileRankingStrategy,
        ProjectRankingStrategy,
        JobRankingStrategy,
      ],
    },
    {
      provide: RankingStrategyRegistry,
      useFactory: (strategies: IRankingStrategy[]) => {
        const registry = new RankingStrategyRegistry();
        registry.registerAll(strategies);
        return registry;
      },
      inject: ['SEARCH_RANKING_STRATEGIES'],
    },
    {
      provide: SEARCH_REPOSITORIES,
      useFactory: (
        content: ContentStreamSearchRepository,
        profile: ProfileSearchRepository,
        project: ProjectSearchRepository,
        job: JobSearchRepository,
      ) => [content, profile, project, job],
      inject: [
        ContentStreamSearchRepository,
        ProfileSearchRepository,
        ProjectSearchRepository,
        JobSearchRepository,
      ],
    },

    dependency.RoleRepository,
    dependency.IdentityRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    dependency.UserContentRepository,
    dependency.LinkedAccountRepository,
    dependency.DataProtectionKeyRepository,
    dependency.GeneralRepository,
    dependency.ContentStreamRepository,
    dependency.ContentStreamIndexService,
    dependency.SearchService,
    dependency.SearchHistoryRepository,
    dependency.UserFollowRepository,
    dependency.YoubeWebHookService,
    dependency.PlatformDisconnectService,
    dependency.OwnershipResolver,
    dependency.CreatorIdentityResolver,
    dependency.YoutubeImportService,
    dependency.FacebookImportService,
    dependency.InstagramImportService,
    dependency.TwitterImportService,
    dependency.PinterestImportService,
    dependency.LinkedInImportService,
    dependency.YoutubeAccountRepository,
    dependency.YoutubeVideoRepository,
    dependency.UploadJobRepository,
    dependency.YoutubePublishingService,
    dependency.YoutubeProvider,
    dependency.R2StorageService,
    dependency.PublishJobRepository,
    dependency.PublishProviderRegistry,
    dependency.PublishProviders,
    dependency.OAuthService,
    dependency.YoutubeChannelAnalyticsRepository,
    dependency.YoutubeVideoAnalyticsRepository,
    dependency.YoutubeAnalyticsService,
    dependency.FacebookPageAnalyticsRepository,
    dependency.FacebookPostAnalyticsRepository,
    dependency.FacebookVideoAnalyticsRepository,
    dependency.FacebookAnalyticsService,
    dependency.ProjectRepository,
    dependency.EmailBounceService,
    FacebookAnalyticsCron,
    R2CleanupCron,
    VideoCodecService,
    VideoTranscodingService,
  ],
  exports: [],
})
export class IntegrationsModule {}
