import { Module } from "@nestjs/common";
import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { QueuesModule } from "./queues.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import integrations from "../features/integrations";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { ImportGateway } from "../infrastructure/websocket/gateways/import.gateway";
import { DataProtectionKey, LinkedAccount, Role, User, UserClaim, UserContent, UserLogin, UserRole } from "../domain/entities";

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
    ...integrations.addControllers(),
  ],
  providers: [
    ImportGateway,
    JwtService,

    ...integrations.addHandlers(),

    dependency.RoleRepository,
    dependency.UserRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    dependency.UserContentRepository,
    dependency.LinkedAccountRepository,
    dependency.DataProtectionKeyRepository,
    dependency.GeneralRepository,
  ],
  exports: [],
})
export class IntegrationsModule { }