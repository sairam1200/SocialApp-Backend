import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import _const from '../core/utils/const';
import { CqrsModule } from '@nestjs/cqrs';
import { EmailModule } from './email.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuardsModule } from './authGuard.module';
import { dependency } from '../infrastructure/dependency';
import { NotificationModule } from './notification.module';
import { UserClaim, User, Role, UserRole, RoleClaim, UserLogin, LinkedAccount, DataProtectionKey } from '../domain/entities';
import { GoogleAuthenticationController, GoogleConnectQueryHandler, GoogleConnectCallbackQueryHandler, ResetPasswordController, ResetPasswordCommandHandler, RegisterController, RegisterCommandHandler, LoginController, LoginCommandHandler, RefreshTokenController, RefreshTokenCommandHandler } from '../features/auth';

@Module({
  imports: [
    CqrsModule,
    EmailModule,
    AuthGuardsModule,
    NotificationModule,
    TypeOrmModule.forFeature([
      UserLogin,
      User,
      Role,
      RoleClaim,
      UserClaim,
      UserRole,
      DataProtectionKey,
      LinkedAccount,
    ]),
  ],
  providers: [
    JwtService,
    LoginCommandHandler,
    RegisterCommandHandler,
    RefreshTokenCommandHandler,
    ResetPasswordCommandHandler,
    GoogleConnectQueryHandler,
    dependency.TokenService,
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
    GoogleConnectCallbackQueryHandler,
    dependency.DataProtectionKeyRepository,
    dependency.LinkedAccountRepository,
  ],
  controllers: [
    LoginController,
    RegisterController,
    GoogleAuthenticationController,
    RefreshTokenController,
    ResetPasswordController,
  ],
  exports: [],
})
export class AuthModule { }
