import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../baseEntity';
import {
  ModerationAction,
  StreamIngestProtocol,
  StreamStatus,
  StreamTargetStatus,
  Visibility,
} from '../../enums';

/**
 * A channel that can go live.
 *
 * One per profile, created lazily. The ingest key is long-lived (so OBS keeps
 * working between streams) and rotatable; `sessions` records each broadcast.
 *
 * Ingest and playback are handled by MediaMTX (MIT) — RTMP, SRT and WHIP in,
 * LL-HLS and WHEP out. This row is the control plane: it holds the key, the
 * authorisation, the settings and the state, and the media server calls back
 * into us to authenticate a publisher. See `docs/social/STREAMING.md`.
 */
@Entity({ name: 'live_streams', schema: 'social' })
export class LiveStream extends BaseEntity {
  @Column({ type: 'uuid', unique: true })
  @Index('idx_live_streams_profile')
  profileId: string;

  /** Path segment on the media server. Stable, public, derived from the handle. */
  @Column({ type: 'varchar', length: 64, unique: true })
  @Index('idx_live_streams_channel')
  channelKey: string;

  /**
   * Ingest secret. Encrypted at rest with `cryptoUtils.encrypt` (AES-256-GCM),
   * never returned except to the owner, and rotatable without losing the channel.
   */
  @Column({ type: 'text' })
  ingestKeyEncrypted: string;

  @Column({ type: 'enum', enum: StreamStatus, default: StreamStatus.Idle })
  @Index('idx_live_streams_status')
  status: StreamStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category?: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  topics: string[];

  @Column({ type: 'varchar', length: 1024, nullable: true })
  thumbnailUrl?: string;

  @Column({ type: 'enum', enum: Visibility, default: Visibility.Public })
  visibility: Visibility;

  /** Which ingest protocols this channel accepts. All open standards. */
  @Column({
    type: 'enum',
    enum: StreamIngestProtocol,
    array: true,
    default: () => `'{rtmp,srt,whip}'`,
  })
  allowedIngest: StreamIngestProtocol[];

  /** Ladder the transcoder produces. Empty means passthrough only. */
  @Column({ type: 'jsonb', nullable: true })
  transcodeLadder?: Array<{
    name: string;
    height: number;
    videoBitrateKbps: number;
    audioBitrateKbps: number;
    framerate?: number;
  }> | null;

  @Column({ type: 'boolean', default: true })
  lowLatencyEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  recordVod: boolean;

  @Column({ type: 'boolean', default: true })
  chatEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  chatFollowersOnly: boolean;

  /** Seconds a viewer must wait between chat messages. */
  @Column({ type: 'integer', default: 0 })
  chatSlowModeSeconds: number;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  chatBlockedTerms: string[];

  @Column({ type: 'integer', default: 0 })
  viewersCount: number;

  @Column({ type: 'integer', default: 0 })
  peakViewersCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  startedOn?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedOn?: Date | null;

  /** Post created when the stream went live, so a live shows up in the feed. */
  @Column({ type: 'uuid', nullable: true })
  livePostId?: string | null;

  constructor(request: Partial<LiveStream> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** One broadcast. Kept after the stream ends so VODs and analytics have a home. */
@Entity({ name: 'stream_sessions', schema: 'social' })
export class StreamSession extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_stream_sessions_stream')
  streamId: string;

  @Column({ type: 'enum', enum: StreamIngestProtocol })
  ingestProtocol: StreamIngestProtocol;

  @Column({ type: 'timestamptz' })
  startedOn: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedOn?: Date | null;

  @Column({ type: 'integer', default: 0 })
  peakViewersCount: number;

  @Column({ type: 'double precision', default: 0 })
  totalWatchSeconds: number;

  @Column({ type: 'integer', default: 0 })
  chatMessagesCount: number;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  vodUrl?: string;

  @Column({ type: 'double precision', nullable: true })
  vodDurationSeconds?: number;

  @Column({ type: 'jsonb', nullable: true })
  ingestStats?: {
    bitrateKbps?: number;
    resolution?: string;
    framerate?: number;
    droppedFrames?: number;
    codec?: string;
  } | null;

  constructor(request: Partial<StreamSession> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** A simulcast destination — another platform we push the same stream to. */
@Entity({ name: 'stream_targets', schema: 'social' })
@Unique('uq_stream_targets', ['streamId', 'platform'])
export class StreamTarget extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_stream_targets_stream')
  streamId: string;

  @Column({ type: 'varchar', length: 40 })
  platform: string;

  @Column({ type: 'varchar', length: 512 })
  ingestUrl: string;

  /** Encrypted at rest, same as our own ingest key. */
  @Column({ type: 'text' })
  streamKeyEncrypted: string;

  @Column({
    type: 'enum',
    enum: StreamTargetStatus,
    default: StreamTargetStatus.Enabled,
  })
  status: StreamTargetStatus;

  @Column({ type: 'varchar', length: 400, nullable: true })
  lastError?: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastPushedOn?: Date | null;

  constructor(request: Partial<StreamTarget> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** A clip cut from a live or a VOD. Becomes a post of kind `clip`. */
@Entity({ name: 'stream_clips', schema: 'social' })
export class StreamClip extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_stream_clips_stream')
  streamId: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId?: string | null;

  @Column({ type: 'uuid' })
  creatorProfileId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'double precision' })
  startSeconds: number;

  @Column({ type: 'double precision' })
  endSeconds: number;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  url?: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  thumbnailUrl?: string;

  @Column({ type: 'uuid', nullable: true })
  postId?: string | null;

  @Column({ type: 'integer', default: 0 })
  viewsCount: number;

  constructor(request: Partial<StreamClip> = {}) {
    super();
    Object.assign(this, request);
  }
}

/**
 * Live chat. Persisted rather than fire-and-forget so moderation has evidence,
 * late joiners get scrollback, and the VOD can replay the conversation.
 */
@Entity({ name: 'stream_chat_messages', schema: 'social' })
@Index('idx_stream_chat_stream_time', ['streamId', 'createdOn'])
export class StreamChatMessage extends BaseEntity {
  @Column({ type: 'uuid' })
  streamId: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId?: string | null;

  @Column({ type: 'uuid' })
  authorProfileId: string;

  @Column({ type: 'varchar', length: 500 })
  body: string;

  /** Seconds from stream start, so the VOD can replay chat in sync. */
  @Column({ type: 'double precision', nullable: true })
  offsetSeconds?: number;

  @Column({
    type: 'enum',
    enum: ModerationAction,
    default: ModerationAction.None,
  })
  moderation: ModerationAction;

  @Column({ type: 'uuid', nullable: true })
  moderatedByProfileId?: string | null;

  /** A tip attached to the message, if any. Renders as a highlighted message. */
  @Column({ type: 'bigint', nullable: true })
  tipAmountMinor?: string;

  constructor(request: Partial<StreamChatMessage> = {}) {
    super();
    Object.assign(this, request);
  }
}

/** A moderator or a sanction on a channel. One table, `action` distinguishes. */
@Entity({ name: 'stream_moderation', schema: 'social' })
export class StreamModeration extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index('idx_stream_moderation_stream')
  streamId: string;

  @Column({ type: 'uuid' })
  @Index('idx_stream_moderation_target')
  targetProfileId: string;

  @Column({ type: 'enum', enum: ModerationAction })
  action: ModerationAction;

  @Column({ type: 'uuid' })
  byProfileId: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  reason?: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresOn?: Date | null;

  constructor(request: Partial<StreamModeration> = {}) {
    super();
    Object.assign(this, request);
  }
}
