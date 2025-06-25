import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../domain/entities/user.entity";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { Playlist } from "../domain/entities/playlist.entity";
import { PlaylistMember } from "../domain/entities/playlistMember.entity";
import { GetPlaylistController } from "../features/playlist/get-playlist/get-playlist.endpoint";
import { AddPlaylistMemberController } from "../features/playlist/add-member/add-member.endpoint";
import { GetPlaylistsController } from "../features/playlist/get-playlists/get-playlists.endpoint";
import { GetPlaylistsQueryHandler } from "../features/playlist/get-playlists/get-playlists.handler";
import { AddPlaylistMemberCommandHandler } from "../features/playlist/add-member/add-member.handler";
import { CreatePlaylistController } from "../features/playlist/create-playlist/create-playlist.endpoint";
import { GetPlaylistByIdQueryHandler } from "../features/playlist/get-playlist/get-playlist-by-id.handler";
import { CreatePlaylistCommandHandler } from "../features/playlist/create-playlist/create-playlist.handler";
import { GetPlaylistByNameQueryHandler } from "../features/playlist/get-playlist/get-playlist-by-name.handler";

@Module({
  imports: [
    CqrsModule,
    NotificationModule,
    TypeOrmModule.forFeature([
      User,
      Playlist,
      PlaylistMember,
    ])
  ],
  controllers: [
    CreatePlaylistController,
    GetPlaylistController,
    GetPlaylistsController,
    AddPlaylistMemberController,
  ],
  providers: [
    JwtService,

    CreatePlaylistCommandHandler,
    GetPlaylistByIdQueryHandler,
    GetPlaylistByNameQueryHandler,
    GetPlaylistsQueryHandler,
    AddPlaylistMemberCommandHandler,
    dependency.PlaylistRepository,
  ],
  exports: [],
})
export class PlaylistModule { }