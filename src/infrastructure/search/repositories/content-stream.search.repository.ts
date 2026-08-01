import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentStream } from '../../../domain/entities/contentStream.entity';
import { SearchEntityType } from '../../../domain/contracts/search/search-entity-type';
import { IndexDocument } from '../../../domain/contracts/search/index-document.model';
import {
  ISearchRepository,
  SearchRepositoryCapabilities,
  SearchRepositoryQuery,
} from '../../../domain/contracts/search/search-repository.interface';

/**
 * Retrieval-only repository over contentStreams. Applies repository-level
 * privacy (creator-linked rows only when the creator's gaddr profile is
 * Public and active; ownerless external rows are public) and projects
 * ranking primitives (tsvector rank, trigram similarity, phrase, exact
 * match, engagement, creator authority). It never ranks, resolves identity
 * or builds wire DTOs.
 *
 * The old pipeline correlated "userContents" by platform+externalId to
 * find a gaddr identity. That is replaced by a direct join on
 * "creatorId" -> identity.users. Both sides are compared as text, which is
 * safe both before and after the migration that converts creatorId to uuid
 * (varchar = varchar, and uuid = uuid via the ::text casts); non-uuid
 * legacy values simply do not match and the privacy rule drops the row.
 */
@Injectable()
export class ContentStreamSearchRepository implements ISearchRepository {
  readonly name = 'contentStream';
  readonly capabilities: SearchRepositoryCapabilities = {
    supports: ['phrase', 'fuzzy', 'exact', 'privacy'],
  };

  constructor(
    @InjectRepository(ContentStream)
    private readonly contentStreamContext: Repository<ContentStream>,
  ) {}

  async search(query: SearchRepositoryQuery): Promise<IndexDocument[]> {
    if (!query.normalizedQuery) return [];
    if (
      query.entityType !== undefined &&
      query.entityType !== SearchEntityType.CONTENT
    ) {
      return [];
    }

    const searchTerm = query.normalizedQuery;
    const phraseQuery = searchTerm
      .replace(/["&|!:*()-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const webQuery = searchTerm
      .replace(/["&|!:-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const escapedLike = searchTerm.replace(/[\\%_]/g, '\\$&');

    const params: unknown[] = [
      searchTerm,
      phraseQuery,
      webQuery,
      `%${escapedLike}%`,
    ];

    let whereClause = `
      (
        cs."searchVector" @@ websearch_to_tsquery('english', $3)
        OR cs."searchVector" @@ phraseto_tsquery('english', $2)
        OR cs."searchText" % $1
        OR cs."title" ILIKE $4 ESCAPE '\\'
      )
      AND (cs."creatorId" IS NULL OR u."id" IS NOT NULL)
    `;

    if (query.platforms && query.platforms.length > 0) {
      params.push(query.platforms);
      whereClause += ` AND cs."platform" = ANY($${params.length})`;
    }

    params.push(query.limit);

    const sql = `
      SELECT
        cs."id" AS "id",
        cs."subType" AS "subType",
        cs."title" AS "title",
        cs."platform" AS "platform",
        cs."externalId" AS "externalId",
        cs."publishedAt" AS "publishedAt",
        cs."engagementScore" AS "engagementScore",
        cs."creatorId" AS "creatorId",
        cs."metaData" AS "metaData",
        COALESCE(ts_rank_cd(cs."searchVector", phraseto_tsquery('english', $2)), 0) AS "phraseRank",
        COALESCE(ts_rank_cd(cs."searchVector", websearch_to_tsquery('english', $3)), 0) AS "textRelevance",
        similarity(cs."searchText", $1) AS "textSimilarity",
        CASE WHEN LOWER(cs."title") = LOWER($1) THEN 1 ELSE 0 END AS "exactMatch",
        CASE WHEN cs."searchText" ILIKE $4 ESCAPE '\\' THEN 1 ELSE 0 END AS "exactPhrase",
        u."id" AS "creatorUserId",
        u."firstName" AS "creatorFirstName",
        u."lastName" AS "creatorLastName",
        u."userName" AS "creatorUserName",
        (
          SELECT COUNT(1) FROM "identity"."user_follows" f
          WHERE f."followedId" = u."id" AND f."status" = 'accepted'
        ) AS "followersCount",
        EXISTS (
          SELECT 1 FROM "linkedAccounts" la
          WHERE la."userId" = u."id" AND la."verified" = true
        ) AS "creatorVerified"
      FROM "contentStreams" cs
      LEFT JOIN "identity"."users" u
        ON u."id"::text = cs."creatorId"::text
        AND u."profilePrivacy" = 'Public'
        AND u."isActive" = true
      WHERE ${whereClause}
      ORDER BY "textRelevance" DESC, "textSimilarity" DESC, cs."engagementScore" DESC
      LIMIT $${params.length}
    `;

    const rows: Record<string, any>[] = await this.contentStreamContext.query(
      sql,
      params,
    );

    return rows.map((row) => this.toIndexDocument(row));
  }

  private toIndexDocument(row: Record<string, any>): IndexDocument {
    const meta = (row.metaData as Record<string, any>) || {};
    const engagement = (meta.engagement as Record<string, any>) || {};

    const textRelevance = this.to100(row.textRelevance);
    const textSimilarity = this.to100(row.textSimilarity);
    const phraseRelevance = this.to100(row.phraseRank);
    const engagementScore = this.normalizeEngagement(
      Number(row.engagementScore) || 0,
    );

    const subscriberCount =
      engagement.subscriberCount || engagement.subscribers || 0;
    const followerCount =
      Number(row.followersCount) || engagement.followerCount || 0;

    const creatorName =
      meta.channelName ||
      meta.creatorName ||
      [row.creatorFirstName, row.creatorLastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      '';
    const creatorUsername =
      meta.channelUsername || meta.channelHandle || row.creatorUserName || '';

    return {
      id: row.id,
      type: SearchEntityType.CONTENT,
      subType: row.subType,
      title: row.title,
      description: meta.description || '',
      publishedAt: row.publishedAt ? new Date(row.publishedAt) : undefined,
      platform: row.platform,
      externalId: row.externalId,
      creatorId: row.creatorId || undefined,
      creatorName,
      creatorUsername,
      creatorAvatar:
        meta.channelProfileImage || meta.creatorAvatar || meta.avatar || '',
      verified: row.creatorVerified === true || meta.verified === true,
      followerCount,
      subscriberCount,
      engagementScore,
      engagement: {
        viewCount: engagement.viewCount || engagement.views || 0,
        likeCount: engagement.likeCount || engagement.likes || 0,
        commentCount: engagement.commentCount || engagement.comments || 0,
        shareCount: engagement.shareCount || engagement.shares || 0,
        subscriberCount,
        followerCount,
      },
      thumbnailUrl: meta.thumbnailUrl || '',
      mediaUrl: meta.mediaUrl || '',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      ranking: {
        textRelevance,
        textSimilarity,
        phraseRelevance,
        exactMatch: row.exactMatch === 1,
        exactPhrase: row.exactPhrase === 1 || row.exactMatch === 1,
        engagementScore,
        creatorAuthorityScore: this.creatorAuthority(
          subscriberCount,
          followerCount,
        ),
      },
      metadata: meta,
    };
  }

  private to100(value: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.min(100, parsed * 100);
  }

  private normalizeEngagement(value: number): number {
    if (value <= 0) return 0;
    // Pre-migration rows carry a 0-1 score from the old document builder;
    // new rows are written as 0-100.
    if (value <= 1) return Math.round(value * 100);
    return Math.min(100, value);
  }

  private creatorAuthority(
    subscriberCount: number,
    followerCount: number,
  ): number {
    const max = Math.max(subscriberCount, followerCount);
    if (max <= 0) return 0;
    return Math.min(100, (Math.log(1 + max) / Math.log(1 + 10_000_000)) * 100);
  }
}
