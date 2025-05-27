import { Module } from "@nestjs/common";
import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { QueuesModule } from "./queues.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../domain/entities/user.entity";
import { Role } from "../domain/entities/role.entity";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { UserRole } from "../domain/entities/userRole.entity";
import { UserLogin } from "../domain/entities/userLogin.entity";
import { UserContent } from "../domain/entities/userContent.entity";
import { LinkedAccount } from "../domain/entities/linkedAccount.entity";
import { DataProtectionKey } from "../domain/entities/dataProtectionKey.entity";
import { ImportGateway } from "../infrastructure/websocket/gateways/import.gateway";
import { YoutubeImportController } from "../features/integrations/youtube/import/youtube-import.endpoint";
import { TwitterImportController } from "../features/integrations/twitter/import/twitter-import.endpoint";
import { YoutubeConnectController } from "../features/integrations/youtube/connect/youtube-connect.endpoint";
import { SpotifyConnectController } from "../features/integrations/spotify/connect/spotify-connect.endpoint";
import { TwitterConnectController } from "../features/integrations/twitter/connect/twitter-connect.endpoint";
import { FacebookImportController } from "../features/integrations/facebook/import/facebook-import.endpoint";
import { SpotifyProfileController } from "../features/integrations/spotify/get-profile/get-profile.endpoint";
import { TwitterImportCommandHandler } from "../features/integrations/twitter/import/twitter-import.handler";
import { YoutubeImportCommandHandler } from "../features/integrations/youtube/import/youtube-import.handler";
import { SpotifyProfileQueryHandler } from "../features/integrations/spotify/get-profile/get-profile.handler";
import { FacebookProfileController } from "../features/integrations/facebook/get-profile/get-profile.endpoint";
import { FacebookConnectController } from "../features/integrations/facebook/connect/facebook-connect.endpoint";
import { FacebookProfileQueryHandler } from "../features/integrations/facebook/get-profile/get-profile.handler";
import { FacebookImportCommandHandler } from "../features/integrations/facebook/import/facebook-import.handler";
import { PinterestImportController } from "../features/integrations/pinterest/import/pinterest-import.endpoint";
import { InstagramImportController } from "../features/integrations/instagram/import/instagram-import.endpoint";
import { InstagramProfileController } from "../features/integrations/instagram/get-profile/get-profile.endpoint";
import { InstagramProfileQueryHandler } from "../features/integrations/instagram/get-profile/get-profile.handler";
import { PinterestConnectController } from "../features/integrations/pinterest/connect/pinterest-connect.endpoint";
import { PinterestImportCommandHandler } from "../features/integrations/pinterest/import/pinterest-import.handler";
import { InstagramConnectController } from "../features/integrations/instagram/connect/instagram-connect.endpoint";
import { FacebookConnectCallbackQueryHandler, FacebookConnectQueryHandler } from "../features/integrations/facebook/connect/facebook-connect.handler";
import { SpotifyConnectCallbackQueryHandler, SpotifyConnectQueryHandler } from "../features/integrations/spotify/connect/spotify-connect.handler";
import { TwiiterConnectQueryHandler, TwitterConnectCallbackQueryHandler } from "../features/integrations/twitter/connect/twitter-connect.handler";
import { YoutubeConnectCallbackQueryHandler, YoutubeConnectQueryHandler } from "../features/integrations/youtube/connect/youtube-connect.handler";
import { PinterestConnectCallbackQueryHandler, PinterestConnectQueryHandler } from "../features/integrations/pinterest/connect/pinterest-connect.handler";
import { InstagramConnectCallbackQueryHandler, InstagramConnectQueryHandler } from "../features/integrations/instagram/connect/instagram-connect.handler";
import { InstagramImportCommandHandler } from "features/integrations/instagram/import/instagram-import.handler";

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