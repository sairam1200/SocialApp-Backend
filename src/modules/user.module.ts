import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from '../infrastructure/dependency';
<<<<<<< HEAD
import { UserRole } from "../domain/entities/userRole.entity";
import { RoleClaim } from "../domain/entities/roleClaim.entity";
import { GetUserHandler } from "../features/user/get-user/get-user.handler";
import { GetUsersHandler } from "../features/user/get-users/get-users.handler";
import { GetUserController } from "../features/user/get-user/get-user.endpoint";
import { GetUsersController } from "../features/user/get-users/get-users.endpoint";
import { UpdateUserHandler } from '../features/user/update-user/update-user.handler';
import { CreateUserHandler } from "../features/user/create-user/create-user.handler";
import { CreateUserController } from "../features/user/create-user/create-user.endpoint";
import { UpdateUserController } from '../features/user/update-user/update-user.endpoint';
import { UserClaim } from 'domain/entities';
=======
import { Role, RoleClaim, User, UserClaim, UserRole } from '../domain/entities';
import { ChangePasswordController, CreateUserController, CreateUserCommandHandler, GetUserController, GetUserQueryHandler, GetUsersController, GetUsersQueryHandler, UpdateUserCommandHandler, UpdateUserController } from '../features/user';
>>>>>>> 2458c3f3fe1f01e2edaba253cd77f7ecd0d3353f

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