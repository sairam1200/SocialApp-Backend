import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Role } from "../domain/entities/role.entity";
import { User } from "../domain/entities/user.entity";
import { dependency } from '../infrastructure/dependency';
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

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      RoleClaim,
      UserRole
    ])
  ],
  controllers: [
    CreateUserController,
    UpdateUserController,
    GetUsersController,
    GetUserController
  ],
  providers: [
    JwtService,
    CreateUserHandler,
    UpdateUserHandler,
    GetUsersHandler,
    GetUserHandler,
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
  ],
  exports: [],
})
export class UserModule { }