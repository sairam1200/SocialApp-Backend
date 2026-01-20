import users from '../features/user';
import onboarding from '../features/onboarding';
import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailModule } from './email.module';
import { dependency } from '../infrastructure/dependency';
import { EmailCleanupCron } from '../infrastructure/background/cron/jobs/email-cleanup.cron';
import { LinkedAccount, Role, RoleClaim, User, UserClaim, UserRole, UserLogin, DataProtectionKey, PlaylistMember, UserBiometric, Topic, UserTopic } from '../domain/entities';

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
      PlaylistMember,
      UserBiometric,
      Topic,
      UserTopic
    ])
  ],
  controllers: [
    ...users.addControllers(),
    ...onboarding.addControllers()
  ],
  providers: [
    JwtService,
    ...users.addHandlers(),
    ...onboarding.addHandlers(),
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.LinkedAccountRepository,
    dependency.UserLoginRepository,
    dependency.DataProtectionKeyRepository,
    dependency.TopicRepository,
    EmailCleanupCron
  ],
  exports: [],
})
export class UserModule {}

