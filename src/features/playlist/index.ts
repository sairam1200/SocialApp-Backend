import { AddPlaylistContentController } from "./add-content/add-content.endpoint";
import { AddPlaylistContentCommandHandler } from "./add-content/add-content.handler";
import { AddPlaylistMemberController } from "./add-member/add-member.endpoint";
import { AddPlaylistMemberCommandHandler } from "./add-member/add-member.handler";
import { CreatePlaylistController } from "./create-playlist/create-playlist.endpoint";
import { CreatePlaylistCommandHandler } from "./create-playlist/create-playlist.handler";
import { DeletePlaylistController } from "./delete-playlist/delete-playlist.endpoint";
import { DeletePlaylistCommandHandler } from "./delete-playlist/delete-playlist.handler";
import { GetPlaylistByIdQueryHandler } from "./get-playlist/get-playlist-by-id.handler";
import { GetPlaylistByNameQueryHandler } from "./get-playlist/get-playlist-by-name.handler";
import { GetPlaylistController } from "./get-playlist/get-playlist.endpoint";
import { GetPlaylistsController } from "./get-playlists/get-playlists.endpoint";
import { GetPlaylistsQueryHandler } from "./get-playlists/get-playlists.handler";
import { RemovePlaylistContentController } from "./remove-content/remove-content.endpoint";
import { RemovePlaylistContentCommandHandler } from "./remove-content/remove-content.handler";
import { RemovePlaylistMemberController } from "./remove-member/remove-member.endpoint";
import { RemovePlaylistMemberCommandHandler } from "./remove-member/remove-member.handler";

const controllers = [
  AddPlaylistContentController,
  AddPlaylistMemberController,
  CreatePlaylistController,
  DeletePlaylistController,
  GetPlaylistController,
  GetPlaylistsController,
  RemovePlaylistContentController,
  RemovePlaylistMemberController,
];

const handlers = [
  AddPlaylistContentCommandHandler,
  AddPlaylistMemberCommandHandler,
  CreatePlaylistCommandHandler,
  DeletePlaylistCommandHandler,
  GetPlaylistByIdQueryHandler,
  GetPlaylistByNameQueryHandler,
  GetPlaylistsQueryHandler,
  RemovePlaylistContentCommandHandler,
  RemovePlaylistMemberCommandHandler,
];

const playlist = {
  addControllers: () => controllers,
  addHandlers: () => handlers,
};

export default playlist;