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
import { SearchCacheService } from 'infrastructure/services';
import { PlatformRollbackListener } from '../infrastructure/background/listeners/platform-rollback.listener';
import { VideoCodecService } from '../shared/video/video-codec.service';
import { VideoTranscodingService } from '../shared/video/video-transcoding.service';
import {
  ContentStream,
  DataProtectionKey,
  LinkedAccount,
  Role,
  SearchHistory,
  User,
  UserBiometric,
  UserClaim,
  UserContent,
  UserLogin,
  UserRole,
  YoutubeAccount,
  YoutubeVideo,
  UploadJob,
  YoutubeChannelAnalytics,
  YoutubeVideoAnalytics,
  FacebookPageAnalytics,
  FacebookPostAnalytics,
  FacebookVideoAnalytics,
} from '../domain/entities';
import { YoutubeAnalyticsCron } from '../infrastructure/background/cron/jobs/youtube-analytics.cron';
import { FacebookAnalyticsCron } from '../infrastructure/background/cron/jobs/facebook-analytics.cron';
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
      YoutubeChannelAnalytics,
      YoutubeVideoAnalytics,
      FacebookPageAnalytics,
      FacebookPostAnalytics,
      FacebookVideoAnalytics,
    ]),
  ],
  controllers: [...integrations.addControllers(), ...search.addControllers()],
  providers: [
    JwtService,
    SearchCacheService,
    PlatformRollbackListener,
    YoutubeAnalyticsCron,
    ...integrations.addHandlers(),
    ...search.addHandlers(),

    dependency.RoleRepository,
    dependency.UserRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    dependency.UserContentRepository,
    dependency.LinkedAccountRepository,
    dependency.DataProtectionKeyRepository,
    dependency.GeneralRepository,
    dependency.ContentStreamRepository,
    dependency.SearchService,
    dependency.SearchHistoryRepository,
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
    dependency.R2StorageService,
    dependency.YoutubeChannelAnalyticsRepository,
    dependency.YoutubeVideoAnalyticsRepository,
    dependency.YoutubeAnalyticsService,
    dependency.FacebookPageAnalyticsRepository,
    dependency.FacebookPostAnalyticsRepository,
    dependency.FacebookVideoAnalyticsRepository,
    dependency.FacebookAnalyticsService,
    FacebookAnalyticsCron,
    VideoCodecService,
    VideoTranscodingService,
  ],
  exports: [],
})
export class IntegrationsModule {}
