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
