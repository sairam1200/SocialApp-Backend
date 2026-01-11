import { Module } from "@nestjs/common";
import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { QueuesModule } from "./queues.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import integrations from "../features/integrations";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { SearchCacheService, YoutubeWebhookService } from "infrastructure/services";
import { ImportGateway } from "../infrastructure/websocket/gateways/import.gateway";
import { RedditImportListener } from "../infrastructure/background/listeners/reddit-import.listener";
import { TiktokImportListener } from "../infrastructure/background/listeners/tiktok-import.listener";
import { TwitterImportListener } from "../infrastructure/background/listeners/twitter-import.listener";
import { YoutubeImportListener } from "../infrastructure/background/listeners/youtube-import.listener";
import { SpotifyImportListener } from "../infrastructure/background/listeners/spotify-import.listener";
import { LinkedInImportListener } from "../infrastructure/background/listeners/linkedin-import.listener";
import { FacebookImportListener } from "../infrastructure/background/listeners/facebook-import.listener";
import { InstagramImportListener } from "../infrastructure/background/listeners/instagram-import.listener";
import { PinterestImportListener } from "../infrastructure/background/listeners/pinterest-import.listener";
import { PlatformRollbackListener } from "../infrastructure/background/listeners/platform-rollback.listener";
import { ContentStream, DataProtectionKey, LinkedAccount, Role, SearchHistory, User, UserBiometric, UserClaim, UserContent, UserLogin, UserRole } from "../domain/entities";

@Module({
  imports: [
    CqrsModule,
    NotificationModule,
    QueuesModule.register(),
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
      ContentStream
    ])
  ],
  controllers: [
    ...integrations.addControllers(),
  ],
  providers: [
    ImportGateway,
    JwtService,
    SearchCacheService,
    YoutubeWebhookService,
    FacebookImportListener,
    YoutubeImportListener,
    PinterestImportListener,
    SpotifyImportListener,
    RedditImportListener,
    TwitterImportListener,
    InstagramImportListener,
    LinkedInImportListener,
    TiktokImportListener,
    PlatformRollbackListener,
    ...integrations.addHandlers(),

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
  ],
  exports: [],
})
export class IntegrationsModule { }