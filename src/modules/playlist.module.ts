import { Module } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../domain/entities/user.entity";
import { dependency } from "../infrastructure/dependency";
import { NotificationModule } from "./notification.module";
import { Playlist } from "../domain/entities/playlist.entity";
import { PlaylistMember } from "../domain/entities/playlistMember.entity";
import { PlaylistContent } from "../domain/entities/playlistContent.entity";
import { GetPlaylistController } from "../features/playlist/get-playlist/get-playlist.endpoint";
import { AddPlaylistMemberController } from "../features/playlist/add-member/add-member.endpoint";
import { GetPlaylistsController } from "../features/playlist/get-playlists/get-playlists.endpoint";
import { GetPlaylistsQueryHandler } from "../features/playlist/get-playlists/get-playlists.handler";
import { AddPlaylistMemberCommandHandler } from "../features/playlist/add-member/add-member.handler";
import { AddPlaylistContentController } from "../features/playlist/add-content/add-content.endpoint";
import { AddPlaylistContentCommandHandler } from "../features/playlist/add-content/add-content.handler";
import { CreatePlaylistController } from "../features/playlist/create-playlist/create-playlist.endpoint";
import { DeletePlaylistController } from "../features/playlist/delete-playlist/delete-playlist.endpoint";
import { RemovePlaylistMemberController } from "../features/playlist/remove-member/remove-member.endpoint";
import { GetPlaylistByIdQueryHandler } from "../features/playlist/get-playlist/get-playlist-by-id.handler";
import { CreatePlaylistCommandHandler } from "../features/playlist/create-playlist/create-playlist.handler";
import { DeletePlaylistCommandHandler } from "../features/playlist/delete-playlist/delete-playlist.handler";
import { RemovePlaylistContentController } from "../features/playlist/remove-content/remove-content.endpoint";
import { GetPlaylistByNameQueryHandler } from "../features/playlist/get-playlist/get-playlist-by-name.handler";
import { RemovePlaylistContentCommandHandler } from "../features/playlist/remove-content/remove-content.handler";

@Module({
  imports: [
    CqrsModule,
    NotificationModule,
    TypeOrmModule.forFeature([
      User,
      Playlist,
      PlaylistMember,
      PlaylistContent,
    ])
  ],
  controllers: [
    GetPlaylistController,
    GetPlaylistsController,
    CreatePlaylistController,
    DeletePlaylistController,
    AddPlaylistMemberController,
    AddPlaylistContentController,
    RemovePlaylistMemberController,
    RemovePlaylistContentController,
  ],
  providers: [
    JwtService,

    GetPlaylistsQueryHandler,
    GetPlaylistByIdQueryHandler,
    CreatePlaylistCommandHandler,
    DeletePlaylistCommandHandler,
    GetPlaylistByNameQueryHandler,
    AddPlaylistMemberCommandHandler,
    AddPlaylistContentCommandHandler,
    RemovePlaylistContentCommandHandler,
    dependency.PlaylistRepository,
  ],
  exports: [],
})
export class PlaylistModule { }