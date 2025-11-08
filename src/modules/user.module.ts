import users from '../features/user';
import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from '../infrastructure/dependency';
import { EmailCleanupCron } from '../infrastructure/background/cron/jobs/email-cleanup.cron';
import { LinkedAccount, Role, RoleClaim, User, UserClaim, UserRole, UserLogin } from '../domain/entities';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      RoleClaim,
      LinkedAccount,
      UserClaim,
      UserRole,
      UserLogin
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
    EmailCleanupCron
  ],
  exports: [],
})
export class UserModule { }