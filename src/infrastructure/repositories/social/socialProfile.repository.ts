import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { In, Not, Repository } from 'typeorm';
import { SocialProfile } from '../../../domain/entities/social';
import { ProfileKind, Visibility } from '../../../domain/enums';
import { ISocialProfileRepository } from '../../../domain/repositories/isocial.repository';

@Injectable()
export class SocialProfileRepository implements ISocialProfileRepository {
  constructor(
    @InjectRepository(SocialProfile)
    private readonly context: Repository<SocialProfile>,
  ) {}

  public async getByIdAsync(id: string): Promise<SocialProfile | null> {
    if (!id) return null;
    return this.context.findOne({ where: { id } });
  }

  public async getByUserIdAsync(userId: string): Promise<SocialProfile | null> {
    if (!userId) return null;
    return this.context.findOne({ where: { userId } });
  }

  public async getByHandleAsync(handle: string): Promise<SocialProfile | null> {
    if (!handle) return null;
    return this.context.findOne({ where: { handle: handle.toLowerCase() } });
  }

  public async getManyByIdsAsync(ids: string[]): Promise<SocialProfile[]> {
    if (ids.length === 0) return [];
    return this.context.find({ where: { id: In(ids) } });
  }

  public async getByUserIdsAsync(userIds: string[]): Promise<SocialProfile[]> {
    if (userIds.length === 0) return [];
    return this.context.find({ where: { userId: In(userIds) } });
  }

  public async createAsync(profile: SocialProfile): Promise<SocialProfile> {
    return this.context.save(profile);
  }

  public async updateAsync(
    id: string,
    changes: Partial<SocialProfile>,
  ): Promise<SocialProfile | null> {
    await this.context.update(id, changes);
    return this.getByIdAsync(id);
  }

  public async handleExistsAsync(
    handle: string,
    exceptId?: string,
  ): Promise<boolean> {
    const where = exceptId
      ? { handle: handle.toLowerCase(), id: Not(exceptId) }
      : { handle: handle.toLowerCase() };
    return (await this.context.count({ where })) > 0;
  }

  /**
   * Counters move by a delta in SQL rather than read-modify-write, so two
   * concurrent follows cannot both read 10 and both write 11.
   */
  public async incrementCountersAsync(
    id: string,
    deltas: Partial<
      Pick<SocialProfile, 'followersCount' | 'followingCount' | 'postsCount'>
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
      `UPDATE "social"."profiles" SET ${assignments} WHERE "id" = $1`,
      [id, ...entries.map(([, value]) => value)],
    );
  }

  /**
   * Handle/name search over the trigram indexes.
   *
   * `%` is escaped: a bare `%` used to match the whole table on global search
   * (commit b9fe4c0), and the same shape would recur here.
   */
  public async searchAsync(
    term: string,
    limit: number,
    kinds?: string[],
  ): Promise<SocialProfile[]> {
    const needle = escapeLike(term);
    if (!needle) return [];

    const query = this.context
      .createQueryBuilder('p')
      .where('p."profileVisibility" = :visibility', {
        visibility: Visibility.Public,
      })
      .andWhere(
        '(p."handle" ILIKE :needle OR p."displayName" ILIKE :needle OR p."headline" ILIKE :needle)',
        { needle: `%${needle}%` },
      )
      .orderBy('p."followersCount"', 'DESC')
      .limit(Math.min(limit, 100));

    if (kinds && kinds.length > 0) {
      query.andWhere('p."kind" IN (:...kinds)', { kinds });
    }
    return query.getMany();
  }

  public async getCollaborationPoolAsync(
    topics: string[],
    minFollowers: number,
    limit: number,
  ): Promise<SocialProfile[]> {
    const query = this.context
      .createQueryBuilder('p')
      .where('p."openToCollaborations" = true')
      .andWhere('p."kind" IN (:...kinds)', {
        kinds: [ProfileKind.Creator, ProfileKind.Person],
      })
      .andWhere('p."followersCount" >= :minFollowers', { minFollowers })
      .orderBy('p."authorQuality"', 'DESC')
      .addOrderBy('p."followersCount"', 'DESC')
      .limit(Math.min(limit, 500));

    if (topics.length > 0) {
      query.andWhere('p."topics" && :topics', { topics });
    }
    return query.getMany();
  }

  public async getSuggestionsAsync(
    excludeIds: string[],
    topics: string[],
    limit: number,
  ): Promise<SocialProfile[]> {
    const query = this.context
      .createQueryBuilder('p')
      .where('p."profileVisibility" = :visibility', {
        visibility: Visibility.Public,
      })
      .orderBy('p."authorQuality"', 'DESC')
      .addOrderBy('p."followersCount"', 'DESC')
      .limit(Math.min(limit, 100));

    if (excludeIds.length > 0) {
      query.andWhere('p."id" NOT IN (:...excludeIds)', { excludeIds });
    }
    if (topics.length > 0) {
      query.andWhere('p."topics" && :topics', { topics });
    }
    return query.getMany();
  }
}

/**
 * Escape LIKE wildcards in user input.
 *
 * Shared by every social repository that does an ILIKE. Exported so the one
 * implementation is reused rather than re-typed per file — a bare `%` reaching
 * `ILIKE` matched the entire table once already.
 */
export function escapeLike(term: string): string {
  return (term ?? '').trim().replace(/[\\%_]/g, (m) => `\\${m}`);
}
