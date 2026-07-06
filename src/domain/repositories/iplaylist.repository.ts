import { PlaylistMemberRole } from '../enums';
import { Playlist } from '../entities/collection/playlist.entity';
import { PlaylistMember } from '../entities/collection/playlistMember.entity';
import { PlaylistContent } from '../entities/collection/playlistContent.entity';

export interface IPlaylistRepository {
  getByNameAsync(
    userNameOrId: string,
    playlistName: string,
  ): Promise<Playlist | null>;
  getByIdAsync(referenceId: string): Promise<Playlist | null>;
  getAsync(userNameOrId: string): Promise<Playlist[]>;
  createAsync(playlist: Playlist): Promise<Playlist>;
  updateAsync(playlist: Playlist): Promise<boolean>;
  deleteAsync(playlist: Playlist): Promise<void>;

  getContentsAsync(referenceId: string): Promise<PlaylistContent[]>;
  removeContentAsync(
    referenceId: string,
    content: PlaylistContent,
  ): Promise<void>;
  addContentAsync(
    referenceId: string,
    content: PlaylistContent,
  ): Promise<PlaylistContent>;
  getContentAsync(
    referenceId: string,
    contentId: string,
  ): Promise<PlaylistContent | null>;

  getMembersAsync(referenceId: string): Promise<PlaylistMember[]>;
  removeMemberAsync(referenceId: string, member: PlaylistMember): Promise<void>;
  getMemberAsync(
    referenceId: string,
    memberId: string,
  ): Promise<PlaylistMember | null>;
  addMemberAsync(
    referenceId: string,
    userId: string,
    role: PlaylistMemberRole,
  ): Promise<PlaylistMember>;
  updateMemberRoleAsync(
    referenceId: string,
    memberId: string,
    role: PlaylistMemberRole,
  ): Promise<boolean>;
}
