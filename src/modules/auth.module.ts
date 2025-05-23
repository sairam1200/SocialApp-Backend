import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import _const from '../core/utils/const';
import { CqrsModule } from '@nestjs/cqrs';
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
import { RegisterHandler } from '../features/auth/register/register.handler';
import { RegisterController } from '../features/auth/register/register.endpoint';
import { RefreshTokenHandler } from '../features/auth/refresh-token/refresh-token.handler';
import { RefreshTokenController } from '../features/auth/refresh-token/refresh-token.endpoint';

@Module({
  imports: [
    CqrsModule,
    AuthGuardsModule,
    NotificationModule,
    TypeOrmModule.forFeature([
      UserLogin,
      User,
      Role,
      RoleClaim,
      UserRole
    ])
  ],
  providers: [
    JwtService,
    RegisterHandler,
    LoginHandler,
    RefreshTokenHandler,
    dependency.TokenService,
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.UserLoginRepository,
  ],
  controllers: [RegisterController, LoginController, RefreshTokenController],
  exports: [],
})
export class AuthModule { }