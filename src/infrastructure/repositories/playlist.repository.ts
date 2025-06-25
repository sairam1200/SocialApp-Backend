import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { Globals } from "../../core/globals";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "../../domain/entities/user.entity";
import { PlaylistMemberRole } from "../../domain/enums";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";
import { Playlist } from "../../domain/entities/playlist.entity";
import { UserNotFoundException } from "../../core/exceptions/user.exception";
import { PlaylistMember } from "../../domain/entities/playlistMember.entity";
import { IPlaylistRepository } from "../../domain/repositories/iplaylist.repository";
import { PlaylistAlreadyExistsException, PlaylistMemberNotFoundException, PlaylistNotFoundException, PlaylistUpdateNotAllowedException } from "../../core/exceptions/playlist.exception";

@Injectable()
export class PlaylistRepository implements IPlaylistRepository {

  constructor(
    @InjectRepository(User)
    private readonly userContext: Repository<User>,
    @InjectRepository(Playlist)
    private readonly playlistContext: Repository<Playlist>,
    @InjectRepository(PlaylistMember)
    private readonly playlistMemberContext: Repository<PlaylistMember>,
  ) { }

  public async getAsync(userNameOrId: string): Promise<Playlist[]> {

    const ownedPlaylists = await this.playlistContext.find({
      where: [
        { owner: { id: userNameOrId } },
        { owner: { userName: userNameOrId } }
      ],
      relations: ['owner', 'members'],
    });

    const collabEntries = await this.playlistMemberContext.find({
      where: [
        { user: { id: userNameOrId } },
        { user: { userName: userNameOrId } }
      ],
      relations: [
        'playlist',
        'playlist.owner',
        'playlist.members',
        'playlist.members.user',
      ],
    })

    const memberPlaylists = collabEntries.map(e => e.playlist);

    const all = [...ownedPlaylists, ...memberPlaylists];
    const dedupedMap = new Map<string, Playlist>();
    all.forEach(col => dedupedMap.set(col.id, col));

    return Array.from(dedupedMap.values());
  }

  public async getByIdAsync(referenceId: string): Promise<Playlist | null> {

    return await this.playlistContext.findOne({
      where: { referenceId },
      relations: ['owner', 'members'],
    });
  }

  public async getByNameAsync(userNameOrId: string, playlistName: string): Promise<Playlist | null> {

    return await this.playlistContext.findOne({
      where: [
        { owner: { userName: userNameOrId }, name: playlistName },
        { owner: { id: userNameOrId }, name: playlistName }
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
      playlist.members.forEach(e => {
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
      throw new PlaylistUpdateNotAllowedException(playlist.id);
    }

    Object.assign(existing, playlist);
    const result = await this.playlistContext.update(existing.id, existing);
    return result.affected > 0;
  }

  public async deleteAsync(referenceId: string): Promise<void> {
    const playlist = await this.playlistContext.findOne({
      where: { referenceId },
      relations: ['owner', 'members'],
    });

    if (!playlist) {
      throw new PlaylistNotFoundException(referenceId);
    }

    const loggedInUserId = HttpContext.user[Globals.ClaimTypes.UserId];
    if (playlist.owner.id !== loggedInUserId) {
      throw new PlaylistUpdateNotAllowedException(referenceId);
    }

    await this.playlistContext.remove(playlist);
  }

  public async addMemberAsync(referenceId: string, userId: string, role: PlaylistMemberRole): Promise<PlaylistMember> {

    const loggedInUserId = HttpContext.user[Globals.ClaimTypes.UserId];

    const playlist = await this.playlistContext.findOne({
      where: { referenceId },
      relations: ['owner'],
    });

    if (!playlist) {
      throw new PlaylistNotFoundException(referenceId);
    }

    if (playlist.owner.id !== loggedInUserId) {
      throw new PlaylistUpdateNotAllowedException(referenceId);
    }

    const userToAdd = await this.userContext.findOne({
      where: { id: userId },
    });

    if (!userToAdd) {
      throw new UserNotFoundException(userId);
    }

    const existing = await this.playlistMemberContext.findOne({
      where: {
        playlist: { id: playlist.id },
        user: { id: userToAdd.id },
      },
    });

    if (existing) {
      throw new PlaylistAlreadyExistsException(referenceId, userId);
    }

    const entry = this.playlistMemberContext.create({
      playlist,
      user: userToAdd,
      role,
    });

    return this.playlistMemberContext.save(entry);
  }

  public async removeMemberAsync(referenceId: string, memberId: string): Promise<void> {

    const loggedInUserId = HttpContext.user[Globals.ClaimTypes.UserId];

    const collection = await this.playlistContext.findOne({
      where: { referenceId },
      relations: ['owner', 'members'],
    });

    if (!collection) {
      throw new PlaylistNotFoundException(referenceId);
    }

    if (collection.owner.id !== loggedInUserId) {
      throw new PlaylistUpdateNotAllowedException(referenceId);
    }

    const member = await this.playlistMemberContext.findOne({
      where: {
        playlist: { id: collection.id },
        user: { id: memberId },
      },
    });

    if (!member) {
      throw new PlaylistMemberNotFoundException(referenceId, memberId);
    }

    await this.playlistMemberContext.remove(member);
  }

  public async getMembersAsync(referenceId: string): Promise<PlaylistMember[]> {
    return this.playlistMemberContext.find({
      where: { playlist: { id: referenceId } },
      relations: ['user'],
    });
  }

  public async updateMemberRoleAsync(referenceId: string, memberId: string, role: PlaylistMemberRole): Promise<boolean> {

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
    const result = await this.playlistMemberContext.update(existing.id, existing);
    return result.affected > 0;
  }

  public async getMemberAsync(referenceId: string, memberId: string): Promise<PlaylistMember | null> {

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