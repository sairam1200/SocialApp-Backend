import users from '../features/user';
import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailModule } from './email.module';
import { dependency } from '../infrastructure/dependency';
import { EmailCleanupCron } from '../infrastructure/background/cron/jobs/email-cleanup.cron';
import { LinkedAccount, Role, RoleClaim, User, UserClaim, UserRole, UserLogin, DataProtectionKey, PlaylistMember } from '../domain/entities';

@Module({
  imports: [
    CqrsModule,
    EmailModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      RoleClaim,
      LinkedAccount,
      UserClaim,
      UserRole,
      UserLogin,
      DataProtectionKey,
      PlaylistMember
    ])
  ],
  controllers: [
    ...users.addControllers(),
  ],
  providers: [
    JwtService,
    ...users.addHandlers(),
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.LinkedAccountRepository,
    dependency.UserLoginRepository,
    dependency.DataProtectionKeyRepository,
    EmailCleanupCron
  ],
  exports: [],
})
export class UserModule { }