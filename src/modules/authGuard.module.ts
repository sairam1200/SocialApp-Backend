import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dependency } from '../infrastructure/dependency';
import {
  Role,
  User,
  UserBiometric,
  UserClaim,
  UserLogin,
  UserRole,
} from '../domain/entities';
import {
  TurnstileGuard,
  AdminAccoutGuard,
  GuestAccoutGuard,
  UserAccoutGuard,
  OnboardingGuard,
} from '../core/passport';

@Module({
  // TypeOrmModule + IdentityRepository are needed because the account guards now fall
  // back to the database when the session cache misses, rather than skipping the
  // revocation check (finding C5).
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([
      User,
      UserRole,
      UserLogin,
      Role,
      UserClaim,
      UserBiometric,
    ]),
  ],
  providers: [
    JwtService,
    dependency.IdentityRepository,
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
    TurnstileGuard,
    OnboardingGuard,
  ],
  exports: [
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
    TurnstileGuard,
    OnboardingGuard,
  ],
})
export class AuthGuardsModule {}
