import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import {
  LiveStream,
  StreamChatMessage,
  StreamClip,
  StreamModeration,
  StreamSession,
  StreamTarget,
} from '../../../domain/entities/social';
import {
  ModerationAction,
  StreamStatus,
  Visibility,
} from '../../../domain/enums';
import { IStreamRepository } from '../../../domain/repositories/isocial.repository';

@Injectable()
export class StreamRepository implements IStreamRepository {
  constructor(
    @InjectRepository(LiveStream)
    private readonly streams: Repository<LiveStream>,
    @InjectRepository(StreamSession)
    private readonly sessions: Repository<StreamSession>,
    @InjectRepository(StreamTarget)
    private readonly targets: Repository<StreamTarget>,
    @InjectRepository(StreamClip)
    private readonly clips: Repository<StreamClip>,
    @InjectRepository(StreamChatMessage)
    private readonly chat: Repository<StreamChatMessage>,
    @InjectRepository(StreamModeration)
    private readonly moderation: Repository<StreamModeration>,
  ) {}

  public async getByProfileAsync(
    profileId: string,
  ): Promise<LiveStream | null> {
    if (!profileId) return null;
    return this.streams.findOne({ where: { profileId } });
  }

  public async getByChannelKeyAsync(
    channelKey: string,
  ): Promise<LiveStream | null> {
    if (!channelKey) return null;
    return this.streams.findOne({ where: { channelKey } });
  }

  public async getByIdAsync(id: string): Promise<LiveStream | null> {
    if (!id) return null;
    return this.streams.findOne({ where: { id } });
  }

  public async saveAsync(stream: LiveStream): Promise<LiveStream> {
    return this.streams.save(stream);
  }

  public async updateAsync(
    id: string,
    changes: Partial<LiveStream>,
  ): Promise<LiveStream | null> {
    await this.streams.update(id, changes);
    return this.getByIdAsync(id);
  }

  public async listLiveAsync(limit: number): Promise<LiveStream[]> {
    return this.streams.find({
      where: { status: StreamStatus.Live, visibility: Visibility.Public },
      order: { viewersCount: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  /* --------------------------------------------------------------- sessions */

  public async startSessionAsync(
    session: StreamSession,
  ): Promise<StreamSession> {
    return this.sessions.save(session);
  }

  public async endSessionAsync(
    id: string,
    changes: Partial<StreamSession>,
  ): Promise<StreamSession | null> {
    await this.sessions.update(id, changes);
    return this.sessions.findOne({ where: { id } });
  }

  /** The one session with no end time. There is at most one per channel. */
  public async getActiveSessionAsync(
    streamId: string,
  ): Promise<StreamSession | null> {
    return this.sessions.findOne({
      where: { streamId, endedOn: IsNull() },
      order: { startedOn: 'DESC' },
    });
  }

  public async listSessionsAsync(
    streamId: string,
    limit: number,
  ): Promise<StreamSession[]> {
    return this.sessions.find({
      where: { streamId },
      order: { startedOn: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  /* ---------------------------------------------------------------- targets */

  public async listTargetsAsync(streamId: string): Promise<StreamTarget[]> {
    return this.targets.find({ where: { streamId } });
  }

  public async saveTargetAsync(target: StreamTarget): Promise<StreamTarget> {
    return this.targets.save(target);
  }

  public async deleteTargetAsync(id: string): Promise<void> {
    await this.targets.delete(id);
  }

  /* ------------------------------------------------------------------ clips */

  public async saveClipAsync(clip: StreamClip): Promise<StreamClip> {
    return this.clips.save(clip);
  }

  public async listClipsAsync(
    streamId: string,
    limit: number,
  ): Promise<StreamClip[]> {
    return this.clips.find({
      where: { streamId },
      order: { createdOn: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  /* ------------------------------------------------------------------- chat */

  public async appendChatAsync(
    message: StreamChatMessage,
  ): Promise<StreamChatMessage> {
    return this.chat.save(message);
  }

  /**
   * Newest-first from the database, reversed before returning so the caller
   * gets chronological order without a second sort in every consumer.
   */
  public async listChatAsync(
    streamId: string,
    limit: number,
  ): Promise<StreamChatMessage[]> {
    const rows = await this.chat.find({
      where: { streamId },
      order: { createdOn: 'DESC' },
      take: Math.min(limit, 200),
    });
    return rows.reverse();
  }

  public async moderateChatAsync(
    id: string,
    changes: Partial<StreamChatMessage>,
  ): Promise<void> {
    await this.chat.update(id, changes);
  }

  /**
   * The strongest sanction still in force, if any.
   *
   * An expired timeout must not keep someone muted, so the expiry is part of
   * the query rather than something the caller has to remember to check.
   */
  public async getActiveSanctionAsync(
    streamId: string,
    targetProfileId: string,
  ): Promise<{ action: string; expiresOn: Date | null } | null> {
    const row = await this.moderation
      .createQueryBuilder('m')
      .where('m."streamId" = :streamId', { streamId })
      .andWhere('m."targetProfileId" = :targetProfileId', { targetProfileId })
      .andWhere('m."action" != :none', { none: ModerationAction.None })
      .andWhere('(m."expiresOn" IS NULL OR m."expiresOn" > NOW())')
      .orderBy('m."createdOn"', 'DESC')
      .getOne();
    return row
      ? { action: row.action, expiresOn: row.expiresOn ?? null }
      : null;
  }

  public async saveSanctionAsync(sanction: {
    streamId: string;
    targetProfileId: string;
    action: string;
    byProfileId: string;
    reason?: string;
    expiresOn?: Date | null;
  }): Promise<void> {
    await this.moderation.save(
      new StreamModeration({
        streamId: sanction.streamId,
        targetProfileId: sanction.targetProfileId,
        action: sanction.action as ModerationAction,
        byProfileId: sanction.byProfileId,
        reason: sanction.reason,
        expiresOn: sanction.expiresOn ?? null,
      }),
    );
  }
}
