import { Module } from "@nestjs/common";
import _const from "../core/utils/const";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { QueuesModule } from "./queues.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import integrations from "../features/integrations";
import search from "../features/search";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { SearchCacheService, YoutubeWebhookService } from "infrastructure/services";
import { ImportGateway } from "../infrastructure/websocket/gateways/import.gateway";
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
    ...search.addControllers(),
  ],
  providers: [
    ImportGateway,
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
  ],
  exports: [],
})
export class IntegrationsModule { }