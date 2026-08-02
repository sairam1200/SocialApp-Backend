import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';
import configs from '../../../configs';
import _const from '../../../core/utils/const';
import { cryptoUtils } from '../../../core/utils/crypto.util';
import logger from '../../../core/utils/winston.util';
import {
  LiveStream,
  StreamChatMessage,
  StreamClip,
  StreamSession,
  StreamTarget,
} from '../../../domain/entities/social';
import {
  ModerationAction,
  PostKind,
  StreamIngestProtocol,
  StreamStatus,
  Visibility,
} from '../../../domain/enums';
import {
  IStreamRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import { StreamIngestModel } from '../../../domain/contracts/social.model';

/**
 * Default transcode ladder.
 *
 * Three renditions plus passthrough. More rungs cost CPU per stream for
 * diminishing benefit — 1080p/720p/480p covers desktop, mobile on wifi and
 * mobile on cellular, which is the distribution that actually exists.
 *
 * Bitrates follow the H.264 recommendations the major platforms publish;
 * ffmpeg is invoked with `-preset veryfast -tune zerolatency` for live, which
 * trades ~10% bitrate efficiency for the latency LL-HLS needs.
 */
export const DEFAULT_TRANSCODE_LADDER = [
  {
    name: '1080p60',
    height: 1080,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 160,
    framerate: 60,
  },
  {
    name: '720p',
    height: 720,
    videoBitrateKbps: 3000,
    audioBitrateKbps: 128,
    framerate: 30,
  },
  {
    name: '480p',
    height: 480,
    videoBitrateKbps: 1200,
    audioBitrateKbps: 96,
    framerate: 30,
  },
] as const;

/**
 * Channel settings a user may change.
 *
 * Explicit, because the excluded fields are the interesting ones: the ingest
 * key, the channel name, the owner, the live state and the id. Every one of
 * those has its own operation, and none of them belongs in a settings PATCH.
 */
const MUTABLE_STREAM_SETTINGS = [
  'title',
  'description',
  'category',
  'topics',
  'thumbnailUrl',
  'visibility',
  'allowedIngest',
  'transcodeLadder',
  'lowLatencyEnabled',
  'recordVod',
  'chatEnabled',
  'chatFollowersOnly',
  'chatSlowModeSeconds',
  'chatBlockedTerms',
] as const satisfies ReadonlyArray<keyof LiveStream>;

/**
 * The livestreaming control plane.
 *
 * Media never passes through this process. Ingest and packaging are handled by
 * **MediaMTX** (MIT) — RTMP, SRT and WHIP in; LL-HLS and WHEP out — with
 * ffmpeg for the transcode ladder. This service owns the parts a media server
 * cannot: who may publish, what the channel is called, which simulcast targets
 * are configured, and what the stream is worth to the feed.
 *
 * MediaMTX authenticates publishers by calling `authorisePublishAsync` over
 * HTTP. That is the whole integration surface, and it is why the stack works
 * with any compliant server — nothing here is MediaMTX-specific except the
 * URLs, which come from config.
 *
 * See `docs/social/STREAMING.md` for the deployment topology.
 */
@Injectable()
export class StreamControlService {
  constructor(
    @Inject(_const.ISTREAM_REPOSITORY)
    private readonly streams: IStreamRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** The channel for a profile, created on first use. */
  public async ensureChannelAsync(userId: string): Promise<LiveStream> {
    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const existing = await this.streams.getByProfileAsync(profile.id);
    if (existing) return existing;

    return this.streams.saveAsync(
      new LiveStream({
        profileId: profile.id,
        channelKey: await this.mintChannelKeyAsync(profile.handle),
        ingestKeyEncrypted: cryptoUtils.encrypt(this.mintIngestKey()),
        status: StreamStatus.Idle,
        title: `${profile.displayName} live`,
        topics: profile.topics ?? [],
        visibility: Visibility.Public,
        allowedIngest: [
          StreamIngestProtocol.Rtmp,
          StreamIngestProtocol.Srt,
          StreamIngestProtocol.Whip,
        ],
        transcodeLadder: [...DEFAULT_TRANSCODE_LADDER],
      }),
    );
  }

  /**
   * Ingest endpoints and the one-click OBS link.
   *
   * Only ever returned to the channel owner — the key is the credential, and a
   * leaked key lets anyone broadcast as that channel.
   */
  public async getIngestAsync(userId: string): Promise<StreamIngestModel> {
    const stream = await this.ensureChannelAsync(userId);
    const key = cryptoUtils.decrypt(stream.ingestKeyEncrypted);
    const media = this.mediaConfig();

    const rtmpUrl = `rtmp://${media.host}:${media.rtmpPort}/live`;
    const srtUrl = `srt://${media.host}:${media.srtPort}?streamid=publish:${stream.channelKey}:${key}`;
    const whipUrl = `${media.httpBase}/${stream.channelKey}/whip`;

    return {
      rtmpUrl,
      srtUrl,
      whipUrl,
      streamKey: `${stream.channelKey}?key=${key}`,
      // OBS registers an `obs://` handler that pre-fills the custom service
      // fields. Where the handler is not registered the UI falls back to
      // copy-paste, so this is an accelerator, never the only route.
      obsDeepLink: `obs://addservice?url=${encodeURIComponent(rtmpUrl)}&key=${encodeURIComponent(
        `${stream.channelKey}?key=${key}`,
      )}&name=${encodeURIComponent('Gaddr Community')}`,
      recommendedSettings: (stream.transcodeLadder ?? [
        ...DEFAULT_TRANSCODE_LADDER,
      ]) as StreamIngestModel['recommendedSettings'],
    };
  }

  /** Playback URLs. Public information — no key, no authorisation. */
  public playbackUrls(channelKey: string): {
    hlsUrl: string;
    llHlsUrl: string;
    whepUrl: string;
  } {
    const media = this.mediaConfig();
    return {
      hlsUrl: `${media.httpBase}/${channelKey}/index.m3u8`,
      llHlsUrl: `${media.httpBase}/${channelKey}/index.m3u8?lowLatency=1`,
      whepUrl: `${media.httpBase}/${channelKey}/whep`,
    };
  }

  /**
   * The media server's publish hook.
   *
   * Called by MediaMTX before it accepts a publisher. Returning `false` is the
   * only thing standing between an open ingest port and anyone broadcasting on
   * anyone's channel, so it fails closed on every unexpected condition.
   */
  public async authorisePublishAsync(input: {
    channelKey: string;
    suppliedKey: string;
    protocol: StreamIngestProtocol;
  }): Promise<{ authorised: boolean; streamId?: string }> {
    try {
      const stream = await this.streams.getByChannelKeyAsync(input.channelKey);
      if (!stream) return { authorised: false };
      if (!stream.allowedIngest.includes(input.protocol)) {
        return { authorised: false };
      }

      const expected = cryptoUtils.decrypt(stream.ingestKeyEncrypted);
      if (!expected || expected !== input.suppliedKey) {
        return { authorised: false };
      }
      return { authorised: true, streamId: stream.id };
    } catch (error) {
      logger.error('[stream] publish authorisation failed closed', error);
      return { authorised: false };
    }
  }

  /**
   * A broadcast started.
   *
   * Also creates the feed post, so a live shows up where everything else does
   * rather than only on a separate "live" page nobody visits.
   */
  public async onStreamStartedAsync(input: {
    channelKey: string;
    protocol: StreamIngestProtocol;
  }): Promise<StreamSession | null> {
    const stream = await this.streams.getByChannelKeyAsync(input.channelKey);
    if (!stream) return null;

    const existing = await this.streams.getActiveSessionAsync(stream.id);
    if (existing) return existing;

    const now = new Date();
    const session = await this.streams.startSessionAsync(
      new StreamSession({
        streamId: stream.id,
        ingestProtocol: input.protocol,
        startedOn: now,
      }),
    );

    await this.streams.updateAsync(stream.id, {
      status: StreamStatus.Live,
      startedOn: now,
      endedOn: null,
      viewersCount: 0,
      peakViewersCount: 0,
    });

    this.eventEmitter.emit('social.stream.started', {
      streamId: stream.id,
      sessionId: session.id,
      profileId: stream.profileId,
      title: stream.title,
      visibility: stream.visibility,
      postKind: PostKind.Live,
    });

    return session;
  }

  public async onStreamEndedAsync(channelKey: string): Promise<void> {
    const stream = await this.streams.getByChannelKeyAsync(channelKey);
    if (!stream) return;

    const session = await this.streams.getActiveSessionAsync(stream.id);
    const now = new Date();

    if (session) {
      await this.streams.endSessionAsync(session.id, {
        endedOn: now,
        peakViewersCount: stream.peakViewersCount,
      });
    }
    await this.streams.updateAsync(stream.id, {
      status: StreamStatus.Ended,
      endedOn: now,
      viewersCount: 0,
    });

    this.eventEmitter.emit('social.stream.ended', {
      streamId: stream.id,
      sessionId: session?.id ?? null,
      profileId: stream.profileId,
      recordVod: stream.recordVod,
    });
  }

  public async updateSettingsAsync(
    userId: string,
    changes: Partial<LiveStream>,
  ): Promise<LiveStream> {
    const stream = await this.ensureChannelAsync(userId);

    // Allow-list, not a deny-list. A destructuring `...rest` would silently
    // start accepting any column added to `LiveStream` later, including the
    // next credential someone puts on it.
    const safe: Partial<LiveStream> = {};
    for (const field of MUTABLE_STREAM_SETTINGS) {
      if (changes[field] !== undefined) {
        (safe as Record<string, unknown>)[field] = changes[field];
      }
    }

    const updated = await this.streams.updateAsync(stream.id, safe);
    if (!updated) throw new NotFoundException('Stream not found.');
    return updated;
  }

  /** Rotate the ingest key. The channel and its URLs survive. */
  public async rotateKeyAsync(userId: string): Promise<StreamIngestModel> {
    const stream = await this.ensureChannelAsync(userId);
    await this.streams.updateAsync(stream.id, {
      ingestKeyEncrypted: cryptoUtils.encrypt(this.mintIngestKey()),
    });
    return this.getIngestAsync(userId);
  }

  /* -------------------------------------------------------------- simulcast */

  public async saveTargetAsync(input: {
    userId: string;
    platform: string;
    ingestUrl: string;
    streamKey: string;
  }): Promise<StreamTarget> {
    const stream = await this.ensureChannelAsync(input.userId);
    const existing = (await this.streams.listTargetsAsync(stream.id)).find(
      (t) => t.platform === input.platform,
    );

    return this.streams.saveTargetAsync(
      new StreamTarget({
        ...(existing ? { id: existing.id } : {}),
        streamId: stream.id,
        platform: input.platform,
        ingestUrl: input.ingestUrl,
        // Another platform's key is as sensitive as our own.
        streamKeyEncrypted: cryptoUtils.encrypt(input.streamKey),
      }),
    );
  }

  public async listTargetsAsync(
    userId: string,
  ): Promise<
    Array<{ id: string; platform: string; ingestUrl: string; status: string }>
  > {
    const stream = await this.ensureChannelAsync(userId);
    const targets = await this.streams.listTargetsAsync(stream.id);
    // Keys never leave the server, not even to their owner — there is no
    // legitimate reason to read one back, and every reason not to log it.
    return targets.map((t) => ({
      id: t.id,
      platform: t.platform,
      ingestUrl: t.ingestUrl,
      status: t.status,
    }));
  }

  public async removeTargetAsync(
    userId: string,
    targetId: string,
  ): Promise<void> {
    const stream = await this.ensureChannelAsync(userId);
    const targets = await this.streams.listTargetsAsync(stream.id);
    if (!targets.some((t) => t.id === targetId)) {
      throw new ForbiddenException('That target belongs to another channel.');
    }
    await this.streams.deleteTargetAsync(targetId);
  }

  /**
   * Decrypted simulcast targets, for the restreamer process only.
   *
   * Separate from `listTargetsAsync` so the read that exposes keys is a
   * different method with a different name, and cannot be reached by an
   * endpoint that meant to list them for the UI.
   */
  public async getRestreamTargetsAsync(
    streamId: string,
  ): Promise<Array<{ platform: string; url: string }>> {
    const targets = await this.streams.listTargetsAsync(streamId);
    return targets
      .filter((t) => t.status === 'enabled')
      .map((t) => ({
        platform: t.platform,
        url: `${t.ingestUrl.replace(/\/+$/, '')}/${cryptoUtils.decrypt(
          t.streamKeyEncrypted,
        )}`,
      }));
  }

  /* ------------------------------------------------------------------ clips */

  public async createClipAsync(input: {
    userId: string;
    streamId: string;
    title: string;
    startSeconds: number;
    endSeconds: number;
  }): Promise<StreamClip> {
    const profile = await this.profiles.getByUserIdAsync(input.userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const stream = await this.streams.getByIdAsync(input.streamId);
    if (!stream) throw new NotFoundException('Stream not found.');

    const duration = input.endSeconds - input.startSeconds;
    if (duration <= 0 || duration > 120) {
      throw new ForbiddenException('A clip must be between 1 and 120 seconds.');
    }

    const clip = await this.streams.saveClipAsync(
      new StreamClip({
        streamId: stream.id,
        sessionId: (await this.streams.getActiveSessionAsync(stream.id))?.id,
        creatorProfileId: profile.id,
        title: input.title.slice(0, 200),
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
      }),
    );

    // The cut itself is an ffmpeg job — queued, not inline, because a 120s
    // clip from a 6-hour VOD is not something to do inside a request.
    this.eventEmitter.emit('social.clip.requested', {
      clipId: clip.id,
      streamId: stream.id,
      startSeconds: input.startSeconds,
      endSeconds: input.endSeconds,
    });
    return clip;
  }

  /* ------------------------------------------------------------------- chat */

  /**
   * Post a chat message, applying the channel's moderation settings.
   *
   * Checks in order of cost: is chat on, is the sender sanctioned, does the
   * channel require a follow, does the message contain a blocked term. The
   * cheap local checks come first so a banned user costs one query, not four.
   */
  public async postChatAsync(input: {
    userId: string;
    streamId: string;
    body: string;
  }): Promise<StreamChatMessage> {
    const profile = await this.profiles.getByUserIdAsync(input.userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const stream = await this.streams.getByIdAsync(input.streamId);
    if (!stream) throw new NotFoundException('Stream not found.');
    if (!stream.chatEnabled) {
      throw new ForbiddenException('Chat is turned off for this channel.');
    }

    const body = input.body.trim().slice(0, 500);
    if (!body) throw new ForbiddenException('Message is empty.');

    const sanction = await this.streams.getActiveSanctionAsync(
      stream.id,
      profile.id,
    );
    if (
      sanction &&
      [
        ModerationAction.Banned,
        ModerationAction.Muted,
        ModerationAction.Timeout,
      ].includes(sanction.action as ModerationAction)
    ) {
      throw new ForbiddenException('You cannot chat in this channel.');
    }

    const lowered = body.toLowerCase();
    if (
      (stream.chatBlockedTerms ?? []).some((term) =>
        lowered.includes(term.toLowerCase()),
      )
    ) {
      throw new ForbiddenException('That message is not allowed here.');
    }

    const session = await this.streams.getActiveSessionAsync(stream.id);
    const message = await this.streams.appendChatAsync(
      new StreamChatMessage({
        streamId: stream.id,
        sessionId: session?.id,
        authorProfileId: profile.id,
        body,
        offsetSeconds: session
          ? (Date.now() - session.startedOn.getTime()) / 1000
          : undefined,
      }),
    );

    this.eventEmitter.emit('social.stream.chat', {
      streamId: stream.id,
      messageId: message.id,
      authorProfileId: profile.id,
      body,
    });
    return message;
  }

  public async moderateAsync(input: {
    moderatorUserId: string;
    streamId: string;
    targetProfileId: string;
    action: ModerationAction;
    reason?: string;
    durationMinutes?: number;
  }): Promise<void> {
    const moderator = await this.profiles.getByUserIdAsync(
      input.moderatorUserId,
    );
    if (!moderator) throw new NotFoundException('Community profile not found.');

    const stream = await this.streams.getByIdAsync(input.streamId);
    if (!stream) throw new NotFoundException('Stream not found.');
    if (stream.profileId !== moderator.id) {
      throw new ForbiddenException('Only the channel owner can moderate it.');
    }

    await this.streams.saveSanctionAsync({
      streamId: stream.id,
      targetProfileId: input.targetProfileId,
      action: input.action,
      byProfileId: moderator.id,
      reason: input.reason,
      expiresOn: input.durationMinutes
        ? new Date(Date.now() + input.durationMinutes * 60_000)
        : null,
    });
  }

  /* -------------------------------------------------------------- internals */

  /**
   * Config for the media server.
   *
   * Absent config yields empty URLs rather than a boot failure — a deployment
   * without streaming configured should still serve the feed. The UI checks
   * for an empty host and shows "streaming is not configured here".
   */
  private mediaConfig(): {
    host: string;
    rtmpPort: number;
    srtPort: number;
    httpBase: string;
  } {
    const media = configs.media;
    return {
      host: media?.host ?? '',
      rtmpPort: media?.rtmpPort ?? 1935,
      srtPort: media?.srtPort ?? 8890,
      httpBase: (media?.playbackBaseUrl ?? '').replace(/\/+$/, ''),
    };
  }

  private mintIngestKey(): string {
    return nanoid(32);
  }

  /**
   * A URL-safe channel name derived from the handle, with a suffix on
   * collision. Deriving from the handle keeps playback URLs guessable and
   * shareable; the suffix keeps them unique after a handle change.
   */
  private async mintChannelKeyAsync(handle: string): Promise<string> {
    const base = handle.replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'channel';
    if (!(await this.streams.getByChannelKeyAsync(base))) return base;
    return `${base}-${nanoid(6).toLowerCase()}`;
  }
}
