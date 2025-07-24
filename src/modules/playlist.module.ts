import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import playlist from "../features/playlist";
import { TypeOrmModule } from "@nestjs/typeorm";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { Playlist, PlaylistContent, PlaylistMember, Role, User, UserRole } from "../domain/entities";

@Module({
  imports: [
    CqrsModule,
    NotificationModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      UserRole,
      Playlist,
      PlaylistMember,
      PlaylistContent,
    ])
  ],
  controllers: [
    ...playlist.addControllers(),
  ],
  providers: [
    JwtService,

    ...playlist.addHandlers(),
    dependency.PlaylistRepository,
  ],
  exports: [],
})
export class PlaylistModule { }