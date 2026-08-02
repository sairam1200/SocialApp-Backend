import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import _const from '../core/utils/const';
import { CqrsModule } from '@nestjs/cqrs';
import { EmailModule } from './email.module';
import authentication from '../features/auth';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuardsModule } from './authGuard.module';
import { dependency } from '../infrastructure/dependency';
import { NotificationModule } from './notification.module';
import { AnalyticsModule } from './analytics.module';
import { CommunityModule } from './community.module';
import {
  UserClaim,
  User,
  Role,
  UserRole,
  RoleClaim,
  UserLogin,
  LinkedAccount,
  DataProtectionKey,
  UserBiometric,
} from '../domain/entities';

@Module({
  imports: [
    CqrsModule,
    EmailModule,
    AuthGuardsModule,
    NotificationModule,
    AnalyticsModule,
    // For `TwoFactorEmailService`, used by the login and 2FA handlers. Nest
    // resolves a provider in the module where it is used, so importing the
    // module that exports it is the only way these handlers construct.
    CommunityModule,
    TypeOrmModule.forFeature([
      UserLogin,
      User,
      Role,
      RoleClaim,
      UserClaim,
      UserRole,
      DataProtectionKey,
      LinkedAccount,
      UserBiometric,
    ]),
  ],
  providers: [
    JwtService,

    ...authentication.addHandlers(),

    dependency.TokenService,
    dependency.IdentityRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    dependency.LinkedAccountRepository,
    dependency.DataProtectionKeyRepository,
    dependency.EmailValidationService,
  ],
  controllers: [...authentication.addControllers()],
  exports: [dependency.TokenService, dependency.EmailValidationService],
})
export class AuthModule {}
