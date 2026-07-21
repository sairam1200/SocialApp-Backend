import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dependency } from '../infrastructure/dependency';
import { Permissions } from '../core/utils/permissions.util';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { DataSeeder } from '../infrastructure/services/data.seeder';
import { GetRolesHandler } from '../features/role/get-roles/get-roles.handler';
import { GetRoleController } from '../features/role/get-role/get-role.endpoint';
import { GetRolesController } from '../features/role/get-roles/get-roles.endpoint';
import { CreateRoleHandler } from '../features/role/create-role/create-role.handler';
import { UpdateRoleHandler } from '../features/role/update-role/update-role.handler';
import { GetRoleByIdHandler } from '../features/role/get-role/get-role-by-id.handler';
import { CreateRoleController } from '../features/role/create-role/create-role.endpoint';
import { DeleteRoleController } from '../features/role/delete-role/delete-role.endpoint';
import { UpdateRoleController } from '../features/role/update-role/update-role.endpoint';
import { GetRoleByNameHandler } from '../features/role/get-role/get-role-by-name.handler';
import { ActivateRoleHandler } from '../features/role/activate-role/activate-role.handler';
import {
  User,
  Role,
  UserClaim,
  UserRole,
  RoleClaim,
  UserBiometric,
} from '../domain/entities';
import { ActivateRoleController } from '../features/role/activate-role/activate-role.endpoint';
import { GetPermissionsHandler } from '../features/role/get-permissions/get-permissions.handler';
import { DeactivateRoleHandler } from '../features/role/deactivate-role/deactivate-role.handler';
import { GetPermissionsController } from '../features/role/get-permissions/get-permissions.endpoint';
import { DeactivateRoleController } from '../features/role/deactivate-role/deactivate-role.endpoint';
import { UpdatePermissionsHandler } from '../features/role/update-permissions/update-permissions.handler';
import { UpdatePermissionsController } from '../features/role/update-permissions/update-permissions.endpoint';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      UserBiometric,
      UserClaim,
      RoleClaim,
      UserRole,
    ]),
  ],
  controllers: [
    CreateRoleController,
    GetRolesController,
    GetRoleController,
    UpdateRoleController,
    GetPermissionsController,
    DeactivateRoleController,
    ActivateRoleController,
    DeleteRoleController,
    UpdatePermissionsController,
  ],
  providers: [
    CreateRoleHandler,
    DataSeeder,
    GetRolesHandler,
    GetRoleByIdHandler,
    GetRoleByNameHandler,
    UpdateRoleHandler,
    GetPermissionsHandler,
    ActivateRoleHandler,
    DeactivateRoleHandler,
    UpdatePermissionsHandler,
    Permissions,
    JwtService,
    MetadataScanner,
    DiscoveryService,
    dependency.IdentityRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.RoleClaimRepository,
  ],
  exports: [DataSeeder],
})
export class RoleModule {}
