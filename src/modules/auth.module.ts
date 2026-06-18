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
import { UserClaim, User, Role, UserRole, RoleClaim, UserLogin, LinkedAccount, DataProtectionKey, UserBiometric } from '../domain/entities';

@Module({
  imports: [
    CqrsModule,
    EmailModule,
    AuthGuardsModule,
    NotificationModule,
    AnalyticsModule,
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
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    dependency.LinkedAccountRepository,
    dependency.DataProtectionKeyRepository,
  ],
  controllers: [
    ...authentication.addControllers()
  ],
  exports: [],
})
export class AuthModule { }
