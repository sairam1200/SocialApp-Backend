import { Repository, In, MoreThan, Brackets } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { UserContent } from "../../domain/entities";
import { IUserContentRepository } from "../../domain/repositories";
import { QueryOptions } from "../../domain/types/queryOptions.type";
import { SearchContentProjection } from "../../domain/repositories/iuserContent.repository";
import { User } from "../../domain/entities/identity/user.entity";
@Injectable()
export class UserContentRepository implements IUserContentRepository {

  constructor(
    @InjectRepository(UserContent)
    private readonly userContentContext: Repository<UserContent>,
  ) { }

  public async createAsync(content: UserContent): Promise<UserContent> {

    const existingContent = await this.getByPlatformAndContentIdAsync(content.userId,content.platform, content.externalId);
    if (existingContent) {
      existingContent.title = content.title;
      existingContent.metaData = content.metaData;

      await this.updateAsync(existingContent);
      return existingContent;
    }

    return await this.userContentContext.save(content);
  }

  public async updateAsync(content: UserContent): Promise<void> {
    await this.userContentContext.save(content);
  }

  public async getByPlatformAndContentIdAsync(userId: string,platform: string, contentId: string): Promise<UserContent | null> {
    return await this.userContentContext.findOne({ where: { userId,platform, externalId: contentId } });
  }

  public async getByIdAsync(id: string): Promise<UserContent | null> {
    return await this.userContentContext.findOne({ where: { id } });
  }

  public async deleteAsync(content: UserContent): Promise<void> {
    await this.userContentContext.remove(content);
  }
  public async getByUserIdAsync(
    userId: string,
    platform: string,
    cursor: string,
  ): Promise<[UserContent[], string]> {

    const take = 20;

    const qb = this.userContentContext
      .createQueryBuilder("content")
      .where("content.userId = :userId", { userId })
      .andWhere("content.platform = :platform", { platform })
      .orderBy("content.createdOn", "DESC")
      .addOrderBy("content.id", "DESC")
      .take(take + 1);

    if (cursor) {
      qb.andWhere("content.createdOn < :cursor", {
        cursor: new Date(cursor),
      });
    }

    const items = await qb.getMany();

    const hasMore = items.length > take;

    if (hasMore) {
      items.pop();
    }

    const nextCursor =
      hasMore
        ? items[items.length - 1].createdOn.toISOString()
        : "";

    return [items, nextCursor];
  }

  async getEntriesAsync(params: QueryOptions): Promise<[UserContent[], number]> {
    let { page, pageSize, orderBy, order, searchQuery, filter } = params;
    console.log('Query Options:', searchQuery);
    const queryBuilder = this.userContentContext.createQueryBuilder("uc");

    if (!orderBy) {
      orderBy = "title";
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
      whereConditions.push("uc.externalId = :externalId");
      parameters.externalId = filter.externalId;
    }

    if (filter?.type) {
      whereConditions.push("uc.type = :type");
      parameters.type = filter.type;
    }

    if (whereConditions.length > 0) {
      queryBuilder.where(whereConditions.join(" AND "), parameters);
    }

    if (searchQuery) {
      const exactSearch = searchQuery.toLowerCase();
      queryBuilder
        .addOrderBy(
          `CASE WHEN uc.title ILIKE :exactSearch THEN 0 
                 WHEN uc.title ILIKE :searchQuery THEN 1 
                 ELSE 2 END`,
          "ASC"
        )
        .addOrderBy(`uc.${orderBy}`, order)
        .setParameter("exactSearch", `%${exactSearch}%`)
        .setParameter("searchQuery", parameters.searchQuery);
    } else {
      queryBuilder.orderBy(`uc.${orderBy}`, order);
    }

    queryBuilder.skip((page - 1) * pageSize)
      .take(pageSize);
    const result = await queryBuilder.getManyAndCount();
    console.log('Query Result:', result);
    return result
  }

  public async searchGlobalAsync(keyword: string, viewerUserId: string, page: number, limit: number): Promise<[SearchContentProjection[], number]> {
    const escapedKeyword = keyword.replace(/[\\%_]/g, "\\$&");
    const qb = this.createGlobalSearchQuery(viewerUserId)
      .andWhere("content.title ILIKE :pattern ESCAPE '\\'", { pattern: `%${escapedKeyword}%` })
      .orderBy(`CASE
        WHEN LOWER(content.title) = LOWER(:keyword) THEN 0
        WHEN content.title ILIKE :prefix ESCAPE '\\' THEN 1
        ELSE 2 END`, "ASC")
      .addOrderBy("content.publishedAt", "DESC", "NULLS LAST")
      .setParameters({ keyword, prefix: `${escapedKeyword}%` });
    const rows = await qb.clone().getRawMany();
    const count = rows.length;
    
    return [rows.map(this.mapSearchRow), count];
  }

  public async getGlobalSearchItemAsync(id: string, viewerUserId: string): Promise<SearchContentProjection | null> {
    const row = await this.createGlobalSearchQuery(viewerUserId)
      .andWhere("content.id = :id", { id })
      .getRawOne();
    return row ? this.mapSearchRow(row) : null;
  }

  private createGlobalSearchQuery(viewerUserId: string) {
    return this.userContentContext.createQueryBuilder("content")
      .innerJoin(User, "creator", "creator.id = content.userId")
      .select([
        "content.id AS id", "content.title AS title", "content.type AS type",
        "content.platform AS platform", "content.externalId AS \"externalId\"",
        "content.sourceUrl AS \"sourceUrl\"", "content.publishedAt AS \"publishedAt\"",
        "creator.id AS \"userId\"", "creator.firstName AS \"userFirstName\"",
        "creator.lastName AS \"userLastName\"", "creator.userName AS \"userName\"",
        "creator.bio AS \"userBio\"",
      ])
      .where("creator.isActive = true")
      .andWhere(`(creator.profilePrivacy = 'Public' OR creator.id = CAST(:viewerUserId AS uuid) OR EXISTS (
        SELECT 1 FROM identity.user_follows follow
        WHERE follow."followerId" = CAST(:viewerUserId AS uuid)
          AND follow."followedId" = creator.id
          AND follow.status = 'accepted'
      ))`, { viewerUserId });
  }

  private mapSearchRow(row: any): SearchContentProjection {
    return {
      id: row.id, title: row.title, type: row.type, platform: row.platform,
      externalId: row.externalId, sourceUrl: row.sourceUrl, publishedAt: row.publishedAt,
      user: {
        id: row.userId, firstName: row.userFirstName, lastName: row.userLastName,
        userName: row.userName, bio: row.userBio,
      },
    };
  }

  public async getVideoMetaDataByUserIdAndPlatformAsync(userId: string, platform: string, types: string[]): Promise<Pick<UserContent, 'externalId' | 'metaData'>[]> {
    if (types.length === 0) {
      return [];
    }
    return await this.userContentContext.find({
      where: { userId, platform, type: In(types) },
      select: ['externalId', 'metaData'],
    });
  }

  public async getVideoIdsByUserIdAndPlatformAsync(userId: string, platform: string, types: string[]): Promise<string[]> {
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
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
  }

  public async deleteByUserIdAndPlatformAsync(userId: string, platform: string): Promise<void> {
    await this.userContentContext.delete({ userId, platform });
  }

  public async deleteByExternalIdsAsync(userId: string, platform: string, externalIds: string[]): Promise<void> {
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
}
