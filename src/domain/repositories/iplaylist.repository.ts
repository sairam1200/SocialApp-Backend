import { PlaylistMemberRole } from "../enums";
import { Playlist } from "../entities/playlist.entity";
import { PlaylistMember } from "../entities/playlistMember.entity";

export interface IPlaylistRepository {

  getAsync(userNameOrId: string): Promise<Playlist[]>;
  getByIdAsync(referenceId: string): Promise<Playlist | null>;
  getByNameAsync(userNameOrId: string, playlistName: string): Promise<Playlist | null>;
  createAsync(playlist: Playlist): Promise<Playlist>;
  updateAsync(playlist: Playlist): Promise<boolean>;
  deleteAsync(referenceId: string): Promise<void>;

  addMemberAsync(referenceId: string, userId: string, role: PlaylistMemberRole): Promise<PlaylistMember>;
  removeMemberAsync(referenceId: string, memberId: string): Promise<void>;
  getMembersAsync(referenceId: string): Promise<PlaylistMember[]>;
  getMemberAsync(referenceId: string, memberId: string): Promise<PlaylistMember | null>;
  updateMemberRoleAsync(referenceId: string, memberId: string, role: PlaylistMemberRole): Promise<boolean>;
}