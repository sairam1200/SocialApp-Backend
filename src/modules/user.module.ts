import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from '../infrastructure/dependency';
import { Role, RoleClaim, User, UserClaim, UserRole } from '../domain/entities';
import { ChangePasswordController, CreateUserController, CreateUserCommandHandler, GetUserController, GetUserQueryHandler, GetUsersController, GetUsersQueryHandler, UpdateUserCommandHandler, UpdateUserController } from '../features/user';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      RoleClaim,
      UserClaim,
      UserRole
    ])
  ],
  controllers: [
    CreateUserController,
    UpdateUserController,
    GetUsersController,
    ChangePasswordController,
    GetUserController
  ],
  providers: [
    JwtService,
    CreateUserCommandHandler,
    UpdateUserCommandHandler,
    GetUsersQueryHandler,
    GetUserQueryHandler,
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
  ],
  exports: [],
})
export class UserModule { }