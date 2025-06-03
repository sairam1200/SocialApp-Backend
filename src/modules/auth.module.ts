import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import _const from '../core/utils/const';
import { CqrsModule } from '@nestjs/cqrs';
import { EmailModule } from './email.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../domain/entities/user.entity';
import { Role } from '../domain/entities/role.entity';
import { AuthGuardsModule } from './authGuard.module';
import { dependency } from '../infrastructure/dependency';
import { NotificationModule } from './notification.module';
import { UserRole } from '../domain/entities/userRole.entity';
import { RoleClaim } from '../domain/entities/roleClaim.entity';
import { UserLogin } from '../domain/entities/userLogin.entity';
import { LoginHandler } from '../features/auth/login/login.handler';
import { LoginController } from '../features/auth/login/login.endpoint';
import { LinkedAccount } from '../domain/entities/linkedAccount.entity';
import { RegisterHandler } from '../features/auth/register/register.handler';
import { DataProtectionKey } from '../domain/entities/dataProtectionKey.entity';
import { RegisterController } from '../features/auth/register/register.endpoint';
import { RefreshTokenHandler } from '../features/auth/refresh-token/refresh-token.handler';
import { RefreshTokenController } from '../features/auth/refresh-token/refresh-token.endpoint';
import { ResetPasswordController } from '../features/auth/reset-password/reset-password.endpoint';
import { ResetPasswordCommandHandler } from '../features/auth/reset-password/reset-password.handler';
import { GoogleAuthenticationController } from '../features/auth/external/google-auth/google-auth.endpoint';
import { GoogleConnectQueryHandler, GoogleConnectCallbackQueryHandler } from '../features/auth/external/google-auth/google-auth.handler';

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
      UserRole,
      DataProtectionKey,
      LinkedAccount,
    ]),
  ],
  providers: [
    JwtService,
    LoginHandler,
    RegisterHandler,
    RefreshTokenHandler,
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
