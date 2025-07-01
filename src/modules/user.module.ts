import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from '../infrastructure/dependency';
import { LinkedAccount, Role, RoleClaim, User, UserClaim, UserRole } from '../domain/entities';
import { ChangePasswordController, CreateUserController, CreateUserCommandHandler, GetUserController, GetUserQueryHandler, GetUsersController, GetUsersQueryHandler, UpdateUserCommandHandler, UpdateUserController, GetUserLinkedAccountsController, GetUserLinkedAccountsQueryHandler } from '../features/user';

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
    CreateUserController,
    UpdateUserController,
    GetUsersController,
    ChangePasswordController,
    GetUserController,
    GetUserLinkedAccountsController,
  ],
  providers: [
    JwtService,
    CreateUserCommandHandler,
    UpdateUserCommandHandler,
    GetUsersQueryHandler,
    GetUserQueryHandler,
    GetUserLinkedAccountsQueryHandler,
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.LinkedAccountRepository
  ],
  exports: [],
})
export class UserModule { }