import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import _const from '../../../core/utils/const';
import { CreatorAnalyticsModel } from '../../../domain/contracts/social.model';
import { EngagementEvent, Post } from '../../../domain/entities/social';
import { LedgerEntryStatus, PostStatus } from '../../../domain/enums';
import {
  ICommerceRepository,
  ISocialProfileRepository,
} from '../../../domain/repositories/isocial.repository';
import { summarise } from '../../../core/utils/recommendation';

/**
 * Creator analytics: traffic, interactions, reach, earnings, post performance.
 *
 * Computed from `engagement_events` and the post counters rather than from a
 * pre-aggregated rollup table. That is a deliberate trade at this scale — one
 * grouped query over a bounded window is fast, always current, and cannot
 * silently drift from the source the way a rollup does. If the window ever
 * costs too much, the fix is a materialised view behind this same method, not
 * a second write path.
 */
@Injectable()
export class CreatorAnalyticsService {
  constructor(
    @InjectRepository(EngagementEvent)
    private readonly events: Repository<EngagementEvent>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    @Inject(_const.ISOCIALPROFILE_REPOSITORY)
    private readonly profiles: ISocialProfileRepository,
    @Inject(_const.ICOMMERCE_REPOSITORY)
    private readonly commerce: ICommerceRepository,
  ) {}

  public async getAsync(
    userId: string,
    rangeDays = 28,
  ): Promise<CreatorAnalyticsModel> {
    const profile = await this.profiles.getByUserIdAsync(userId);
    if (!profile) throw new NotFoundException('Community profile not found.');

    const days = Math.min(Math.max(rangeDays, 1), 365);

    const [totals, daily, topPosts, ledger] = await Promise.all([
      this.totals(profile.id, days),
      this.daily(profile.id, days),
      this.topPosts(profile.id, days),
      this.commerce.listLedgerAsync(profile.id, 500),
    ]);

    const since = Date.now() - days * 86_400_000;
    const earningsMinor = ledger
      .filter(
        (e) =>
          e.status === LedgerEntryStatus.Cleared &&
          e.createdOn.getTime() >= since &&
          BigInt(e.amountMinor) > 0n,
      )
      .reduce((sum, e) => sum + BigInt(e.amountMinor) - BigInt(e.feeMinor), 0n);

    return {
      profileId: profile.id,
      rangeDays: days,
      impressions: totals.impressions,
      reach: totals.reach,
      interactions: totals.interactions,
      shares: totals.shares,
      profileVisits: totals.profileVisits,
      followersGained: totals.follows,
      engagementRate:
        totals.impressions > 0 ? totals.interactions / totals.impressions : 0,
      earningsMinor: earningsMinor.toString(),
      currency: ledger[0]?.currency ?? 'EUR',
      daily,
      topPosts,
    };
  }

  /**
   * Totals over the window.
   *
   * `reach` is distinct actors, not impressions — the difference matters, and
   * conflating them is the single most common way a creator dashboard lies.
   */
  private async totals(
    profileId: string,
    days: number,
  ): Promise<{
    impressions: number;
    reach: number;
    interactions: number;
    shares: number;
    profileVisits: number;
    follows: number;
  }> {
    const rows = await this.events.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE e."kind" = 'impression')::int              AS impressions,
        COUNT(DISTINCT e."actorProfileId") FILTER
          (WHERE e."kind" = 'impression')::int                            AS reach,
        COUNT(*) FILTER (WHERE e."kind" IN
          ('like','comment','repost','bookmark','click'))::int            AS interactions,
        COUNT(*) FILTER (WHERE e."kind" = 'share')::int                   AS shares,
        COUNT(*) FILTER (WHERE e."kind" = 'profile_visit')::int           AS profile_visits,
        COUNT(*) FILTER (WHERE e."kind" = 'follow')::int                  AS follows
      FROM "social"."engagement_events" e
      LEFT JOIN "social"."posts" p ON p."id" = e."subjectId"
      WHERE e."createdOn" > NOW() - ($2 || ' days')::interval
        AND (p."authorProfileId" = $1 OR e."subjectId" = $1)
      `,
      [profileId, days],
    );

    const row = (rows as Array<Record<string, number>>)[0] ?? {};
    return {
      impressions: Number(row.impressions ?? 0),
      reach: Number(row.reach ?? 0),
      interactions: Number(row.interactions ?? 0),
      shares: Number(row.shares ?? 0),
      profileVisits: Number(row.profile_visits ?? 0),
      follows: Number(row.follows ?? 0),
    };
  }

  /**
   * Per-day series.
   *
   * `generate_series` supplies every day in the window so a quiet day is a
   * zero rather than a missing point — a chart that skips empty days
   * misrepresents a drop as a plateau.
   */
  private async daily(
    profileId: string,
    days: number,
  ): Promise<
    Array<{
      date: string;
      impressions: number;
      interactions: number;
      followers: number;
    }>
  > {
    const rows = await this.events.query(
      `
      WITH span AS (
        SELECT generate_series(
          date_trunc('day', NOW() - ($2 || ' days')::interval),
          date_trunc('day', NOW()),
          '1 day'
        )::date AS day
      ),
      counted AS (
        SELECT
          date_trunc('day', e."createdOn")::date AS day,
          COUNT(*) FILTER (WHERE e."kind" = 'impression')::int AS impressions,
          COUNT(*) FILTER (WHERE e."kind" IN
            ('like','comment','repost','bookmark','click','share'))::int AS interactions,
          COUNT(*) FILTER (WHERE e."kind" = 'follow')::int AS followers
        FROM "social"."engagement_events" e
        LEFT JOIN "social"."posts" p ON p."id" = e."subjectId"
        WHERE e."createdOn" > NOW() - ($2 || ' days')::interval
          AND (p."authorProfileId" = $1 OR e."subjectId" = $1)
        GROUP BY 1
      )
      SELECT
        span.day::text AS date,
        COALESCE(counted.impressions, 0) AS impressions,
        COALESCE(counted.interactions, 0) AS interactions,
        COALESCE(counted.followers, 0) AS followers
      FROM span
      LEFT JOIN counted ON counted.day = span.day
      ORDER BY span.day ASC
      `,
      [profileId, days],
    );

    return (rows as Array<Record<string, string | number>>).map((r) => ({
      date: String(r.date),
      impressions: Number(r.impressions ?? 0),
      interactions: Number(r.interactions ?? 0),
      followers: Number(r.followers ?? 0),
    }));
  }

  private async topPosts(
    profileId: string,
    days: number,
  ): Promise<CreatorAnalyticsModel['topPosts']> {
    const posts = await this.posts
      .createQueryBuilder('p')
      .where('p."authorProfileId" = :profileId', { profileId })
      .andWhere('p."status" = :published', { published: PostStatus.Published })
      .andWhere(`p."publishedOn" > NOW() - (:days || ' days')::interval`, {
        days,
      })
      .orderBy(
        'p."likesCount" + 3 * p."commentsCount" + 2 * p."repostsCount" + 2 * p."sharesCount"',
        'DESC',
      )
      .limit(10)
      .getMany();

    return posts.map((p) => {
      const interactions =
        p.likesCount + p.commentsCount + p.repostsCount + p.sharesCount;
      return {
        id: p.id,
        body: summarise(p.body ?? '', 120),
        impressions: p.impressionsCount,
        interactions,
        engagementRate:
          p.impressionsCount > 0 ? interactions / p.impressionsCount : 0,
        publishedOn: p.publishedOn ?? null,
      };
    });
  }
}
