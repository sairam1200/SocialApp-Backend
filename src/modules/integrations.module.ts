import { Module } from "@nestjs/common";
import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { QueuesModule } from "./queues.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { ImportGateway } from "../infrastructure/websocket/gateways/import.gateway";
import { DataProtectionKey, LinkedAccount, Role, User, UserClaim, UserContent, UserLogin, UserRole } from "../domain/entities";
import { FacebookConnectCallbackQueryHandler, FacebookConnectController, FacebookConnectQueryHandler, FacebookImportCommandHandler, FacebookImportController, FacebookProfileController, FacebookProfileQueryHandler, InstagramConnectCallbackQueryHandler, InstagramConnectController, InstagramConnectQueryHandler, InstagramImportCommandHandler, InstagramImportController, InstagramProfileController, InstagramProfileQueryHandler, PinterestConnectCallbackQueryHandler, PinterestConnectController, PinterestConnectQueryHandler, PinterestImportCommandHandler, PinterestImportController, RedditConnectCallbackQueryHandler, RedditConnectController, RedditConnectQueryHandler, RedditImportCommandHandler, RedditImportController, RedditProfileController, RedditProfileQueryHandler, SpotifyConnectCallbackQueryHandler, SpotifyConnectController, SpotifyConnectQueryHandler, SpotifyProfileController, SpotifyProfileQueryHandler, TwiiterConnectQueryHandler, TwitterConnectCallbackQueryHandler, TwitterConnectController, TwitterImportCommandHandler, TwitterImportController, YoutubeConnectCallbackQueryHandler, YoutubeConnectController, YoutubeConnectQueryHandler, YoutubeImportCommandHandler, YoutubeImportController } from "../features/integrations";

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
      UserContent,
      LinkedAccount,
      DataProtectionKey
    ])
  ],
  controllers: [
    SpotifyConnectController,
    SpotifyProfileController,

    FacebookConnectController,
    FacebookProfileController,
    FacebookImportController,

    InstagramConnectController,
    InstagramProfileController,
    InstagramImportController,

    PinterestConnectController,
    PinterestImportController,

    TwitterConnectController,
    TwitterImportController,

    YoutubeConnectController,
    YoutubeImportController,

    RedditConnectController,
    RedditProfileController,
    RedditImportController,
  ],
  providers: [
    ImportGateway,
    JwtService,

    SpotifyConnectQueryHandler,
    SpotifyProfileQueryHandler,
    SpotifyConnectCallbackQueryHandler,

    InstagramConnectCallbackQueryHandler,
    InstagramImportCommandHandler,
    InstagramConnectQueryHandler,
    InstagramProfileQueryHandler,

    FacebookConnectQueryHandler,
    FacebookProfileQueryHandler,
    FacebookImportCommandHandler,
    FacebookConnectCallbackQueryHandler,

    PinterestConnectCallbackQueryHandler,
    PinterestImportCommandHandler,
    PinterestConnectQueryHandler,

    TwiiterConnectQueryHandler,
    TwitterImportCommandHandler,
    TwitterConnectCallbackQueryHandler,

    YoutubeConnectCallbackQueryHandler,
    YoutubeConnectQueryHandler,
    YoutubeImportCommandHandler,

    RedditConnectQueryHandler,
    RedditConnectCallbackQueryHandler,
    RedditProfileQueryHandler,
    RedditImportCommandHandler,

    dependency.RoleRepository,
    dependency.UserRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    dependency.UserContentRepository,
    dependency.LinkedAccountRepository,
    dependency.DataProtectionKeyRepository,
  ],
  exports: [],
})
export class IntegrationsModule { }