import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Globals } from '../../core/globals';
import {
  PlaylistAlreadyExistsException,
  PlaylistMemberNotFoundException,
  PlaylistNotFoundException,
  PlaylistUpdateNotAllowedException,
} from '../../core/exceptions/playlist.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { PlaylistMemberRole } from '../../domain/enums';
import { UserNotFoundException } from '../../core/exceptions';
import { IPlaylistRepository } from '../../domain/repositories';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import {
  User,
  PlaylistMember,
  PlaylistContent,
  Playlist,
} from '../../domain/entities';

@Injectable()
export class PlaylistRepository implements IPlaylistRepository {
  constructor(
    @InjectRepository(User)
    private readonly userContext: Repository<User>,
    @InjectRepository(Playlist)
    private readonly playlistContext: Repository<Playlist>,
    @InjectRepository(PlaylistContent)
    private readonly playlistContentContext: Repository<PlaylistContent>,
    @InjectRepository(PlaylistMember)
    private readonly playlistMemberContext: Repository<PlaylistMember>,
  ) {}

  public async getAsync(userNameOrId: string): Promise<Playlist[]> {
    const ownedPlaylists = await this.playlistContext.find({
      where: [
        { owner: { id: userNameOrId } },
        { owner: { userName: userNameOrId } },
      ],
      relations: ['owner', 'members'],
    });

    const memberEntries = await this.playlistMemberContext.find({
      where: [
        { user: { id: userNameOrId } },
        { user: { userName: userNameOrId } },
      ],
      relations: [
        'playlist',
        'playlist.owner',
        'playlist.members',
        'playlist.members.user',
      ],
    });

    const memberPlaylists = memberEntries.map((e) => e.playlist);

    const all = [...ownedPlaylists, ...memberPlaylists];
    const dedupedMap = new Map<string, Playlist>();
    all.forEach((col) => dedupedMap.set(col.id, col));

    return Array.from(dedupedMap.values());
  }

  public async getByIdAsync(referenceId: string): Promise<Playlist | null> {
    return await this.playlistContext.findOne({
      where: { referenceId },
      relations: ['owner', 'members'],
    });
  }

  public async getContentsAsync(
    referenceId: string,
  ): Promise<PlaylistContent[]> {
    return await this.playlistContentContext.find({
      where: { playlist: { referenceId } },
      relations: ['playlist', 'addedBy'],
    });
  }

  public async getContentAsync(
    referenceId: string,
    contentId: string,
  ): Promise<PlaylistContent | null> {
    return await this.playlistContentContext.findOne({
      where: { id: contentId, playlist: { referenceId } },
      relations: ['playlist', 'addedBy'],
    });
  }

  public async addContentAsync(
    referenceId: string,
    content: PlaylistContent,
  ): Promise<PlaylistContent> {
    const loggedInUserId = HttpContext.getCurrentUserId;
    const member = await this.playlistMemberContext.findOne({
      where: {
        playlist: { referenceId },
        user: { id: loggedInUserId },
      },
      relations: ['playlist', 'user'],
    });

    if (!member) {
      throw new PlaylistUpdateNotAllowedException();
    }

    if (member.role === PlaylistMemberRole.Viewer) {
      throw new PlaylistUpdateNotAllowedException();
    }

    content.playlist = member.playlist;
    content.addedBy = member;

    return await this.playlistContentContext.save(content);
  }

  public async removeContentAsync(
    referenceId: string,
    content: PlaylistContent,
  ): Promise<void> {
    const loggedInUserId = HttpContext.getCurrentUserId;
    const member = await this.playlistMemberContext.findOne({
      where: {
        playlist: { referenceId },
        user: { id: loggedInUserId },
      },
      relations: ['playlist', 'user'],
    });

    if (!member) {
      throw new PlaylistUpdateNotAllowedException(referenceId, 'not-member');
    }

    if (member.role === PlaylistMemberRole.Viewer) {
      throw new PlaylistUpdateNotAllowedException(referenceId, 'viewer');
    }

    await this.playlistContentContext.remove(content);
  }

  public async getByNameAsync(
    userNameOrId: string,
    playlistName: string,
  ): Promise<Playlist | null> {
    return await this.playlistContext.findOne({
      where: [
        { owner: { userName: userNameOrId }, name: playlistName },
        { owner: { id: userNameOrId }, name: playlistName },
      ],
      relations: ['owner', 'members'],
    });
  }

  public async createAsync(playlist: Playlist): Promise<Playlist> {
    const userId = HttpContext.getCurrentUserId;
    const user = await this.userContext.findOne({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundException();
    }

    playlist.owner = user;

    if (playlist.members?.length) {
      playlist.members.forEach((e) => {
        e.playlist = playlist;
      });
    }

    return await this.playlistContext.save(playlist);
  }

  public async updateAsync(playlist: Playlist): Promise<boolean> {
    const existing = await this.playlistContext.findOne({
      where: { id: playlist.id },
      relations: ['owner', 'members'],
    });

    if (!existing) {
      throw new PlaylistNotFoundException(playlist.id);
    }

    const loggedInUserId = HttpContext.user[Globals.ClaimTypes.UserId];
    if (existing.owner.id !== loggedInUserId) {
      throw new PlaylistUpdateNotAllowedException(
        playlist.referenceId,
        'not-owner',
      );
    }

    Object.assign(existing, playlist);
    await this.playlistContext.save(existing);
    return true;
  }

  public async deleteAsync(playlist: Playlist): Promise<void> {
    const loggedInUserId = HttpContext.user[Globals.ClaimTypes.UserId];
    if (playlist.owner.id !== loggedInUserId) {
      throw new PlaylistUpdateNotAllowedException(playlist.referenceId);
    }

    await this.playlistContext.remove(playlist);
  }

  public async addMemberAsync(
    referenceId: string,
    userId: string,
    role: PlaylistMemberRole,
  ): Promise<PlaylistMember> {
    const loggedInUserId = HttpContext.user[Globals.ClaimTypes.UserId];

    const playlist = await this.playlistContext.findOne({
      where: { referenceId },
      relations: ['owner'],
    });

    if (!playlist) {
      throw new PlaylistNotFoundException(referenceId);
    }

    if (playlist.owner.id !== loggedInUserId) {
      throw new PlaylistUpdateNotAllowedException(referenceId, 'not-owner');
    }

    const userToAdd = await this.userContext.findOne({
      where: { id: userId },
    });

    if (!userToAdd) {
      throw new UserNotFoundException();
    }

    const existing = await this.playlistMemberContext.findOne({
      where: {
        playlist: { id: playlist.id },
        user: { id: userToAdd.id },
      },
    });

    if (existing) {
      throw new PlaylistAlreadyExistsException(referenceId);
    }

    const entry = this.playlistMemberContext.create({
      playlist,
      user: userToAdd,
      role,
    });

    return this.playlistMemberContext.save(entry);
  }

  public async removeMemberAsync(
    referenceId: string,
    member: PlaylistMember,
  ): Promise<void> {
    const loggedInUserId = HttpContext.user[Globals.ClaimTypes.UserId];

    const playlist = await this.playlistContext.findOne({
      where: { referenceId },
      relations: ['owner', 'members'],
    });

    if (!playlist) {
      throw new PlaylistNotFoundException(referenceId);
    }

    if (playlist.owner.id !== loggedInUserId) {
      throw new PlaylistUpdateNotAllowedException(referenceId, 'not-owner');
    }

    if (member.user.id === loggedInUserId) {
      throw new PlaylistUpdateNotAllowedException();
    }

    await this.playlistMemberContext.remove(member);
  }

  public async getMembersAsync(referenceId: string): Promise<PlaylistMember[]> {
    return this.playlistMemberContext.find({
      where: { playlist: { id: referenceId } },
      relations: ['user'],
    });
  }

  public async updateMemberRoleAsync(
    referenceId: string,
    memberId: string,
    role: PlaylistMemberRole,
  ): Promise<boolean> {
    const existing = await this.playlistMemberContext.findOne({
      where: {
        playlist: { id: referenceId },
        user: { id: memberId },
      },
    });

    if (!existing) {
      throw new PlaylistMemberNotFoundException(referenceId, memberId);
    }

    existing.role = role;
    await this.playlistMemberContext.save(existing);
    return true;
  }

  public async getMemberAsync(
    referenceId: string,
    memberId: string,
  ): Promise<PlaylistMember | null> {
    const member = await this.playlistMemberContext.findOne({
      where: {
        playlist: { referenceId },
        user: { id: memberId },
      },
      relations: ['playlist', 'user'],
    });

    if (!member) {
      return null;
    }

    return member;
  }
}
