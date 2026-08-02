import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import _const from '../../../core/utils/const';
import redis from '../../../core/utils/redis.util';
import logger from '../../../core/utils/winston.util';
import { Post } from '../../../domain/entities/social';
import { PostStatus } from '../../../domain/enums';
import { IPostRepository } from '../../../domain/repositories/isocial.repository';
import {
  ageInHours,
  logSaturate,
  recencyDecay,
  wilsonLowerBound,
} from '../../../core/utils/recommendation';
import { ComposerService } from './composer.service';

/** How long a lock is held. Long enough for the job, short enough to recover. */
const LOCK_TTL_SECONDS = 240;

/**
 * Community's scheduled work: publishing what is due, and refreshing the
 * cached ranking score.
 *
 * **Every job takes a Redis lock first.** Cloud Run runs more than one
 * instance, `@Cron` fires on all of them, and two instances publishing the
 * same scheduled post at the same moment would double-post it. The lock is
 * best-effort — if Redis is unavailable the job is skipped rather than run
 * unguarded, because a missed tick is recoverable and a double publish is not.
 */
@Injectable()
export class CommunityScheduler {
  constructor(
    @Inject(_const.IPOST_REPOSITORY)
    private readonly posts: IPostRepository,
    private readonly composer: ComposerService,
  ) {}

  /**
   * Publish scheduled posts.
   *
   * Every minute: a post scheduled for 09:00 should go out at 09:00, and a
   * five-minute tick would make "scheduled" mean "some time in the next five
   * minutes", which is not what anyone means by it.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  public async publishScheduled(): Promise<void> {
    await this.withLock('publish-scheduled', async () => {
      const published = await this.composer.publishDueScheduledAsync();
      if (published > 0) {
        logger.info(`[community] published ${published} scheduled post(s)`);
      }
    });
  }

  /**
   * Refresh `hotScore` on recent posts.
   *
   * This is a *retrieval* score, not the ranking score — it orders the topical
   * candidate source so the ranker gets good candidates cheaply. Personalised
   * ranking still happens per request, which is why this can be minutes stale
   * without anyone noticing.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  public async refreshHotScores(): Promise<void> {
    await this.withLock('refresh-hot-scores', async () => {
      const recent = await this.posts.getTrendingCandidateIdsAsync(72, 500);
      if (recent.length === 0) return;

      const posts = await this.posts.getManyByIdsAsync(recent);
      const now = new Date();
      let updated = 0;

      for (const post of posts) {
        const score = computeHotScore(post, now);
        // Only write when it actually moved. Rewriting 500 identical rows
        // every ten minutes is pure WAL churn on a 512 MB instance.
        if (Math.abs(score - post.hotScore) < 0.001) continue;
        await this.posts.updateAsync(post.id, { hotScore: score });
        updated += 1;
      }
      if (updated > 0) {
        logger.info(`[community] refreshed hotScore on ${updated} post(s)`);
      }
    });
  }

  /**
   * Expire stories and closed polls.
   *
   * The read path already filters on `expiresOn`, so this is housekeeping
   * rather than correctness — it keeps expired rows out of the indexes the
   * candidate sources scan.
   */
  @Cron(CronExpression.EVERY_HOUR)
  public async archiveExpired(): Promise<void> {
    await this.withLock('archive-expired', async () => {
      const archived = await this.posts.archiveExpiredAsync(new Date());
      if (archived > 0) {
        logger.info(`[community] archived ${archived} expired post(s)`);
      }
    });
  }

  /**
   * Run `work` only if this instance wins the lock.
   *
   * `incrementInRedisAsync` returning 1 means we created the key, so we hold
   * it. Any Redis failure means no lock, which means no run.
   */
  private async withLock(
    name: string,
    work: () => Promise<void>,
  ): Promise<void> {
    const key = redis.getRedisKey('community:cron', name);
    let acquired = false;
    try {
      acquired =
        (await redis.incrementInRedisAsync(key, LOCK_TTL_SECONDS)) === 1;
    } catch (error) {
      logger.warn(
        `[community] skipping "${name}" — could not take the lock`,
        error,
      );
      return;
    }
    if (!acquired) return;

    try {
      await work();
    } catch (error) {
      logger.error(`[community] scheduled job "${name}" failed`, error);
    } finally {
      await redis.removeFromRedisAsync(key).catch(() => undefined);
    }
  }
}

/**
 * The cached retrieval score for a post.
 *
 * Quality × freshness × reach, each bounded:
 *
 *  - **quality** is the Wilson lower bound of weighted engagement over
 *    impressions, so three interactions on three impressions does not beat
 *    nine hundred on a thousand.
 *  - **freshness** is an exponential decay with a 24-hour half-life.
 *  - **reach** is log-saturated, so one viral post cannot own the index.
 *
 * Exported for unit testing — it is pure, and the behaviour that matters is
 * the ordering it produces.
 */
export function computeHotScore(post: Post, now: Date): number {
  if (post.status !== PostStatus.Published) return 0;

  const interactions =
    post.likesCount +
    3 * post.commentsCount +
    2 * post.repostsCount +
    2 * post.sharesCount;

  const quality = wilsonLowerBound(
    Math.min(interactions, post.impressionsCount),
    Math.max(post.impressionsCount, interactions, 1),
  );
  const freshness = recencyDecay(
    ageInHours(post.publishedOn ?? post.createdOn, now),
    24,
  );
  const reach = logSaturate(interactions, 500);

  return Number((quality * freshness + 0.35 * reach * freshness).toFixed(6));
}
