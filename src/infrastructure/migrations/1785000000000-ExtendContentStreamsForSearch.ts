import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendContentStreamsForSearch1785000000000 implements MigrationInterface {
  name = 'ExtendContentStreamsForSearch1785000000000';

  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      )`,
      [table, column],
    );
    return result[0]?.exists ?? false;
  }

  private async indexExists(
    queryRunner: QueryRunner,
    indexName: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = $1
      )`,
      [indexName],
    );
    return result[0]?.exists ?? false;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enable pg_trgm extension (idempotent)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // 2. Add new columns (nullable, guarded for idempotency)
    if (
      !(await this.columnExists(queryRunner, 'contentStreams', 'searchText'))
    ) {
      await queryRunner.query(
        `ALTER TABLE "contentStreams" ADD COLUMN "searchText" TEXT`,
      );
    }
    if (
      !(await this.columnExists(queryRunner, 'contentStreams', 'searchVector'))
    ) {
      await queryRunner.query(
        `ALTER TABLE "contentStreams" ADD COLUMN "searchVector" TSVECTOR`,
      );
    }
    if (
      !(await this.columnExists(queryRunner, 'contentStreams', 'publishedAt'))
    ) {
      await queryRunner.query(
        `ALTER TABLE "contentStreams" ADD COLUMN "publishedAt" TIMESTAMP`,
      );
    }
    if (
      !(await this.columnExists(
        queryRunner,
        'contentStreams',
        'engagementScore',
      ))
    ) {
      await queryRunner.query(
        `ALTER TABLE "contentStreams" ADD COLUMN "engagementScore" DOUBLE PRECISION`,
      );
    }
    if (
      !(await this.columnExists(queryRunner, 'contentStreams', 'creatorId'))
    ) {
      await queryRunner.query(
        `ALTER TABLE "contentStreams" ADD COLUMN "creatorId" VARCHAR`,
      );
    }

    // 3. Create GIN index for full-text search
    if (
      !(await this.indexExists(queryRunner, 'IDX_contentStreams_searchVector'))
    ) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_searchVector"
         ON "contentStreams" USING GIN("searchVector")`,
      );
    }

    // 4. Create GIN index for trigram fuzzy matching
    if (
      !(await this.indexExists(
        queryRunner,
        'IDX_contentStreams_searchText_trgm',
      ))
    ) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_searchText_trgm"
         ON "contentStreams" USING GIN("searchText" gin_trgm_ops)`,
      );
    }

    // 5. Create B-tree index for publication date
    if (
      !(await this.indexExists(queryRunner, 'IDX_contentStreams_publishedAt'))
    ) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_publishedAt"
         ON "contentStreams"("publishedAt")`,
      );
    }

    // 6. Create B-tree index for engagement score
    if (
      !(await this.indexExists(
        queryRunner,
        'IDX_contentStreams_engagementScore',
      ))
    ) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_engagementScore"
         ON "contentStreams"("engagementScore")`,
      );
    }

    // 7. Create B-tree index for creator ID
    if (
      !(await this.indexExists(queryRunner, 'IDX_contentStreams_creatorId'))
    ) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_creatorId"
         ON "contentStreams"("creatorId")`,
      );
    }

    // 8. Create partial index for indexed documents
    if (
      !(await this.indexExists(
        queryRunner,
        'IDX_contentStreams_search_partial',
      ))
    ) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_search_partial"
         ON "contentStreams"("platform", "type")
         WHERE "searchVector" IS NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes in reverse order
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_search_partial"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_creatorId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_engagementScore"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_publishedAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_searchText_trgm"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_searchVector"`,
    );

    // Drop columns
    await queryRunner.query(
      `ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "creatorId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "engagementScore"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "publishedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "searchVector"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "searchText"`,
    );
  }
}
