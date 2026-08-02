import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CqrsModule } from '@nestjs/cqrs';
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
  imports: [CqrsModule],
  providers: [
    JwtService,
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
