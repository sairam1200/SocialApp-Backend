import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import profile from "../features/profile";
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { User, Role, UserRole, LinkedAccount, ManualProfile, RoleClaim, UserClaim, PlaylistMember, UserBiometric, UserFollow } from "../domain/entities";
import { AnalyticsModule } from "./analytics.module";

@Module({
  imports: [
    CqrsModule,
    NotificationModule,
    AnalyticsModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      RoleClaim,
      UserClaim,
      UserRole,
      LinkedAccount,
      ManualProfile,
      PlaylistMember,
      UserBiometric,
      UserFollow,
    ])
  ],
  controllers: [...profile.addControllers()],
  providers: [
    JwtService,

    ...profile.addHandlers(),
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.LinkedAccountRepository,
    dependency.ManualProfileRepository,
    dependency.UserFollowRepository,
  ],
  exports: [],
})
export class ProfileModule { }
