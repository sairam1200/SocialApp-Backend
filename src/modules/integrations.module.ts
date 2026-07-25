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
import { IntegrationHealthService } from '../infrastructure/services/integrationHealth.service';
import { IntegrationHealthController } from '../features/integrations/health/integration-health.endpoint';
import { SearchCacheService } from 'infrastructure/services';
import { PlatformRollbackListener } from '../infrastructure/background/listeners/platform-rollback.listener';
import { SocialAccountLinkedListener } from '../infrastructure/background/listeners/social-account-linked.listener';
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
@Module({
  imports: [
    CqrsModule,
    AuthGuardsModule,
    NotificationModule,
    AnalyticsModule,
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
    PlatformRollbackListener,
    SocialAccountLinkedListener,
    YoutubeAnalyticsCron,
    ...integrations.addHandlers(),
    ...search.addHandlers(),

    dependency.RoleRepository,
    dependency.IdentityRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    dependency.UserContentRepository,
    dependency.LinkedAccountRepository,
    dependency.DataProtectionKeyRepository,
    dependency.GeneralRepository,
    dependency.ContentStreamRepository,
    dependency.SearchService,
    dependency.SearchHistoryRepository,
    dependency.UserFollowRepository,
    dependency.YoubeWebHookService,
    dependency.PlatformDisconnectService,
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
