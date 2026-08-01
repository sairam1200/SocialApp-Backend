import { Repository, In, MoreThan, Brackets } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  UserContent,
  UserBiometric,
  LinkedAccount,
} from '../../domain/entities';
import { IUserContentRepository } from '../../domain/repositories';
import { QueryOptions } from '../../domain/types/queryOptions.type';
import { SearchContentProjection } from '../../domain/repositories/iuserContent.repository';
import { User } from '../../domain/entities/identity/user.entity';
import redis from '../../core/utils/redis.util';
@Injectable()
export class UserContentRepository implements IUserContentRepository {
  constructor(
    @InjectRepository(UserContent)
    private readonly userContentContext: Repository<UserContent>,
  ) {}

  public async createAsync(content: UserContent): Promise<UserContent> {
    const existingContent = await this.getByPlatformAndContentIdAsync(
      content.userId,
      content.platform,
      content.externalId,
    );
    if (existingContent) {
      existingContent.title = content.title;
      existingContent.metaData = content.metaData;

      await this.updateAsync(existingContent);
      return existingContent;
    }

    const saved = await this.userContentContext.save(content);

    this.invalidateDiscoverFeedCache().catch(() => {});

    return saved;
  }

  public async updateAsync(content: UserContent): Promise<void> {
    await this.userContentContext.save(content);
  }

  public async getByPlatformAndContentIdAsync(
    userId: string,
    platform: string,
    contentId: string,
  ): Promise<UserContent | null> {
    return await this.userContentContext.findOne({
      where: { userId, platform, externalId: contentId },
    });
  }

  public async getByIdAsync(id: string): Promise<UserContent | null> {
    return await this.userContentContext.findOne({ where: { id } });
  }

  public async deleteAsync(content: UserContent): Promise<void> {
    await this.userContentContext.remove(content);
    this.invalidateDiscoverFeedCache().catch(() => {});
  }
  public async getByUserIdAsync(
    userId: string,
    platform: string,
    cursor: string,
  ): Promise<[UserContent[], string]> {
    const take = 20;
    const sortField = 'COALESCE(content.publishedAt, content.createdOn)';

    const qb = this.userContentContext
      .createQueryBuilder('content')
      .where('content.userId = :userId', { userId })
      .andWhere('content.platform = :platform', { platform })
      .orderBy(sortField, 'DESC')
      .addOrderBy('content.id', 'DESC')
      .take(take + 1);

    if (cursor) {
      const cursorDate = new Date(
        cursor.includes('|') ? cursor.split('|')[0] : cursor,
      );
      if (cursor.includes('|')) {
        const [, cursorId] = cursor.split('|');
        qb.andWhere(
          `(${sortField} < :cursorDate OR (${sortField} = :cursorDate AND content.id < :cursorId))`,
          { cursorDate, cursorId },
        );
      } else {
        qb.andWhere(`${sortField} < :cursorDate`, { cursorDate });
      }
    }

    const items = await qb.getMany();

    const hasMore = items.length > take;

    if (hasMore) {
      items.pop();
    }

    const nextCursor = hasMore
      ? `${(items[items.length - 1].publishedAt || items[items.length - 1].createdOn).toISOString()}|${items[items.length - 1].id}`
      : '';

    return [items, nextCursor];
  }

  public async getDiscoverFeedAsync(
    cursor?: string,
    limit: number = 20,
    userId?: string,
    viewerUserId?: string,
  ): Promise<[UserContent[], string | null]> {
    const take = Math.min(limit, 50);
    const sortField = 'COALESCE(uc.publishedAt, uc.createdOn)';
    const sortAlias = 'discover_sort_time';

    const qb = this.userContentContext
      .createQueryBuilder('uc')
      .leftJoinAndSelect('uc.user', 'user')
      .leftJoinAndSelect('user.biometrics', 'bio')
      .leftJoinAndSelect('uc.linkedAccount', 'linkedAccount')
      .addSelect(sortField, sortAlias)
      .orderBy(sortAlias, 'DESC')
      .addOrderBy('uc.id', 'DESC')
      .take(take + 1);

    if (cursor) {
      const cursorDate = new Date(
        cursor.includes('|') ? cursor.split('|')[0] : cursor,
      );
      if (cursor.includes('|')) {
        const [, cursorId] = cursor.split('|');
        qb.andWhere(
          `(${sortField} < :cursorDate OR (${sortField} = :cursorDate AND uc.id < :cursorId))`,
          { cursorDate, cursorId },
        );
      } else {
        qb.andWhere(`${sortField} < :cursorDate`, { cursorDate });
      }
    }

    if (userId) {
      qb.andWhere('uc.userId = :userId', { userId });
    }

    if (viewerUserId) {
      qb.andWhere(
        `(user.profilePrivacy = 'Public' OR user.id = CAST(:viewerUserId AS uuid) OR EXISTS (
            SELECT 1 FROM "identity"."user_follows" f
            WHERE f."followerId" = CAST(:viewerUserId AS uuid)
              AND f."followedId" = user.id AND f.status = 'accepted'
        ))`,
        { viewerUserId },
      );
    } else {
      qb.andWhere("user.profilePrivacy = 'Public'");
    }

    const items = await qb.getMany();

    const hasMore = items.length > take;

    if (hasMore) {
      items.pop();
    }

    const nextCursor = hasMore
      ? `${(items[items.length - 1].publishedAt || items[items.length - 1].createdOn).toISOString()}|${items[items.length - 1].id}`
      : null;

    return [items, nextCursor];
  }

  async getEntriesAsync(
    params: QueryOptions,
  ): Promise<[UserContent[], number]> {
    let { page, pageSize, orderBy, order, searchQuery, filter } = params;
    console.log('Query Options:', searchQuery);
    const queryBuilder = this.userContentContext
      .createQueryBuilder('uc')
      .leftJoinAndSelect('uc.user', 'user')
      .leftJoinAndSelect('uc.linkedAccount', 'linkedAccount');

    if (!orderBy) {
      orderBy = 'title';
    }

    const whereConditions: string[] = [];
    const parameters: any = {};

    if (searchQuery) {
      whereConditions.push(`
        (
          uc.title ILIKE :searchQuery
          OR uc.text ILIKE :searchQuery
          OR EXISTS (
            SELECT 1
            FROM json_each_text(uc.metaData) AS kv(key, value)
            WHERE value ILIKE :searchQuery
          )
        )
      `);
      parameters.searchQuery = `%${searchQuery}%`;
    }

    if (filter?.externalId) {
      whereConditions.push('uc.externalId = :externalId');
      parameters.externalId = filter.externalId;
    }

    if (filter?.type) {
      whereConditions.push('uc.type = :type');
      parameters.type = filter.type;
    }

    if (whereConditions.length > 0) {
      queryBuilder.where(whereConditions.join(' AND '), parameters);
    }

    if (searchQuery) {
      const exactSearch = searchQuery.toLowerCase();
      queryBuilder
        .addOrderBy(
          `CASE WHEN uc.title ILIKE :exactSearch THEN 0 
                 WHEN uc.title ILIKE :searchQuery THEN 1 
                 ELSE 2 END`,
          'ASC',
        )
        .addOrderBy(`uc.${orderBy}`, order)
        .setParameter('exactSearch', `%${exactSearch}%`)
        .setParameter('searchQuery', parameters.searchQuery);
    } else {
      queryBuilder.orderBy(`uc.${orderBy}`, order);
    }

    queryBuilder.skip((page - 1) * pageSize).take(pageSize);
    const result = await queryBuilder.getManyAndCount();
    console.log('Query Result:', result);
    return result;
  }

  public async searchGlobalAsync(
    keyword: string,
    viewerUserId: string | null,
    page: number,
    limit: number,
  ): Promise<[SearchContentProjection[], number]> {
    const escapedKeyword = keyword.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escapedKeyword}%`;
    const qb = this.createGlobalSearchQuery(viewerUserId)
      .andWhere(
        `(
           (content.platform = 'facebook'
            AND EXISTS (SELECT 1 FROM json_each_text(content.metaData) AS kv(key, value)
                        WHERE key = 'message' AND value ILIKE :pattern ESCAPE '\\'))
           OR
           (content.platform = 'instagram'
            AND EXISTS (SELECT 1 FROM json_each_text(content.metaData) AS kv(key, value)
                        WHERE key = 'caption' AND value ILIKE :pattern ESCAPE '\\'))
           OR
           (content.platform IN ('pinterest', 'youtube')
            AND (content.title ILIKE :pattern ESCAPE '\\'
                 OR EXISTS (SELECT 1 FROM json_each_text(content.metaData) AS kv(key, value)
                            WHERE key = 'description' AND value ILIKE :pattern ESCAPE '\\')))
           OR
           (content.platform NOT IN ('facebook', 'instagram', 'pinterest', 'youtube')
            AND content.title ILIKE :pattern ESCAPE '\\')
         )`,
        { pattern },
      )
      .orderBy(
        `CASE
        WHEN LOWER(content.title) = LOWER(:keyword) THEN 0
        WHEN content.title ILIKE :prefix ESCAPE '\\' THEN 1
        ELSE 2 END`,
        'ASC',
      )
      .addOrderBy('content.publishedAt', 'DESC', 'NULLS LAST')
      .setParameters({ keyword, prefix: `${escapedKeyword}%` });
    const rows = await qb.clone().getRawMany();
    const count = rows.length;

    return [rows.map(this.mapSearchRow), count];
  }

  private createGlobalSearchQuery(viewerUserId: string | null) {
    const qb = this.userContentContext
      .createQueryBuilder('content')
      .innerJoin(User, 'creator', 'creator.id = content.userId')
      .leftJoin(UserBiometric, 'creatorbio', 'creatorbio."userId" = creator.id')
      .leftJoin(LinkedAccount, 'la', 'la.id = content.linkedAccountId')
      .select([
        'content.id AS id',
        'content.title AS title',
        'content.type AS type',
        'content.platform AS platform',
        'content.externalId AS "externalId"',
        'content.sourceUrl AS "sourceUrl"',
        'content.publishedAt AS "publishedAt"',
        'content.media AS media',
        'content.metaData AS "metaData"',
        'content.engagement AS engagement',
        'creator.id AS "userId"',
        'creator.firstName AS "userFirstName"',
        'creator.lastName AS "userLastName"',
        'creator.userName AS "userName"',
        'creator.bio AS "userBio"',
        'creatorbio."profileImageUrl" AS "profileImageUrl"',
        'creatorbio."defaultProfileImageUrl" AS "defaultProfileImageUrl"',
        'creatorbio.privacy AS "profileImagePrivacy"',
        'la."userName" AS "linkedAccountUserName"',
        'la."profileImage" AS "linkedAccountProfileImage"',
        'la."verified" AS "linkedAccountVerified"',
        'la."externalUrl" AS "linkedAccountExternalUrl"',
        'la."metaData" AS "linkedAccountMetaData"',
        'la."platform" AS "linkedAccountPlatform"',
      ])
      .where('creator.isActive = true');

    if (viewerUserId) {
      qb.andWhere(
        `(creator.profilePrivacy = 'Public' OR creator.id = CAST(:viewerUserId AS uuid) OR EXISTS (
          SELECT 1 FROM identity.user_follows follow
          WHERE follow."followerId" = CAST(:viewerUserId AS uuid)
            AND follow."followedId" = creator.id
            AND follow.status = 'accepted'
        ))`,
        { viewerUserId },
      );
    } else {
      qb.andWhere("creator.profilePrivacy = 'Public'");
    }

    return qb;
  }

  private mapSearchRow(row: any): SearchContentProjection {
    const linkedAccount = row.linkedAccountUserName
      ? {
          userName: row.linkedAccountUserName,
          profileImage: row.linkedAccountProfileImage ?? null,
          verified: row.linkedAccountVerified ?? false,
          externalUrl: row.linkedAccountExternalUrl ?? null,
          metaData: row.linkedAccountMetaData ?? null,
          platform: row.linkedAccountPlatform ?? row.platform,
        }
      : null;

    return {
      id: row.id,
      title: row.title,
      type: row.type,
      platform: row.platform,
      externalId: row.externalId,
      sourceUrl: row.sourceUrl,
      publishedAt: row.publishedAt,
      media: row.media ?? null,
      metaData: row.metaData ?? null,
      engagement: row.engagement ?? null,
      linkedAccount,
      user: {
        id: row.userId,
        firstName: row.userFirstName,
        lastName: row.userLastName,
        userName: row.userName,
        bio: row.userBio,
        profileImage: row.profileImageUrl ?? row.defaultProfileImageUrl ?? null,
        profileImageUrl: row.profileImageUrl ?? null,
        defaultProfileImageUrl: row.defaultProfileImageUrl ?? null,
        profileImagePrivacy: row.profileImagePrivacy ?? 'Everyone',
      },
    };
  }

  public async getVideoMetaDataByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
    types: string[],
  ): Promise<Pick<UserContent, 'externalId' | 'metaData'>[]> {
    if (types.length === 0) {
      return [];
    }
    return await this.userContentContext.find({
      where: { userId, platform, type: In(types) },
      select: ['externalId', 'metaData'],
    });
  }

  public async getVideoIdsByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
    types: string[],
  ): Promise<string[]> {
    if (types.length === 0) {
      return [];
    }

    const rows = await this.userContentContext.find({
      where: {
        userId,
        platform,
        type: In(types),
      },
      select: ['externalId', 'metaData'],
    });

    return [
      ...new Set(
        rows
          .map((row) => row.metaData?.videoId || row.externalId)
          .filter(
            (id): id is string => typeof id === 'string' && id.length > 0,
          ),
      ),
    ];
  }

  public async getUserContentVideosAsync(
    userId: string,
    platform: string,
    types: string[],
  ): Promise<
    Pick<
      UserContent,
      'externalId' | 'metaData' | 'title' | 'media' | 'publishedAt'
    >[]
  > {
    if (types.length === 0) {
      return [];
    }
    return await this.userContentContext.find({
      where: { userId, platform, type: In(types) },
      select: ['externalId', 'metaData', 'title', 'media', 'publishedAt'],
    });
  }

  public async deleteByUserIdAndPlatformAsync(
    userId: string,
    platform: string,
  ): Promise<void> {
    await this.userContentContext.delete({ userId, platform });
  }

  public async deleteByExternalIdsAsync(
    userId: string,
    platform: string,
    externalIds: string[],
  ): Promise<void> {
    if (externalIds.length === 0) {
      return;
    }
    await this.userContentContext
      .createQueryBuilder()
      .delete()
      .from(UserContent)
      .where('userId = :userId', { userId })
      .andWhere('platform = :platform', { platform })
      .andWhere('externalId IN (:...externalIds)', { externalIds })
      .execute();
  }

  public async countByUserIdAsync(userId: string): Promise<number> {
    return this.userContentContext
      .createQueryBuilder('content')
      .where('content.userId = :userId', { userId })
      .getCount();
  }

  public async findByLinkedAccountIdAsync(
    linkedAccountId: string,
  ): Promise<UserContent[]> {
    return this.userContentContext.find({
      where: { linkedAccountId },
    });
  }

  public async deleteByLinkedAccountIdAsync(
    linkedAccountId: string,
  ): Promise<void> {
    await this.userContentContext
      .createQueryBuilder()
      .delete()
      .from(UserContent)
      .where('linkedAccountId = :linkedAccountId', { linkedAccountId })
      .execute();
  }

  public async countByLinkedAccountIdAsync(
    linkedAccountId: string,
  ): Promise<number> {
    return this.userContentContext.count({
      where: { linkedAccountId },
    });
  }

  private invalidateDiscoverFeedCache(): Promise<void> {
    return redis
      .removeFromRedisByPatternAsync(
        redis.getRedisKey('discover:feed:v1', 'all', '*'),
      )
      .then(() => undefined);
  }
}
