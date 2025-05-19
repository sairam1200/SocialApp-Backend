import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AdminAccoutGuard, GuestAccoutGuard, UserAccoutGuard } from "../core/passport/account.guard";

@Module({
  providers: [
    JwtService,
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
  ],
  exports: [
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
  ],
})
export class AuthGuardsModule { }