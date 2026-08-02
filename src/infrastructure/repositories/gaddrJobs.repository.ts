import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ExternalJob, Project } from '../../domain/entities';
import { IGaddrJobsRepository } from '../../domain/repositories/igaddrJobs.repository';
import { containsPattern } from '../../core/utils/likePattern.util';

/**
 * Reads from **Gaddr Jobs**, our sister product.
 *
 * The two products share a database, so this is a direct read rather than an
 * HTTP call. That is a deliberate trade and worth stating plainly: it is
 * faster and has no failure mode of its own, but it couples us to their
 * schema. Two things keep that coupling honest —
 *
 *  1. **Read-only.** Nothing here writes. Gaddr Jobs owns those tables.
 *  2. **No migrations.** `Project` and `ExternalJob` have no migration in this
 *     repository; Drizzle over there owns the DDL.
 *
 * If the products are ever split onto separate databases, this class is the
 * seam: swap the queries for HTTP calls and nothing above it changes.
 *
 * Every method fails soft. Jobs are one source among seven, and a schema drift
 * on their side must degrade the jobs section rather than break search.
 */
@Injectable()
export class GaddrJobsRepository implements IGaddrJobsRepository {
  constructor(
    @InjectRepository(Project)
    private readonly projects: Repository<Project>,
    @InjectRepository(ExternalJob)
    private readonly externalJobs: Repository<ExternalJob>,
  ) {}

  /**
   * Open projects matching a keyword.
   *
   * Searches the title, the description and the skills array — a developer
   * looking for "rust" means the skill, not the word in a sentence, and the
   * array is where that lives.
   */
  public async searchProjectsAsync(
    keyword: string,
    limit: number,
  ): Promise<Project[]> {
    const trimmed = (keyword ?? '').trim();
    if (!trimmed) return [];

    try {
      return await this.projects
        .createQueryBuilder('p')
        .where('p."status" = :open', { open: 'open' })
        .andWhere('p."deleted_at" IS NULL')
        .andWhere('p."is_confidential" = false')
        .andWhere(
          `(p."title" ILIKE :needle
            OR p."description" ILIKE :needle
            OR EXISTS (
              SELECT 1 FROM unnest(p."skills") AS skill
              WHERE skill ILIKE :needle
            ))`,
          { needle: containsPattern(trimmed) },
        )
        .orderBy('p."created_at"', 'DESC')
        .limit(Math.min(limit, 50))
        .getMany();
    } catch {
      // Their schema, their migrations. A drift degrades this source only.
      return [];
    }
  }

  public async searchExternalJobsAsync(
    keyword: string,
    limit: number,
  ): Promise<ExternalJob[]> {
    const trimmed = (keyword ?? '').trim();
    if (!trimmed) return [];

    try {
      return await this.externalJobs
        .createQueryBuilder('j')
        .where('j."is_open" = true')
        .andWhere(
          '(j."title" ILIKE :needle OR j."company" ILIKE :needle OR j."description" ILIKE :needle)',
          { needle: containsPattern(trimmed) },
        )
        // Quality first: these are scraped, and the scores exist precisely
        // because the raw feed contains a lot of noise.
        .orderBy('j."quality_score"', 'DESC', 'NULLS LAST')
        .addOrderBy('j."posted_at"', 'DESC', 'NULLS LAST')
        .limit(Math.min(limit, 50))
        .getMany();
    } catch {
      return [];
    }
  }

  /** Recent open projects, for Explore with no keyword. */
  public async recentProjectsAsync(limit: number): Promise<Project[]> {
    try {
      return await this.projects
        .createQueryBuilder('p')
        .where('p."status" = :open', { open: 'open' })
        .andWhere('p."deleted_at" IS NULL')
        .andWhere('p."is_confidential" = false')
        .orderBy('p."created_at"', 'DESC')
        .limit(Math.min(limit, 50))
        .getMany();
    } catch {
      return [];
    }
  }
}
