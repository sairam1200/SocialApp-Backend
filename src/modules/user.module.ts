import users from '../features/user';
import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from '../infrastructure/dependency';
import { LinkedAccount, Role, RoleClaim, User, UserClaim, UserRole } from '../domain/entities';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      RoleClaim,
      LinkedAccount,
      UserClaim,
      UserRole
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
    dependency.LinkedAccountRepository
  ],
  exports: [],
})
export class UserModule { }