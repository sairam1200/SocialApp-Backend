import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { TurnstileGuard, AdminAccoutGuard, GuestAccoutGuard, UserAccoutGuard} from "core/passport";

@Module({
  providers: [
    JwtService,
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
    TurnstileGuard
  ],
  exports: [
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
    TurnstileGuard,
  ],
})
export class AuthGuardsModule { }