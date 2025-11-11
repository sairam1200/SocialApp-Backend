import { Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Injectable } from "@nestjs/common";
import { ContentStream } from "../../domain/entities";
import { LinkedAccount } from "../../domain/entities";
import { UserContent } from "../../domain/entities";
import { IGeneralRepository } from "../../domain/repositories/igeneral.repository";
import { DataSource } from "typeorm";

@Injectable()
export class GeneralRepository implements IGeneralRepository {
    constructor(
        @InjectRepository(ContentStream)
        private readonly contentStreamContext: Repository<ContentStream>,
        @InjectRepository(LinkedAccount)
        private readonly linkedAccountContext: Repository<LinkedAccount>,
        @InjectRepository(UserContent)
        private readonly userContentContext: Repository<UserContent>,

        private readonly dataSource: DataSource,
    ) { }
    /**
     * Checks which items from the provided list do NOT exist in the database
     * Returns an array of external IDs that are new (not found in ContentStream, UserContent, or LinkedAccount tables)
     * 
     * @param listIds - Array of external IDs to check
     * @param platform - Platform name (e.g., 'youtube')
     * @returns Array of external IDs that don't exist in the database (new items to be inserted)
     */
    public async checkExistingItemsAsync(listIds: String[], platform: string): Promise<string[]> {
        if (listIds.length < 1) return [];
        const query = `
        WITH existing AS (
            SELECT "externalId" as video_id, "platform" FROM "contentStreams"
            UNION
            SELECT "externalId" as video_id, "platform" FROM "linkedAccounts"
            UNION
            SELECT "externalId"as video_id, "platform"  FROM "userContents"
        ),
        incoming AS (
            SELECT unnest($1::text[]) AS video_id , $2::text AS platform -- listIds
        )
        SELECT i.video_id
        FROM incoming i
        LEFT JOIN existing e ON i.video_id = e.video_id AND i.platform = e."platform"
        WHERE e.video_id IS NULL;   -- keep only items not in DB (new items)
        `;
        const result = await this.dataSource.query(query, [listIds, platform]);
        return result.map((row: { video_id: string }) => row.video_id);

    }
    public async createAsync(content: ContentStream[]): Promise<any> {
        if (content.length < 1) return;
        const query = `
        WITH incoming AS (
            SELECT * 
            FROM jsonb_to_recordset($1::jsonb)
                AS t(type "contentStreams_type_enum","lastRefreshed"  Date , "subType" text, "platform" text, "externalId" text, "title" text, "metaData" jsonb)
        )
        INSERT INTO "contentStreams" ("type","lastRefreshed", "subType", "platform", "externalId", "title", "metaData")
        SELECT * 
        FROM incoming
        RETURNING "id", "externalId";
        `
        const result = await this.dataSource.query(query, [JSON.stringify(content)]);
        return result;
    }

    public async updateContentRefreshTimestampAsync(externalIds: string[], platform: string): Promise<void> {
        if (externalIds.length === 0) {
            return;
        }

        const refreshTime = new Date();

        // Update all entity types that might contain these external IDs
        // Use Promise.all to update all tables in parallel for better performance
        await Promise.all([
            // Update ContentStream
            this.contentStreamContext
                .createQueryBuilder()
                .update(ContentStream)
                .set({ lastRefreshed: refreshTime })
                .where('externalId IN (:...ids)', { ids: externalIds })
                .andWhere('platform = :platform', { platform })
                .execute(),

            // Update UserContent
            this.userContentContext
                .createQueryBuilder()
                .update(UserContent)
                .set({ lastRefreshed: refreshTime })
                .where('externalId IN (:...ids)', { ids: externalIds })
                .andWhere('platform = :platform', { platform })
                .execute(),

            // Update LinkedAccount
            this.linkedAccountContext
                .createQueryBuilder()
                .update(LinkedAccount)
                .set({ lastRefreshed: refreshTime })
                .where('externalId IN (:...ids)', { ids: externalIds })
                .andWhere('platform = :platform', { platform })
                .execute(),
        ]);
    }


}