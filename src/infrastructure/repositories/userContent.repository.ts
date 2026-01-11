import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { UserContent } from "../../domain/entities";
import { IUserContentRepository } from "../../domain/repositories";
import { QueryOptions } from "../../domain/types/queryOptions.type";

@Injectable()
export class UserContentRepository implements IUserContentRepository {

  constructor(
    @InjectRepository(UserContent)
    private readonly userContentContext: Repository<UserContent>,
  ) { }

  public async createAsync(content: UserContent): Promise<UserContent> {

    const existingContent = await this.getByPlatformAndContentIdAsync(content.platform, content.externalId);
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

  public async getByPlatformAndContentIdAsync(platform: string, contentId: string): Promise<UserContent | null> {
    return await this.userContentContext.findOne({ where: { platform, externalId: contentId } });
  }

  public async getByIdAsync(id: string): Promise<UserContent | null> {
    return await this.userContentContext.findOne({ where: { id } });
  }

  public async deleteAsync(content: UserContent): Promise<void> {
    await this.userContentContext.remove(content);
  }

  public async getByUserIdAsync(userId: string, platform: string, cursor: string): Promise<[UserContent[], string]> {
    const take = 10;
    const where: any = { userId, platform };
    if (cursor) {
      where.id = { $gt: cursor };
    }
    const [result, count] = await this.userContentContext.findAndCount({
      where,
      order: { id: "ASC" },
      take,
    });
    const nextCursor = result.length > 0 ? result[result.length - 1].id : "";
    return [result, nextCursor];
  }

  async getEntriesAsync(params: QueryOptions): Promise<[UserContent[], number]> {
    let { page, pageSize, orderBy, order, searchQuery, filter } = params;
    console.log('Query Options:', searchQuery);
    const queryBuilder = this.userContentContext.createQueryBuilder("content");

    if (!orderBy) {
      orderBy = "title";
    }

    const whereConditions: string[] = [];
    const parameters: any = {};

    if (searchQuery) {
      whereConditions.push(`
        (
          content.title ILIKE :searchQuery
          OR EXISTS (
            SELECT 1
            FROM json_each_text(content.metaData) AS kv(key, value)
            WHERE value ILIKE :searchQuery
          )
        )
      `);

      parameters.searchQuery = `%${searchQuery}%`;
    }

    if (filter?.externalId) {
      whereConditions.push("content.externalId = :externalId");
      parameters.externalId = filter.externalId;
    }

    if (filter?.type) {
      whereConditions.push("content.type = :type");
      parameters.type = filter.type;
    }

    if (whereConditions.length > 0) {
      queryBuilder.where(whereConditions.join(" AND "), parameters);
    }

    if (searchQuery) {
      queryBuilder.orderBy(
        `CASE WHEN content.title ILIKE :exactSearch THEN 0 
                 WHEN content.title ILIKE :searchQuery THEN 1 
                 ELSE 2 END`,
        "ASC"
      )
        .addOrderBy(`content.${orderBy}`, order)
        .setParameter("exactSearch", searchQuery.toLowerCase());
    } else {
      queryBuilder.orderBy(`content.${orderBy}`, order);
    }

    queryBuilder.skip((page - 1) * pageSize)
      .take(pageSize);
    const result = await queryBuilder.getManyAndCount();
    console.log('Query Result:', result);
    return result
  }

  public async deleteByUserIdAndPlatformAsync(userId: string, platform: string): Promise<void> {
    await this.userContentContext.delete({ userId, platform });
  }
}