import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { User, UserClaim, UserBiometric } from "../domain/entities";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from "../infrastructure/dependency";
import { TurnstileGuard, AdminAccoutGuard, GuestAccoutGuard, UserAccoutGuard } from "../core/passport";

@Module({
  imports: [
    CqrsModule,
  ],
  providers: [
    JwtService,
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
    TurnstileGuard,
  ],
  exports: [
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
    TurnstileGuard,
  ],
})
export class AuthGuardsModule { }