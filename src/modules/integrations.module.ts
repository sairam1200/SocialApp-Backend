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
import { FacebookImportProcessor } from "../infrastructure/background/processors/facebook-import.processor";
import { YoutubeConnectController } from "../features/integrations/youtube/connect/youtube-connect.endpoint";
import { SpotifyConnectController } from "../features/integrations/spotify/connect/spotify-connect.endpoint";
import { TwitterConnectController } from "../features/integrations/twitter/connect/twitter-connect.endpoint";
import { FacebookImportController } from "../features/integrations/facebook/import/facebook-import.endpoint";
import { SpotifyProfileController } from "../features/integrations/spotify/get-profile/get-profile.endpoint";
import { SpotifyProfileQueryHandler } from "../features/integrations/spotify/get-profile/get-profile.handler";
import { FacebookProfileController } from "../features/integrations/facebook/get-profile/get-profile.endpoint";
import { FacebookConnectController } from "../features/integrations/facebook/connect/facebook-connect.endpoint";
import { FacebookProfileQueryHandler } from "../features/integrations/facebook/get-profile/get-profile.handler";
import { InstagramProfileController } from "../features/integrations/instagram/get-profile/get-profile.endpoint";
import { InstagramProfileQueryHandler } from "../features/integrations/instagram/get-profile/get-profile.handler";
import { PinterestConnectController } from "../features/integrations/pinterest/connect/pinterest-connect.endpoint";
import { InstagramConnectController } from "../features/integrations/instagram/connect/instagram-connect.endpoint";
import { FacebookConnectCallbackHandler, FacebookConnectQueryHandler } from "../features/integrations/facebook/connect/facebook-connect.handler";
import { SpotifyConnectCallbackQueryHandler, SpotifyConnectQueryHandler } from "../features/integrations/spotify/connect/spotify-connect.handler";
import { TwiiterConnectQueryHandler, TwitterConnectCallbackQueryHandler } from "../features/integrations/twitter/connect/twitter-connect.handler";
import { YoutubeConnectCallbackQueryHandler, YoutubeConnectQueryHandler } from "../features/integrations/youtube/connect/youtube-connect.handler";
import { PinterestConnectCallbackQueryHandler, PinterestConnectQueryHandler } from "../features/integrations/pinterest/connect/pinterest-connect.handler";
import { InstagramConnectCallbackQueryHandler, InstagramConnectQueryHandler } from "../features/integrations/instagram/connect/instagram-connect.handler";

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

    PinterestConnectController,

    TwitterConnectController,

    YoutubeConnectController,
  ],
  providers: [
    JwtService,
    ImportGateway,

    SpotifyConnectQueryHandler,
    SpotifyProfileQueryHandler,
    SpotifyConnectCallbackQueryHandler,

    InstagramConnectQueryHandler,
    InstagramProfileQueryHandler,
    InstagramConnectCallbackQueryHandler,

    FacebookConnectCallbackHandler,
    FacebookConnectQueryHandler,
    FacebookProfileQueryHandler,
    FacebookImportProcessor,

    PinterestConnectQueryHandler,
    PinterestConnectCallbackQueryHandler,

    TwiiterConnectQueryHandler,
    TwitterConnectCallbackQueryHandler,

    YoutubeConnectQueryHandler,
    YoutubeConnectCallbackQueryHandler,

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