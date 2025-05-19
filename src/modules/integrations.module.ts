import { Module } from "@nestjs/common";
import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../domain/entities/user.entity";
import { Role } from "../domain/entities/role.entity";
import { dependency } from "../infrastructure/dependency";
import { UserRole } from "../domain/entities/userRole.entity";
import { UserLogin } from "../domain/entities/userLogin.entity";
import { LinkedAccount } from "../domain/entities/linkedAccount.entity";
import { DataProtectionKey } from "../domain/entities/dataProtectionKey.entity";
import { YoutubeConnectController } from "../features/integrations/youtube/connect/youtube-connect.endpoint";
import { SpotifyConnectController } from "../features/integrations/spotify/connect/spotify-connect.endpoint";
import { TwitterConnectController } from "../features/integrations/twitter/connect/twitter-connect.endpoint";
import { FacebookImportController } from "../features/integrations/facebook/import/facebook-import.endpoint";
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
    TypeOrmModule.forFeature([
      User,
      UserRole,
      UserLogin,
      Role,
      LinkedAccount,
      DataProtectionKey
    ])
  ],
  controllers: [
    SpotifyConnectController,

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

    SpotifyConnectQueryHandler,
    SpotifyConnectCallbackQueryHandler,

    InstagramConnectQueryHandler,
    InstagramProfileQueryHandler,
    InstagramConnectCallbackQueryHandler,

    FacebookConnectCallbackHandler,
    FacebookConnectQueryHandler,
    FacebookProfileQueryHandler,

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
    dependency.LinkedAccountRepository,
    dependency.DataProtectionKeyRepository,
  ],
  exports: [],
})
export class IntegrationsModule { }