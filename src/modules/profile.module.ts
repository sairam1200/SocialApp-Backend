import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import profile from "../features/profile";
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { User, Role, UserRole, LinkedAccount, ManualProfile, RoleClaim, UserClaim, PlaylistMember } from "../domain/entities";

@Module({
  imports: [
    CqrsModule,
    NotificationModule,
      TypeOrmModule.forFeature([
      User,
      Role,
      RoleClaim,
      UserClaim,
      UserRole,
      LinkedAccount,
      ManualProfile,
      PlaylistMember,
    ])
  ],
  controllers: [
    ...profile.addControllers(),
  ],
  providers: [
    JwtService,

    ...profile.addHandlers(),
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.LinkedAccountRepository,
    dependency.ManualProfileRepository,
  ],
  exports: [],
})
export class ProfileModule { }