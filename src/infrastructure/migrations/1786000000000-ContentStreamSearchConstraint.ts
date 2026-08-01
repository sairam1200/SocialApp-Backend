import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContentStreamSearchConstraint1786000000000 implements MigrationInterface {
  name = 'ContentStreamSearchConstraint1786000000000';

  private async enumExists(
    queryRunner: QueryRunner,
    enumName: string,
    value: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = $1
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = $2)
      )`,
      [value, enumName],
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

  private async constraintExists(
    queryRunner: QueryRunner,
    constraintName: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = $1
      )`,
      [constraintName],
    );
    return result[0]?.exists ?? false;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The entity defines lastRefreshed with a CURRENT_TIMESTAMP default, but
    // the contentStreams table was created without one; without it the
    // backfill below fails the NOT NULL constraint. Align schema with entity.
    await queryRunner.query(
      `ALTER TABLE "contentStreams"
       ALTER COLUMN "lastRefreshed" SET DEFAULT now()`,
    );

    // 1. Duplicate report: count duplicate (platform, externalId) groups
    const duplicates: { duplicateCount: string }[] = await queryRunner.query(
      `SELECT COUNT(*) AS "duplicateCount"
       FROM (
         SELECT "platform", "externalId"
         FROM "contentStreams"
         GROUP BY "platform", "externalId"
         HAVING COUNT(*) > 1
       ) dup`,
    );

    // 2. Deterministic dedupe: keep the row with the smallest (createdOn, id)
    //    per (platform, externalId), delete the rest.
    await queryRunner.query(
      `DELETE FROM "contentStreams" a
       USING "contentStreams" b
       WHERE a."platform" = b."platform"
         AND a."externalId" = b."externalId"
         AND (a."createdOn", a."id") > (b."createdOn", b."id")`,
    );

    // 2b. Verify the dedupe actually cleared every duplicate group; the unique
    //     index below will fail otherwise.
    const remaining = Number(duplicates[0]?.duplicateCount ?? 0);
    if (remaining > 0) {
      const after: { duplicateCount: string }[] = await queryRunner.query(
        `SELECT COUNT(*) AS "duplicateCount"
         FROM (
           SELECT "platform", "externalId"
           FROM "contentStreams"
           GROUP BY "platform", "externalId"
           HAVING COUNT(*) > 1
         ) dup`,
      );
      if (Number(after[0]?.duplicateCount ?? 0) > 0) {
        throw new Error(
          `Deduplication failed: ${after[0].duplicateCount} duplicate (platform, externalId) groups remain.`,
        );
      }
    }

    // 3. Unique index on (platform, externalId) — the conflict target used by
    //    ContentStreamIndexService upserts.
    if (
      !(await this.indexExists(
        queryRunner,
        'IDX_contentStreams_platform_externalId',
      ))
    ) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_contentStreams_platform_externalId"
         ON "contentStreams"("platform", "externalId")`,
      );
    }

    // 4. Backfill from userContents so existing user content becomes
    //    searchable through ContentStream. Rows already present (same
    //    platform+externalId) are skipped.
    await queryRunner.query(
      `INSERT INTO "contentStreams"
        ("type", "subType", "title", "platform", "externalId", "metaData",
         "searchText", "publishedAt", "creatorId", "engagementScore")
       SELECT
         CASE WHEN uc."type" IN ('channel', 'subscription', 'profile')
              THEN 'Profile'::"public"."contentStreams_type_enum"
              ELSE 'Content'::"public"."contentStreams_type_enum"
         END,
         uc."type",
         uc."title",
         uc."platform",
         uc."externalId",
         COALESCE(uc."metaData", '{}'::json),
         LOWER(CONCAT_WS(' ', uc."title", uc."text",
           uc."tags")),
         uc."publishedAt",
         uc."userId"::text,
         0
       FROM "userContents" uc
       ORDER BY uc."createdOn" ASC, uc."id" ASC
       ON CONFLICT ("platform", "externalId") DO NOTHING`,
    );

    // 5. Extend contentStreams_type_enum to the full StreamEntityType set.
    const enumTypeName = 'contentStreams_type_enum';
    for (const value of ['Profile', 'Content', 'Community', 'Project', 'Job']) {
      if (!(await this.enumExists(queryRunner, enumTypeName, value))) {
        await queryRunner.query(
          `ALTER TYPE "public"."${enumTypeName}" ADD VALUE '${value}'`,
        );
      }
    }

    // 6. creatorId: null out non-uuid and orphaned values, then convert the
    //    column to uuid and reference identity.users.
    await queryRunner.query(
      `UPDATE "contentStreams" SET "creatorId" = NULL
       WHERE "creatorId" IS NOT NULL
         AND "creatorId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    );
    await queryRunner.query(
      `UPDATE "contentStreams" cs
       SET "creatorId" = NULL
       WHERE cs."creatorId" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "identity"."users" u WHERE u."id"::text = cs."creatorId"
         )`,
    );
    await queryRunner.query(
      `ALTER TABLE "contentStreams"
       ALTER COLUMN "creatorId" TYPE uuid USING "creatorId"::uuid`,
    );
    if (
      !(await this.constraintExists(queryRunner, 'FK_contentStreams_creatorId'))
    ) {
      await queryRunner.query(
        `ALTER TABLE "contentStreams"
         ADD CONSTRAINT "FK_contentStreams_creatorId"
         FOREIGN KEY ("creatorId") REFERENCES "identity"."users"("id")
         ON DELETE SET NULL`,
      );
    }

    // 7. Additional search indexes.
    if (!(await this.indexExists(queryRunner, 'IDX_contentStreams_type'))) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_type"
         ON "contentStreams"("type")`,
      );
    }
    if (!(await this.indexExists(queryRunner, 'IDX_contentStreams_subType'))) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_subType"
         ON "contentStreams"("subType")`,
      );
    }
    if (
      !(await this.indexExists(queryRunner, 'IDX_contentStreams_title_trgm'))
    ) {
      await queryRunner.query(
        `CREATE INDEX "IDX_contentStreams_title_trgm"
         ON "contentStreams" USING GIN("title" gin_trgm_ops)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contentStreams" DROP CONSTRAINT IF EXISTS "FK_contentStreams_creatorId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contentStreams"
       ALTER COLUMN "creatorId" TYPE character varying USING "creatorId"::text`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_title_trgm"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_subType"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_contentStreams_type"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contentStreams_platform_externalId"`,
    );
  }
}
