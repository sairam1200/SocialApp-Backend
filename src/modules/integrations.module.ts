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
import { SpotifyConnectHandler } from "../features/integrations/spotify/connect/spotify-connect.handler";
import { FacebookConnectHandler } from "../features/integrations/facebook/connect/facebook-connect.handler";
import { SpotifyConnectController } from "../features/integrations/spotify/connect/spotify-connect.endpoint";
import { PinterestConnectHandler } from "../features/integrations/pinterest/connect/pinterest-connect.handler";
import { InstagramConnectHandler } from "../features/integrations/instagram/connect/instagram-connect.handler";
import { FacebookConnectController } from "../features/integrations/facebook/connect/facebook-connect.endpoint";
import { InstagramConnectController } from "../features/integrations/instagram/connect/instagram-connect.endpoint";
import { PinterestConnectController } from "../features/integrations/pinterest/connect/pinterest-connect.endpoint";

@Module({
  imports: [CqrsModule, TypeOrmModule.forFeature([User, UserRole, UserLogin, Role, LinkedAccount])],
  controllers: [
    SpotifyConnectController,
    FacebookConnectController,
    InstagramConnectController,
    PinterestConnectController,
  ],
  providers: [
    JwtService,
    FacebookConnectHandler,
    InstagramConnectHandler,
    PinterestConnectHandler,
    SpotifyConnectHandler,

    dependency.RoleRepository,
    dependency.UserRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    dependency.LinkedAccountRepository,
  ],
  exports: [],
})
export class IntegrationsModule { }