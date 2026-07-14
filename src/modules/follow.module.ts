import follows from '../features/user/following';
import { Module, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dependency } from '../infrastructure/dependency';
import { ProfileModule } from './profile.module';
import {
  Role,
  RoleClaim,
  User,
  UserBiometric,
  UserClaim,
  UserFollow,
  UserRole,
  PlaylistMember,
} from '../domain/entities';
import { FollowUpdatedListener } from '../infrastructure/background/listeners/follow-updated.listener';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      UserFollow,
      User,
      UserBiometric,
      UserClaim,
      Role,
      RoleClaim,
      UserRole,
      PlaylistMember,
    ]),
    ProfileModule,
  ],
  controllers: [...follows.addControllers()],
  providers: [
    JwtService,
    ...follows.addHandlers(),
    dependency.UserRepository,
    dependency.RoleRepository,
    dependency.UserRoleRepository,
    dependency.RoleClaimRepository,
    dependency.UserFollowRepository,
    FollowUpdatedListener,
  ],
  exports: [],
})
export class FollowModule {}
