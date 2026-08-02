import * as Joi from 'joi';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post as HttpPost,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import configs from '../../configs';
import _const from '../../core/utils/const';
import { cryptoUtils } from '../../core/utils/crypto.util';
import { HttpContext } from '../../core/middlewares/httpContext.middleware';
import { UserAccoutGuard } from '../../core/passport';
import {
  StreamIngestModel,
  StreamModel,
} from '../../domain/contracts/social.model';
import { mapProfileSummary } from '../../domain/mappers/social.mapper';
import {
  ModerationAction,
  StreamIngestProtocol,
  Visibility,
} from '../../domain/enums';
import {
  ISocialProfileRepository,
  IStreamRepository,
} from '../../domain/repositories/isocial.repository';
import { StreamControlService } from '../../infrastructure/services/social/stream-control.service';
import { clampInt } from './feed.endpoint';

const settingsValidations = Joi.object({
  title: Joi.string().max(200).allow('', null),
  description: Joi.string().max(4000).allow('', null),
  category: Joi.string().max(80).allow('', null),
  topics: Joi.array().items(Joi.string().max(80)).max(12),
  thumbnailUrl: Joi.string().uri().max(1024).allow('', null),
  visibility: Joi.string().valid(...Object.values(Visibility)),
  allowedIngest: Joi.array()
    .items(Joi.string().valid(...Object.values(StreamIngestProtocol)))
    .min(1)
    .max(3),
  transcodeLadder: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().max(20).required(),
        height: Joi.number().integer().min(144).max(2160).required(),
        videoBitrateKbps: Joi.number().integer().min(200).max(20000).required(),
        audioBitrateKbps: Joi.number().integer().min(32).max(320).required(),
        framerate: Joi.number().integer().min(10).max(120),
      }),
    )
    .max(5),
  lowLatencyEnabled: Joi.boolean(),
  recordVod: Joi.boolean(),
  chatEnabled: Joi.boolean(),
  chatFollowersOnly: Joi.boolean(),
  chatSlowModeSeconds: Joi.number().integer().min(0).max(600),
  chatBlockedTerms: Joi.array().items(Joi.string().max(80)).max(200),
});

/**
 * Livestreaming.
 *
 * Media never touches this process — MediaMTX (MIT) handles RTMP, SRT and WHIP
 * ingest and LL-HLS/WHEP playback, and calls back here to authenticate a
 * publisher. This controller is the control plane: keys, settings, simulcast
 * targets, chat, clips and moderation.
 */
@ApiTags('Community')
@Controller({ path: '/community', version: '1' })
export class CommunityStreamController {
  constructor(
    private readonly control: StreamControlService,
    @Inject(_const.ISTREAM_REPOSITORY)
    private readonly streams: IStreamRepository,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Who is live right now' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['viewers', 'recent'],
    description:
      'Busiest first (default), or most recently started — the only ordering in which a new channel is ever seen.',
  })
  @ApiResponse({ status: 200, type: [StreamModel] })
  public async live(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('sort') sort?: string,
  ): Promise<StreamModel[]> {
    const streams = await this.streams.listLiveAsync(
      clampInt(limit, 24, 1, 100),
      {
        category: category?.trim() || undefined,
        sort: sort === 'recent' ? 'recent' : 'viewers',
      },
    );
    const owners = await this.profiles.getManyByIdsAsync(
      streams.map((s) => s.profileId),
    );
    const byId = new Map(owners.map((o) => [o.id, o]));

    return streams.map((s) => ({
      id: s.id,
      channelKey: s.channelKey,
      status: s.status,
      title: s.title,
      category: s.category,
      owner: mapProfileSummary(byId.get(s.profileId)),
      viewersCount: s.viewersCount,
      startedOn: s.startedOn ?? null,
      thumbnailUrl: s.thumbnailUrl,
      playback: this.control.playbackUrls(s.channelKey),
      chatEnabled: s.chatEnabled,
    }));
  }

  /**
   * The categories with someone live in them, busiest first.
   *
   * Its own endpoint rather than a field on `live`, for two reasons: the rail
   * must keep showing every category once the reader has picked one — a facet
   * counted over its own filter is a one-way door — and categories change far
   * more slowly than viewer counts, so the client can cache this much longer
   * than the listing it decorates.
   */
  @Get('live/categories')
  @ApiOperation({ summary: 'Categories with someone live in them' })
  @ApiResponse({ status: 200, type: [Object] })
  public async liveCategories(): Promise<
    Array<{ category: string; count: number; viewers: number }>
  > {
    const streams = await this.streams.listLiveAsync(100);

    const counts = new Map<string, { count: number; viewers: number }>();
    for (const stream of streams) {
      const category = stream.category?.trim();
      if (!category) continue;
      const entry = counts.get(category) ?? { count: 0, viewers: 0 };
      entry.count += 1;
      entry.viewers += stream.viewersCount ?? 0;
      counts.set(category, entry);
    }

    return Array.from(counts.entries())
      .map(([category, entry]) => ({ category, ...entry }))
      .sort(
        (a, b) => b.viewers - a.viewers || a.category.localeCompare(b.category),
      );
  }

  @Get('streams/:channelKey')
  @ApiResponse({ status: 200, type: StreamModel })
  public async getStream(
    @Param('channelKey') channelKey: string,
  ): Promise<StreamModel> {
    const stream = await this.streams.getByChannelKeyAsync(channelKey);
    if (!stream) throw new NotFoundException('Channel not found.');

    const owner = await this.profiles.getByIdAsync(stream.profileId);
    return {
      id: stream.id,
      channelKey: stream.channelKey,
      status: stream.status,
      title: stream.title,
      category: stream.category,
      owner: mapProfileSummary(owner ?? undefined),
      viewersCount: stream.viewersCount,
      startedOn: stream.startedOn ?? null,
      thumbnailUrl: stream.thumbnailUrl,
      playback: this.control.playbackUrls(stream.channelKey),
      chatEnabled: stream.chatEnabled,
    };
  }

  @Get('stream/ingest')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Your ingest endpoints and the one-click OBS link',
    description:
      'RTMP, SRT and WHIP URLs plus the stream key. Only ever returned to the channel owner — the key is the credential.',
  })
  @ApiResponse({ status: 200, type: StreamIngestModel })
  public async ingest(): Promise<StreamIngestModel & { configured: boolean }> {
    const ingest = await this.control.getIngestAsync(
      HttpContext.getCurrentUserId,
    );
    // A deployment without a media server still serves the feed. Saying so
    // beats handing out URLs that point nowhere.
    return { ...ingest, configured: Boolean(configs.media?.host) };
  }

  @HttpPost('stream/ingest/rotate')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({ summary: 'Rotate the ingest key; the channel URL survives' })
  public async rotate(): Promise<StreamIngestModel> {
    return this.control.rotateKeyAsync(HttpContext.getCurrentUserId);
  }

  @Patch('stream/settings')
  @UseGuards(UserAccoutGuard)
  public async updateSettings(@Body() body: Record<string, unknown>) {
    const value = await settingsValidations.validateAsync(body ?? {}, {
      stripUnknown: true,
    });
    const stream = await this.control.updateSettingsAsync(
      HttpContext.getCurrentUserId,
      value,
    );
    return {
      id: stream.id,
      channelKey: stream.channelKey,
      title: stream.title,
      category: stream.category,
      visibility: stream.visibility,
      allowedIngest: stream.allowedIngest,
      transcodeLadder: stream.transcodeLadder,
      lowLatencyEnabled: stream.lowLatencyEnabled,
      recordVod: stream.recordVod,
      chatEnabled: stream.chatEnabled,
      chatFollowersOnly: stream.chatFollowersOnly,
      chatSlowModeSeconds: stream.chatSlowModeSeconds,
      chatBlockedTerms: stream.chatBlockedTerms,
    };
  }

  /* --------------------------------------------------------------- simulcast */

  @Get('stream/targets')
  @UseGuards(UserAccoutGuard)
  @ApiOperation({
    summary: 'Simulcast destinations',
    description:
      'Keys are never returned — there is no legitimate reason to read one back.',
  })
  public async targets() {
    return this.control.listTargetsAsync(HttpContext.getCurrentUserId);
  }

  @HttpPost('stream/targets')
  @UseGuards(UserAccoutGuard)
  public async saveTarget(
    @Body() body: { platform: string; ingestUrl: string; streamKey: string },
  ) {
    const value = await Joi.object({
      platform: Joi.string().max(40).required(),
      ingestUrl: Joi.string()
        .uri({ scheme: [/rtmps?/, /srt/] })
        .max(512)
        .required(),
      streamKey: Joi.string().max(512).required(),
    }).validateAsync(body ?? {}, { stripUnknown: true });

    const target = await this.control.saveTargetAsync({
      userId: HttpContext.getCurrentUserId,
      ...value,
    });
    return { id: target.id, platform: target.platform, status: target.status };
  }

  @Delete('stream/targets/:targetId')
  @UseGuards(UserAccoutGuard)
  public async removeTarget(
    @Param('targetId') targetId: string,
  ): Promise<{ ok: true }> {
    await this.control.removeTargetAsync(
      HttpContext.getCurrentUserId,
      targetId,
    );
    return { ok: true };
  }

  /* ------------------------------------------------------------ chat & clips */

  @Get('streams/:streamId/chat')
  public async chat(
    @Param('streamId') streamId: string,
    @Query('limit') limit?: string,
  ) {
    const messages = await this.streams.listChatAsync(
      streamId,
      clampInt(limit, 100, 1, 200),
    );
    const authors = await this.profiles.getManyByIdsAsync(
      Array.from(new Set(messages.map((m) => m.authorProfileId))),
    );
    const byId = new Map(authors.map((a) => [a.id, a]));

    return messages
      .filter((m) => m.moderation !== ModerationAction.Deleted)
      .map((m) => ({
        id: m.id,
        body: m.body,
        author: mapProfileSummary(byId.get(m.authorProfileId)),
        offsetSeconds: m.offsetSeconds,
        tipAmountMinor: m.tipAmountMinor,
        createdOn: m.createdOn,
      }));
  }

  @HttpPost('streams/:streamId/chat')
  @UseGuards(UserAccoutGuard)
  public async postChat(
    @Param('streamId') streamId: string,
    @Body() body: { body: string },
  ) {
    const message = await this.control.postChatAsync({
      userId: HttpContext.getCurrentUserId,
      streamId,
      body: body?.body ?? '',
    });
    return { id: message.id, createdOn: message.createdOn };
  }

  @HttpPost('streams/:streamId/moderate')
  @UseGuards(UserAccoutGuard)
  public async moderate(
    @Param('streamId') streamId: string,
    @Body()
    body: {
      targetProfileId: string;
      action: ModerationAction;
      reason?: string;
      durationMinutes?: number;
    },
  ): Promise<{ ok: true }> {
    const value = await Joi.object({
      targetProfileId: Joi.string().uuid().required(),
      action: Joi.string()
        .valid(...Object.values(ModerationAction))
        .required(),
      reason: Joi.string().max(400).allow('', null),
      durationMinutes: Joi.number()
        .integer()
        .min(1)
        .max(60 * 24 * 365),
    }).validateAsync(body ?? {}, { stripUnknown: true });

    await this.control.moderateAsync({
      moderatorUserId: HttpContext.getCurrentUserId,
      streamId,
      ...value,
    });
    return { ok: true };
  }

  @Get('streams/:streamId/clips')
  public async clips(
    @Param('streamId') streamId: string,
    @Query('limit') limit?: string,
  ) {
    return this.streams.listClipsAsync(streamId, clampInt(limit, 24, 1, 100));
  }

  @HttpPost('streams/:streamId/clips')
  @UseGuards(UserAccoutGuard)
  public async createClip(
    @Param('streamId') streamId: string,
    @Body()
    body: { title: string; startSeconds: number; endSeconds: number },
  ) {
    const value = await Joi.object({
      title: Joi.string().max(200).required(),
      startSeconds: Joi.number().min(0).required(),
      endSeconds: Joi.number().min(0).required(),
    }).validateAsync(body ?? {}, { stripUnknown: true });

    const clip = await this.control.createClipAsync({
      userId: HttpContext.getCurrentUserId,
      streamId,
      ...value,
    });
    return { id: clip.id, title: clip.title, status: 'processing' };
  }

  @Get('streams/:streamId/sessions')
  @ApiOperation({ summary: 'Past broadcasts and their VODs' })
  public async sessions(
    @Param('streamId') streamId: string,
    @Query('limit') limit?: string,
  ) {
    return this.streams.listSessionsAsync(
      streamId,
      clampInt(limit, 20, 1, 100),
    );
  }

  /* ----------------------------------------------------- media-server hooks */

  /**
   * Publish authorisation, called by the media server before accepting a
   * stream.
   *
   * Shared-secret authenticated with a constant-time comparison, and fails
   * closed on every unexpected condition — this is the only thing between an
   * open ingest port and anyone broadcasting on anyone's channel.
   */
  @HttpPost('stream/hooks/authorise')
  @ApiOperation({ summary: 'Media-server publish hook' })
  public async authorise(
    @Headers('x-media-secret') secret: string,
    @Body()
    body: { channelKey: string; key: string; protocol: StreamIngestProtocol },
  ): Promise<{ authorised: boolean }> {
    this.assertMediaSecret(secret);
    const result = await this.control.authorisePublishAsync({
      channelKey: body?.channelKey ?? '',
      suppliedKey: body?.key ?? '',
      protocol: body?.protocol ?? StreamIngestProtocol.Rtmp,
    });
    return { authorised: result.authorised };
  }

  @HttpPost('stream/hooks/started')
  public async started(
    @Headers('x-media-secret') secret: string,
    @Body() body: { channelKey: string; protocol: StreamIngestProtocol },
  ): Promise<{ ok: true }> {
    this.assertMediaSecret(secret);
    await this.control.onStreamStartedAsync({
      channelKey: body?.channelKey ?? '',
      protocol: body?.protocol ?? StreamIngestProtocol.Rtmp,
    });
    return { ok: true };
  }

  @HttpPost('stream/hooks/ended')
  public async ended(
    @Headers('x-media-secret') secret: string,
    @Body() body: { channelKey: string },
  ): Promise<{ ok: true }> {
    this.assertMediaSecret(secret);
    await this.control.onStreamEndedAsync(body?.channelKey ?? '');
    return { ok: true };
  }

  /**
   * Compare the callback secret in constant time.
   *
   * A plain `!==` leaks the shared secret one byte at a time to anyone who can
   * measure the response, and the media server is reachable from the network.
   */
  private assertMediaSecret(supplied: string | undefined): void {
    const expected = configs.media?.webhookSecret ?? '';
    if (!expected) {
      throw new ForbiddenException('Media callbacks are not configured.');
    }
    const a = cryptoUtils.encodeSHA256ToHex(supplied ?? '');
    const b = cryptoUtils.encodeSHA256ToHex(expected);
    let difference = 0;
    for (let i = 0; i < a.length; i += 1) {
      difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    if (difference !== 0) {
      throw new ForbiddenException('Invalid media callback signature.');
    }
  }
}
