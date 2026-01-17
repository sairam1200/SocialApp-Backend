import { Repository, In, Brackets, Like } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ContentStream } from "../../domain/entities";
import { QueryOptions } from "../../domain/types/queryOptions.type";
import { IContentStreamRepository } from "../../domain/repositories/icontentStream.repository";

@Injectable()
export class ContentStreamRepository implements IContentStreamRepository {

  constructor(
    @InjectRepository(ContentStream)
    private readonly contentStreamContext: Repository<ContentStream>
  ) { }

  public async getEntriesAsync(params: QueryOptions): Promise<[ContentStream[], number]> {
    let { page, pageSize, orderBy, order, searchQuery, filter } = params;
    const queryBuilder = this.contentStreamContext.createQueryBuilder('cs');

    if (!orderBy) {
      orderBy = "title";
    }

    const whereConditions: string[] = [];
    const parameters: Record<string, any> = {};

    if (searchQuery) {
      whereConditions.push(`
        (
          cs.title ILIKE :searchQuery
          OR EXISTS (
            SELECT 1
            FROM json_each_text(cs.metaData) AS kv(key, value)
            WHERE value ILIKE :searchQuery
          )
        )
      `);
      parameters.searchQuery = `%${searchQuery}%`;
    }

    if (filter?.platform) {
      whereConditions.push('cs.platform = :platform');
      parameters.platform = filter.platform;
    }

    if (filter?.externalId) {
      whereConditions.push('cs.externalId = :externalId');
      parameters.externalId = filter.externalId;
    }

    if (filter?.type) {
      whereConditions.push('cs.type = :type');
      parameters.type = filter.type;
    }

    if (filter?.subType) {
      whereConditions.push('cs.subType = :subType');
      parameters.subType = filter.subType;
    }

    if (whereConditions.length > 0) {
      queryBuilder.where(whereConditions.join(' AND '), parameters);
    }

    if (searchQuery) {
      const exactSearch = searchQuery.toLowerCase();
      queryBuilder
        .addOrderBy(
          `CASE WHEN cs.title ILIKE :exactSearch THEN 0 
                 WHEN cs.title ILIKE :searchQuery THEN 1 
                 ELSE 2 END`,
          'ASC'
        )
        .addOrderBy(`cs.${orderBy}`, order)
        .setParameter("exactSearch", `%${exactSearch}%`)
        .setParameter("searchQuery", parameters.searchQuery);
    } else {
      queryBuilder.orderBy(`cs.${orderBy}`, order);
    }

    const result = await queryBuilder.skip((page - 1) * pageSize)
      .take(pageSize).getManyAndCount();
    console.log('Query Result:', result);
    return result
  }

  async deleteByPlatformAndExternalIdAsync(platform: string, externalId: string): Promise<void> {
    await this.contentStreamContext.delete({
      platform,
      externalId,
    });
  }

  async deleteByPlatformAndExternalIdsAsync(platform: string, externalIds: string[]): Promise<void> {
    if (externalIds.length === 0) return;
    await this.contentStreamContext.delete({
      platform,
      externalId: In(externalIds),
    });
  }

  async createAsync(contentStreams: ContentStream[]): Promise<ContentStream[]> {
    if (contentStreams.length === 0) return [];
    return await this.contentStreamContext.save(contentStreams);
  }
}