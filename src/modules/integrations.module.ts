import { Module } from "@nestjs/common";
import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { BullModule } from '@nestjs/bullmq';
import { QueuesModule } from "./queues.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import integrations from "../features/integrations";
import search from "../features/search";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";

import { AuthGuardsModule } from "./authGuard.module";
import { SearchCacheService, YoutubeWebhookService } from "infrastructure/services";

import { ImportGateway } from "../infrastructure/websocket/gateways/import.gateway";
import { PlatformRollbackListener } from "../infrastructure/background/listeners/platform-rollback.listener";
import { ContentStream, DataProtectionKey, LinkedAccount, Role, SearchHistory, User, UserBiometric, UserClaim, UserContent, UserLogin, UserRole, YoutubeAccount, YoutubeVideo, YoutubeAnalytic, UploadJob } from "../domain/entities";
@Module({
  imports: [
    CqrsModule,
    AuthGuardsModule,
    NotificationModule,
    QueuesModule.register(),
    // Removed duplicate BullModule.registerQueue — all queues are registered
    // in QueuesModule to ensure a single shared Redis connection across all queues
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
      YoutubeAnalytic,
      UploadJob,
    ])
  ],
  controllers: [
    ...integrations.addControllers(),
    ...search.addControllers(),
  ],
  providers: [
    JwtService,
    SearchCacheService,
    PlatformRollbackListener,
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
    dependency.YoutubeAnalyticRepository,
    dependency.UploadJobRepository,
    dependency.YoutubePublishingService,
    dependency.YoutubeAnalyticsService,
  ],
  exports: [],
})
export class IntegrationsModule { }