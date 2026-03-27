import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from "typeorm";

export class UserContentNormalize1774359048001 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns("userContents", [
            new TableColumn({ name: "text", type: "text", isNullable: true }),
            new TableColumn({ name: "media", type: "jsonb", isNullable: true }),
            new TableColumn({ name: "publishedAt", type: "timestamp", isNullable: true }),
            new TableColumn({ name: "sourceUrl", type: "varchar", isNullable: true }),
            new TableColumn({ name: "engagement", type: "jsonb", isNullable: true }),
            new TableColumn({ name: "tags", type: "simple-array", isNullable: true }),
        ]);

        await queryRunner.createIndex("userContents", new TableIndex({
            name: "IDX_USER_CONTENT_UNIQUE_PLATFORM_EXTERNAL",
            columnNames: ["userId", "platform", "externalId"],
            isUnique: true
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex("userContents", "IDX_USER_CONTENT_UNIQUE_PLATFORM_EXTERNAL");
        await queryRunner.dropColumns("userContents", ["text", "media", "publishedAt", "sourceUrl", "engagement", "tags"]);
    }
}
