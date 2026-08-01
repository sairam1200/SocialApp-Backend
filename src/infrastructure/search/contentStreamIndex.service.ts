import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContentStream } from '../../domain/entities/contentStream.entity';
import { UserContent } from '../../domain/entities/userContent.entity';
import { StreamEntityType } from '../../domain/enums';
import { IContentStreamIndexService } from '../../domain/services/icontentStreamIndex.service';
import logger from '../../core/utils/winston.util';

const BATCH_CHUNK_SIZE = 100;

@Injectable()
export class ContentStreamIndexService implements IContentStreamIndexService {
  constructor(
    @InjectRepository(ContentStream)
    private readonly repository: Repository<ContentStream>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async index(content: ContentStream): Promise<void> {
    const metaData = this.normalizeMetaData(content);
    const searchText = this.buildSearchText(content, metaData);
    const engagementScore = this.calculateEngagementScore(metaData);
    const publishedAt =
      content.publishedAt ?? this.extractPublishedAt(metaData);
    const creatorId = this.toUuidOrNull(
      content.creatorId ?? this.extractCreatorId(metaData),
    );

    await this.repository
      .createQueryBuilder()
      .insert()
      .into('contentStreams')
      .values({
        ...(content.id ? { id: content.id } : {}),
        platform: content.platform,
        externalId: content.externalId,
        type: content.type,
        subType: content.subType,
        title: content.title,
        searchText,
        publishedAt,
        engagementScore,
        creatorId,
        metaData,
        lastRefreshed: content.lastRefreshed ?? new Date(),
      })
      .orUpdate(
        [
          'title',
          'searchText',
          'publishedAt',
          'engagementScore',
          'creatorId',
          'metaData',
          'lastRefreshed',
        ],
        ['platform', 'externalId'],
      )
      .execute();

    this.eventEmitter.emit('content.indexed', {
      documentId: content.id,
      platform: content.platform,
      externalId: content.externalId,
      type: content.type,
      action: 'indexed',
      timestamp: new Date(),
    });
  }

  async indexBatch(contents: ContentStream[]): Promise<void> {
    for (let i = 0; i < contents.length; i += BATCH_CHUNK_SIZE) {
      const chunk = contents.slice(i, i + BATCH_CHUNK_SIZE);
      const results = await Promise.allSettled(chunk.map((c) => this.index(c)));
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        logger.warn(
          `[ContentStreamIndex] Batch indexing: ${failed.length}/${chunk.length} documents failed`,
        );
      }
    }
  }

  async update(content: ContentStream): Promise<void> {
    await this.index(content);
  }

  async delete(platform: string, externalId: string): Promise<void> {
    await this.repository.delete({ platform, externalId });
    this.eventEmitter.emit('content.deleted', {
      platform,
      externalId,
      timestamp: new Date(),
    });
  }

  async reindex(): Promise<void> {
    const contents = await this.repository.find();
    for (let i = 0; i < contents.length; i += BATCH_CHUNK_SIZE) {
      const chunk = contents.slice(i, i + BATCH_CHUNK_SIZE);
      await this.indexBatch(chunk);
    }
    logger.info(
      `[ContentStreamIndex] Reindex complete: ${contents.length} content streams`,
    );
  }

  async upsertFromUserContent(userContent: UserContent): Promise<void> {
    const contentStream = this.fromUserContent(userContent);
    await this.index(contentStream);
  }

  private fromUserContent(userContent: UserContent): ContentStream {
    return new ContentStream({
      type: this.mapContentTypeToEntityType(userContent.type),
      subType: userContent.type,
      title: userContent.title,
      platform: userContent.platform,
      externalId: userContent.externalId,
      metaData: {
        ...(userContent.metaData || {}),
        description: userContent.text,
        tags: userContent.tags,
        thumbnailUrl: userContent.media?.[0]?.thumbnail,
        mediaUrl: userContent.sourceUrl,
        mediaType: userContent.media?.[0]?.type,
        engagement: userContent.engagement,
      },
      publishedAt: userContent.publishedAt,
      creatorId: userContent.userId,
    });
  }

  private mapContentTypeToEntityType(type: string): StreamEntityType {
    const profileTypes = ['channel', 'subscription', 'profile'];
    if (profileTypes.includes(type)) {
      return StreamEntityType.Profile;
    }
    return StreamEntityType.Content;
  }

  /**
   * Canonicalize provider-specific metadata into the additive shape the read
   * side (ContentStreamSearchRepository) consumes, while preserving every
   * original provider field for the legacy platform response builders.
   * All sources feed through one funnel, so any upstream search provider
   * produces the same normalized index document.
   */
  private normalizeMetaData(content: ContentStream): Record<string, any> {
    const original = content.metaData ?? {};
    const normalized: Record<string, any> = {
      ...original,
      source: original.source ?? content.platform,
      tags: Array.isArray(original.tags) ? original.tags : [],
      engagement: this.normalizeEngagement(original),
    };

    const description = this.resolveDescription(original);
    if (description) normalized.description = description;

    const thumbnailUrl = this.extractThumbnailUrl(original);
    if (thumbnailUrl) normalized.thumbnailUrl = thumbnailUrl;

    const mediaUrl = this.extractMediaUrl(original);
    if (mediaUrl) normalized.mediaUrl = mediaUrl;

    Object.assign(normalized, this.normalizeCreatorIdentity(original));

    return normalized;
  }

  private resolveDescription(meta: Record<string, any>): string | null {
    if (meta.description) return meta.description;
    if (meta.caption) return meta.caption;
    if (meta.summary) return meta.summary;
    if (typeof meta.commentary === 'string') return meta.commentary;
    if (meta.commentary?.text) return meta.commentary.text;
    if (typeof meta.text === 'string') return meta.text;
    if (meta.text?.text) return meta.text.text;
    return null;
  }

  private extractThumbnailUrl(meta: Record<string, any>): string | null {
    const direct =
      meta.coverImageUrl ??
      meta.imageUrl ??
      meta.thumbnail ??
      meta.thumbnail_url ??
      meta.picture ??
      meta.image_cover_url ??
      null;
    if (direct) return direct;

    for (const key of ['media', 'images', 'thumbnails']) {
      const value = meta[key];
      if (!value) continue;
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) {
        const first = value[0];
        if (typeof first === 'string') return first;
        if (first?.thumbnail) return first.thumbnail;
        if (first?.url) return first.url;
        continue;
      }
      if (value.original?.url || value.original?.source) {
        return value.original.url ?? value.original.source;
      }
      if (value['564x']?.url) return value['564x'].url;
      const simple = ['maxres', 'standard', 'high', 'medium', 'default']
        .map((key) => value[key]?.url)
        .find((url) => !!url);
      if (simple) return simple;
    }

    return null;
  }

  private extractMediaUrl(meta: Record<string, any>): string | null {
    const candidates = [
      meta.mediaUrl,
      meta.media_url,
      meta.shareUrl,
      meta.embedUrl,
      meta.link,
      meta.url,
      meta.sourceUrl,
      meta.permalink,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate) return candidate;
    }
    return null;
  }

  private normalizeEngagement(meta: Record<string, any>): {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    subscriberCount: number;
    followerCount: number;
  } {
    const sources: Record<string, any>[] = [];
    for (const key of ['engagement', 'statistics', 'stats', 'publicMetrics']) {
      const value = meta[key];
      if (value && typeof value === 'object') sources.push(value);
    }

    const pick = (...keys: string[]): number => {
      for (const key of keys) {
        const value = meta[key] ?? this.firstDefined(sources, key);
        if (value != null) return Number(value) || 0;
      }
      return 0;
    };

    return {
      viewCount: pick(
        'viewCount',
        'views',
        'view_count',
        'totalViews',
        'total_views',
      ),
      likeCount: pick(
        'likeCount',
        'likes',
        'like_count',
        'totalLikes',
        'total_likes',
      ),
      commentCount: pick(
        'commentCount',
        'comments',
        'comment_count',
        'reply_count',
      ),
      shareCount: pick(
        'shareCount',
        'shares',
        'share_count',
        'retweet_count',
        'quote_count',
      ),
      subscriberCount: pick(
        'subscriberCount',
        'subscribers',
        'subscriber_count',
      ),
      followerCount: pick('followerCount', 'followers', 'follower_count'),
    };
  }

  private firstDefined(sources: Record<string, any>[], key: string): unknown {
    for (const source of sources) {
      if (source[key] != null) return source[key];
    }
    return undefined;
  }

  private normalizeCreatorIdentity(
    meta: Record<string, any>,
  ): Record<string, any> {
    const artists = Array.isArray(meta.artists)
      ? meta.artists
          .map((artist: any) => artist?.name)
          .filter(Boolean)
          .join(', ')
      : undefined;
    const name =
      meta.creatorName ??
      meta.channelName ??
      meta.channelTitle ??
      meta.author ??
      artists ??
      null;
    const username =
      meta.creatorUsername ??
      meta.channelUsername ??
      meta.channelHandle ??
      meta.username ??
      meta.customUrl ??
      meta.screenName ??
      null;
    const avatar =
      meta.creatorAvatar ??
      meta.channelProfileImage ??
      meta.avatar ??
      meta.profileImage ??
      null;
    const url = meta.creatorUrl ?? meta.channelUrl ?? meta.profileUrl ?? null;
    const verified =
      meta.verified ?? meta.isVerified ?? meta.is_verified ?? false;

    const result: Record<string, any> = {};
    if (name) result.creatorName = name;
    if (username) result.creatorUsername = username;
    if (avatar) result.creatorAvatar = avatar;
    if (url) result.creatorUrl = url;
    if (verified) result.verified = true;
    return result;
  }

  private buildSearchText(
    content: ContentStream,
    metaData: Record<string, any>,
  ): string {
    const tags = Array.isArray(metaData.tags) ? metaData.tags : [];
    const creatorName =
      metaData.creatorName ?? metaData.channelTitle ?? metaData.author;
    const parts = [content.title, metaData.description, ...tags, creatorName];
    return parts
      .filter(Boolean)
      .map((part) => this.cleanText(String(part)))
      .join(' ')
      .trim();
  }

  private calculateEngagementScore(metaData: Record<string, any>): number {
    const engagement = this.normalizeEngagement(metaData);
    const viewScore = this.normalize(engagement.viewCount, 10000000);
    const likeScore = this.normalize(engagement.likeCount, 1000000);
    const commentScore = this.normalize(engagement.commentCount, 100000);
    const subscriberScore = this.normalize(
      engagement.subscriberCount,
      10000000,
    );

    return (
      viewScore * 0.4 +
      likeScore * 0.3 +
      commentScore * 0.2 +
      subscriberScore * 0.1
    );
  }

  private normalize(value: number, max: number): number {
    const numeric = Number(value) || 0;
    return Math.min(numeric / max, 1);
  }

  private extractPublishedAt(
    metaData: Record<string, any> | undefined,
  ): Date | null {
    if (!metaData) return null;

    const created = metaData.created;
    const createdTime =
      created && typeof created === 'object'
        ? (created as any).time
        : undefined;

    const raw =
      metaData.publishedAt ??
      metaData.createdAt ??
      metaData.timestamp ??
      metaData.created_at ??
      metaData.releaseDate ??
      metaData.createTime ??
      metaData.createdUtc ??
      createdTime ??
      null;
    if (raw == null || raw === '') return null;

    if (typeof raw === 'number') {
      // Unix seconds (TikTok createTime, Reddit createdUtc) or millis.
      const ms = raw > 1e12 ? raw : raw * 1000;
      const parsed = new Date(ms);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const text = String(raw);
    // Spotify releaseDate may be a bare year or year-month.
    if (/^\d{4}$/.test(text)) {
      return new Date(`${text}-01-01T00:00:00.000Z`);
    }
    if (/^\d{4}-\d{2}$/.test(text)) {
      return new Date(`${text}-01T00:00:00.000Z`);
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private extractCreatorId(
    metaData: Record<string, any> | undefined,
  ): string | null {
    if (!metaData) return null;
    return (
      metaData.channelId ?? metaData.authorId ?? metaData.creatorId ?? null
    );
  }

  private toUuidOrNull(value: string | null | undefined): string | null {
    if (!value) return null;
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(value) ? value : null;
  }

  private cleanText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
