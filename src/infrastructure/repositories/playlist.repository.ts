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
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userNameOrId,
      );

    const ownedPlaylists = await this.playlistContext.find({
      where: isUuid
        ? [{ owner: { id: userNameOrId } }]
        : [{ owner: { userName: userNameOrId } }],
      relations: ['owner', 'members', 'members.user', 'members.playlist'],
    });

    const memberEntries = await this.playlistMemberContext.find({
      where: isUuid
        ? [{ user: { id: userNameOrId } }]
        : [{ user: { userName: userNameOrId } }],
      relations: [
        'playlist',
        'playlist.owner',
        'playlist.members',
        'playlist.members.user',
        'playlist.members.playlist',
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
      relations: [
        'owner',
        'members',
        'members.user',
        'members.playlist',
        'contents',
        'contents.playlist',
        'contents.userContent',
        'contents.addedBy',
        'contents.addedBy.user',
      ],
    });
  }

  public async getContentsAsync(
    referenceId: string,
  ): Promise<PlaylistContent[]> {
    return await this.playlistContentContext.find({
      where: { playlist: { referenceId } },
      relations: ['playlist', 'addedBy', 'addedBy.user'],
    });
  }

  public async getContentAsync(
    referenceId: string,
    contentId: string,
  ): Promise<PlaylistContent | null> {
    return await this.playlistContentContext.findOne({
      where: { id: contentId, playlist: { referenceId } },
      relations: ['playlist', 'addedBy', 'addedBy.user'],
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

    const saved = await this.playlistContentContext.save(content);

    return await this.playlistContentContext.findOne({
      where: { id: saved.id },
      relations: ['playlist', 'addedBy', 'addedBy.user', 'userContent'],
    });
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
      relations: ['owner', 'members', 'members.user', 'members.playlist', 'contents', 'contents.playlist', 'contents.userContent', 'contents.addedBy', 'contents.addedBy.user'],
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

    const saved = await this.playlistContext.save(playlist);

    if (!saved.members?.length) {
      const ownerMember = this.playlistMemberContext.create({
        playlist: saved,
        user: user,
        role: PlaylistMemberRole.Owner,
      });
      await this.playlistMemberContext.save(ownerMember);
      saved.members = [ownerMember];
    }

    return saved;
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
        id: memberId,
      },
      relations: ['playlist', 'user'],
    });

    if (!member) {
      return null;
    }

    return member;
  }

  public async isContentInPlaylist(
    playlistReferenceId: string,
    userContentId: string,
  ): Promise<boolean> {
    const count = await this.playlistContentContext
      .createQueryBuilder('pc')
      .innerJoin('pc.playlist', 'p')
      .where('p."referenceId" = :playlistReferenceId', { playlistReferenceId })
      .andWhere('pc."userContentId" = :userContentId', { userContentId })
      .getCount();

    return count > 0;
  }

  public async getContentIdsInPlaylist(
    playlistReferenceId: string,
    userContentIds: string[],
  ): Promise<string[]> {
    if (userContentIds.length === 0) {
      return [];
    }

    const rows = await this.playlistContentContext
      .createQueryBuilder('pc')
      .innerJoin('pc.playlist', 'p')
      .select('pc."userContentId"')
      .where('p."referenceId" = :playlistReferenceId', { playlistReferenceId })
      .andWhere('pc."userContentId" IN (:...userContentIds)', {
        userContentIds,
      })
      .getMany();

    return rows.map((r) => r.userContentId).filter((id): id is string => !!id);
  }
}
