import { Repository } from "typeorm";
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ContentStream } from "../../domain/entities";
import { QueryOptions } from "../../domain/types/queryOptions.type";
import { IContentStreamRepository } from "../../domain/repositories/icontentStream.repository";
import { StreamEntityType } from "domain/enums";


@Injectable()
export class ContentStreamRepository implements IContentStreamRepository {


  constructor(
    @InjectRepository(ContentStream)
    private readonly contentStreamContext: Repository<ContentStream>
  ) { }
  public async createAsync(content: ContentStream){
    console.info(`Saving content with externalId ${content.externalId} and type ${content.type}`);
    await this.contentStreamContext.save(content);
  }
  public async getContentByIdAndTypeAsync(externalId: string, type: StreamEntityType , subType: string , title: string, platform: string): Promise<ContentStream[] | null> {
    return await this.contentStreamContext.find({
      where: {
        externalId: externalId,
        type: type,
        subType: subType,
        title: title,
        platform: platform,
      }
    })
  }
  public async getEntriesAsync(params: QueryOptions): Promise<[ContentStream[], number]> {

    let { page, pageSize, orderBy, order, searchQuery, filter } = params;
    const queryBuilder = this.contentStreamContext.createQueryBuilder("content");

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

    if (filter?.platform) {
      whereConditions.push("content.platform = :platform");
      parameters.platform = filter.platform;
    }

    if (filter?.externalId) {
      whereConditions.push("content.externalId = :externalId");
      parameters.externalId = filter.externalId;
    }

    if (filter?.type) {
      whereConditions.push("content.type = :type");
      parameters.type = filter.type;
    }

    if (filter?.subType) {
      whereConditions.push("content.subType = :subType");
      parameters.subType = filter.subType;
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
    
      return await queryBuilder.getManyAndCount();
  }
}