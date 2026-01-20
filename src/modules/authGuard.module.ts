import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { User } from "../domain/entities";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from "../infrastructure/dependency";
import { TurnstileGuard, AdminAccoutGuard, GuestAccoutGuard, UserAccoutGuard } from "../core/passport";

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([User])
  ],
  providers: [
    JwtService,
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
    TurnstileGuard,
    dependency.UserRepository,
  ],
  exports: [
    UserAccoutGuard,
    AdminAccoutGuard,
    GuestAccoutGuard,
    TurnstileGuard,
  ],
})
export class AuthGuardsModule { }