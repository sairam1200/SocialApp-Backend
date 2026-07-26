import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { In, LessThan, Repository, SelectQueryBuilder } from 'typeorm';
import {
  PollOption,
  Post,
  PostMedia,
  PostProduct,
} from '../../../domain/entities/social';
import { PostKind, PostStatus } from '../../../domain/enums';
import {
  PUBLIC_SCOPE,
  VisibilityScope,
  visibilityPredicate,
} from '../../../core/utils/recommendation/visibility-scope';
import {
  FeedCursor,
  FeedQuery,
  IPostRepository,
} from '../../../domain/repositories/isocial.repository';
import { escapeLike } from './socialProfile.repository';

/** Candidate retrieval never looks further back than this, whatever is asked. */
const MAX_CANDIDATE_LIMIT = 600;

@Injectable()
export class PostRepository implements IPostRepository {
  constructor(
    @InjectRepository(Post)
    private readonly context: Repository<Post>,
    @InjectRepository(PostMedia)
    private readonly mediaContext: Repository<PostMedia>,
    @InjectRepository(PollOption)
    private readonly pollOptionContext: Repository<PollOption>,
    @InjectRepository(PostProduct)
    private readonly postProductContext: Repository<PostProduct>,
  ) {}

  public async getByIdAsync(id: string): Promise<Post | null> {
    if (!id) return null;
    return this.context.findOne({ where: { id } });
  }

  public async getManyByIdsAsync(ids: string[]): Promise<Post[]> {
    if (ids.length === 0) return [];
    return this.context.find({ where: { id: In(ids) } });
  }

  public async createAsync(post: Post): Promise<Post> {
    return this.context.save(post);
  }

  public async updateAsync(
    id: string,
    changes: Partial<Post>,
  ): Promise<Post | null> {
    await this.context.update(id, changes);
    return this.getByIdAsync(id);
  }

  public async deleteAsync(id: string): Promise<void> {
    await this.context.delete(id);
  }

  /**
   * Every read of published content starts here.
   *
   * Visibility, expiry and status are applied in SQL, not after the fact —
   * filtering a fetched page in application code shrinks it silently and makes
   * the keyset cursor skip rows at page boundaries.
   */
  private baseVisibleQuery(
    alias: string,
    scope: VisibilityScope,
  ): SelectQueryBuilder<Post> {
    const predicate = visibilityPredicate(alias, scope);
    const builder = this.context
      .createQueryBuilder(alias)
      .where(`${alias}."status" = :published`, {
        published: PostStatus.Published,
      })
      .andWhere(predicate.sql, predicate.parameters)
      .andWhere(
        `(${alias}."expiresOn" IS NULL OR ${alias}."expiresOn" > NOW())`,
      );

    if (scope.excludedProfileIds.length > 0) {
      builder.andWhere(`${alias}."authorProfileId" NOT IN (:...excludedIds)`, {
        excludedIds: scope.excludedProfileIds,
      });
    }
    return builder;
  }

  public async getFeedPageAsync(query: FeedQuery): Promise<Post[]> {
    const builder = this.baseVisibleQuery('p', query.scope)
      .andWhere('p."kind" != :comment', { comment: PostKind.Comment })
      .orderBy('p."publishedOn"', 'DESC')
      .addOrderBy('p."id"', 'DESC')
      .limit(Math.min(query.limit, 100));

    if (query.before) {
      builder.andWhere('p."publishedOn" < :before', {
        before: new Date(query.before),
      });
    }
    if (query.authorProfileIds && query.authorProfileIds.length > 0) {
      builder.andWhere('p."authorProfileId" IN (:...authorIds)', {
        authorIds: query.authorProfileIds,
      });
    }
    if (query.excludeAuthorProfileIds?.length) {
      builder.andWhere('p."authorProfileId" NOT IN (:...excludeIds)', {
        excludeIds: query.excludeAuthorProfileIds,
      });
    }
    if (query.kinds && query.kinds.length > 0) {
      builder.andWhere('p."kind" IN (:...kinds)', { kinds: query.kinds });
    }
    if (query.topics && query.topics.length > 0) {
      builder.andWhere('p."topics" && :topics', { topics: query.topics });
    }
    return builder.getMany();
  }

  /* -------------------------------------------------------- candidate sources
   *
   * Each returns ids only. Hydration happens once after fusion instead of once
   * per source, which is the difference between five SELECT-star queries and
   * one.
   */

  public async getInNetworkCandidateIdsAsync(
    authorProfileIds: string[],
    scope: VisibilityScope,
    sinceHours: number,
    limit: number,
  ): Promise<string[]> {
    if (authorProfileIds.length === 0) return [];
    const rows = await this.baseVisibleQuery('p', scope)
      .select('p.id', 'id')
      .andWhere('p."authorProfileId" IN (:...authorIds)', {
        authorIds: authorProfileIds,
      })
      .andWhere('p."kind" != :comment', { comment: PostKind.Comment })
      .andWhere(
        `p."publishedOn" > NOW() - (:sinceHours || ' hours')::interval`,
        {
          sinceHours,
        },
      )
      .orderBy('p."publishedOn"', 'DESC')
      .limit(Math.min(limit, MAX_CANDIDATE_LIMIT))
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  public async getTopicCandidateIdsAsync(
    topics: string[],
    sinceHours: number,
    limit: number,
  ): Promise<string[]> {
    if (topics.length === 0) return [];
    const rows = await this.baseVisibleQuery('p', PUBLIC_SCOPE)
      .select('p.id', 'id')
      .andWhere('p."topics" && :topics', { topics })
      .andWhere('p."kind" != :comment', { comment: PostKind.Comment })
      .andWhere(
        `p."publishedOn" > NOW() - (:sinceHours || ' hours')::interval`,
        {
          sinceHours,
        },
      )
      .orderBy('p."hotScore"', 'DESC')
      .addOrderBy('p."publishedOn"', 'DESC')
      .limit(Math.min(limit, MAX_CANDIDATE_LIMIT))
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  /**
   * Trending: engagement per hour of age, not raw engagement.
   *
   * Ordering by likes alone returns the same all-time-popular posts every day;
   * dividing by age is what makes "trending" mean "rising now".
   */
  public async getTrendingCandidateIdsAsync(
    sinceHours: number,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.baseVisibleQuery('p', PUBLIC_SCOPE)
      .select('p.id', 'id')
      .andWhere('p."kind" != :comment', { comment: PostKind.Comment })
      .andWhere(
        `p."publishedOn" > NOW() - (:sinceHours || ' hours')::interval`,
        {
          sinceHours,
        },
      )
      .orderBy(
        `(p."likesCount" + 3 * p."commentsCount" + 2 * p."repostsCount" + 2 * p."sharesCount")
           / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p."publishedOn")) / 3600)`,
        'DESC',
      )
      .limit(Math.min(limit, MAX_CANDIDATE_LIMIT))
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  public async getFreshCandidateIdsAsync(
    sinceHours: number,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.baseVisibleQuery('p', PUBLIC_SCOPE)
      .select('p.id', 'id')
      .andWhere('p."kind" != :comment', { comment: PostKind.Comment })
      .andWhere(
        `p."publishedOn" > NOW() - (:sinceHours || ' hours')::interval`,
        {
          sinceHours,
        },
      )
      // Low impressions first: this source exists to give new work a chance.
      .orderBy('p."impressionsCount"', 'ASC')
      .addOrderBy('p."publishedOn"', 'DESC')
      .limit(Math.min(limit, MAX_CANDIDATE_LIMIT))
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  /**
   * Item-to-item collaborative filtering, in one query.
   *
   * "People who reacted to what you reacted to also reacted to these." The
   * classic Amazon item-item formulation — it needs no model, updates the
   * moment someone reacts, and degrades gracefully to nothing for a cold user.
   *
   * Bounded at both hops (`LIMIT` inside each CTE) so a user who liked ten
   * thousand posts cannot make this scan the table.
   */
  public async getCoEngagementCandidateIdsAsync(
    viewerProfileId: string,
    sinceHours: number,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.context.query(
      `
      WITH my_reactions AS (
        SELECT "postId" FROM "social"."reactions"
        WHERE "profileId" = $1
        ORDER BY "createdOn" DESC
        LIMIT 100
      ),
      neighbours AS (
        SELECT DISTINCT r."profileId"
        FROM "social"."reactions" r
        JOIN my_reactions m ON m."postId" = r."postId"
        WHERE r."profileId" <> $1
        LIMIT 400
      )
      SELECT p."id" AS id, COUNT(*) AS affinity
      FROM "social"."reactions" r
      JOIN neighbours n ON n."profileId" = r."profileId"
      JOIN "social"."posts" p ON p."id" = r."postId"
      WHERE p."status" = 'published'
        AND p."visibility" = 'public'
        AND (p."expiresOn" IS NULL OR p."expiresOn" > NOW())
        AND p."publishedOn" > NOW() - ($2 || ' hours')::interval
        AND p."id" NOT IN (SELECT "postId" FROM my_reactions)
        AND p."authorProfileId" <> $1
      GROUP BY p."id"
      ORDER BY affinity DESC, p."publishedOn" DESC
      LIMIT $3
      `,
      [viewerProfileId, sinceHours, Math.min(limit, MAX_CANDIDATE_LIMIT)],
    );
    return (rows as Array<{ id: string }>).map((r) => r.id);
  }

  public async getSponsoredCandidateIdsAsync(
    topics: string[],
    limit: number,
  ): Promise<string[]> {
    const builder = this.baseVisibleQuery('p', PUBLIC_SCOPE)
      .select('p.id', 'id')
      .andWhere('p."isSponsored" = true')
      .orderBy('p."publishedOn"', 'DESC')
      .limit(Math.min(limit, 50));
    if (topics.length > 0) {
      builder.andWhere('p."topics" && :topics', { topics });
    }
    const rows = await builder.getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  /* ------------------------------------------------------------------ threads */

  public async getThreadAsync(
    rootId: string,
    scope: VisibilityScope,
    limit: number,
  ): Promise<Post[]> {
    return this.baseVisibleQuery('p', scope)
      .andWhere('(p."rootId" = :rootId OR p."id" = :rootId)', { rootId })
      .orderBy('p."createdOn"', 'ASC')
      .limit(Math.min(limit, 300))
      .getMany();
  }

  public async getRepliesAsync(
    parentId: string,
    scope: VisibilityScope,
    cursor: FeedCursor,
  ): Promise<Post[]> {
    const builder = this.baseVisibleQuery('p', scope)
      .andWhere('p."parentId" = :parentId', { parentId })
      .orderBy('p."createdOn"', 'ASC')
      .limit(Math.min(cursor.limit, 100));
    if (cursor.before) {
      builder.andWhere('p."createdOn" > :after', {
        after: new Date(cursor.before),
      });
    }
    return builder.getMany();
  }

  /* --------------------------------------------------------------- scheduling */

  public async getScheduledDueAsync(now: Date, limit: number): Promise<Post[]> {
    return this.context.find({
      where: {
        status: PostStatus.Scheduled,
        scheduledFor: LessThan(now),
      },
      order: { scheduledFor: 'ASC' },
      take: Math.min(limit, 200),
    });
  }

  public async getCalendarAsync(
    authorProfileId: string,
    from: Date,
    to: Date,
    statuses: PostStatus[],
  ): Promise<Post[]> {
    return this.context
      .createQueryBuilder('p')
      .where('p."authorProfileId" = :authorProfileId', { authorProfileId })
      .andWhere('p."status" IN (:...statuses)', {
        statuses: statuses.length > 0 ? statuses : [PostStatus.Scheduled],
      })
      .andWhere(
        'COALESCE(p."scheduledFor", p."publishedOn", p."createdOn") BETWEEN :from AND :to',
        { from, to },
      )
      .orderBy(
        'COALESCE(p."scheduledFor", p."publishedOn", p."createdOn")',
        'ASC',
      )
      .limit(500)
      .getMany();
  }

  public async getDraftsAsync(
    authorProfileId: string,
    cursor: FeedCursor,
  ): Promise<Post[]> {
    const builder = this.context
      .createQueryBuilder('p')
      .where('p."authorProfileId" = :authorProfileId', { authorProfileId })
      .andWhere('p."status" = :draft', { draft: PostStatus.Draft })
      .orderBy('p."lastModifiedOn"', 'DESC')
      .addOrderBy('p."createdOn"', 'DESC')
      .limit(Math.min(cursor.limit, 100));
    if (cursor.before) {
      builder.andWhere('p."createdOn" < :before', {
        before: new Date(cursor.before),
      });
    }
    return builder.getMany();
  }

  public async incrementCountersAsync(
    id: string,
    deltas: Partial<
      Pick<
        Post,
        | 'likesCount'
        | 'commentsCount'
        | 'repostsCount'
        | 'sharesCount'
        | 'impressionsCount'
        | 'clicksCount'
      >
    >,
  ): Promise<void> {
    const entries = Object.entries(deltas).filter(
      ([, value]) => typeof value === 'number' && value !== 0,
    );
    if (entries.length === 0) return;

    const assignments = entries
      .map(
        ([column], index) =>
          `"${column}" = GREATEST(0, "${column}" + $${index + 2})`,
      )
      .join(', ');
    await this.context.query(
      `UPDATE "social"."posts" SET ${assignments} WHERE "id" = $1`,
      [id, ...entries.map(([, value]) => value)],
    );
  }

  public async searchAsync(
    term: string,
    scope: VisibilityScope,
    limit: number,
  ): Promise<Post[]> {
    const needle = escapeLike(term);
    if (!needle) return [];
    return this.baseVisibleQuery('p', scope)
      .andWhere('p."kind" != :comment', { comment: PostKind.Comment })
      .andWhere('p."searchText" ILIKE :needle', { needle: `%${needle}%` })
      .orderBy('p."hotScore"', 'DESC')
      .addOrderBy('p."publishedOn"', 'DESC')
      .limit(Math.min(limit, 100))
      .getMany();
  }

  /* -------------------------------------------------------------- attachments */

  public async getMediaForPostsAsync(postIds: string[]): Promise<PostMedia[]> {
    if (postIds.length === 0) return [];
    return this.mediaContext.find({
      where: { postId: In(postIds) },
      order: { position: 'ASC' },
    });
  }

  public async getPollOptionsForPostsAsync(
    postIds: string[],
  ): Promise<PollOption[]> {
    if (postIds.length === 0) return [];
    return this.pollOptionContext.find({
      where: { postId: In(postIds) },
      order: { position: 'ASC' },
    });
  }

  public async getProductTagsForPostsAsync(
    postIds: string[],
  ): Promise<PostProduct[]> {
    if (postIds.length === 0) return [];
    return this.postProductContext.find({ where: { postId: In(postIds) } });
  }

  public async replaceMediaAsync(
    postId: string,
    media: PostMedia[],
  ): Promise<PostMedia[]> {
    await this.mediaContext.delete({ postId });
    if (media.length === 0) return [];
    return this.mediaContext.save(media);
  }

  public async replacePollOptionsAsync(
    postId: string,
    options: PollOption[],
  ): Promise<PollOption[]> {
    await this.pollOptionContext.delete({ postId });
    if (options.length === 0) return [];
    return this.pollOptionContext.save(options);
  }

  public async replaceProductTagsAsync(
    postId: string,
    tags: PostProduct[],
  ): Promise<PostProduct[]> {
    await this.postProductContext.delete({ postId });
    if (tags.length === 0) return [];
    return this.postProductContext.save(tags);
  }

  /**
   * Archive posts whose expiry has passed.
   *
   * A single UPDATE rather than a read-then-write loop — this touches at most
   * a day's worth of stories, and pulling them into memory to write them back
   * one at a time is the shape that stops scaling first.
   *
   * The read paths already filter on `expiresOn`, so this is housekeeping:
   * it keeps dead rows out of the partial indexes the candidate sources scan.
   */
  public async archiveExpiredAsync(now: Date): Promise<number> {
    const result = await this.context.query(
      `UPDATE "social"."posts"
       SET "status" = $1, "lastModifiedOn" = NOW()
       WHERE "status" = $2
         AND "expiresOn" IS NOT NULL
         AND "expiresOn" <= $3`,
      [PostStatus.Archived, PostStatus.Published, now],
    );
    // `pg` returns [rows, rowCount] for an UPDATE with no RETURNING.
    return Array.isArray(result) ? Number(result[1] ?? 0) : 0;
  }

  public async countByAuthorAsync(authorProfileId: string): Promise<number> {
    return this.context.count({
      where: { authorProfileId, status: PostStatus.Published },
    });
  }
}
