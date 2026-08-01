import { MigrationInterface, QueryRunner } from 'typeorm';

export class normalizeRemainingFkColumnsToUuid1784000000008 implements MigrationInterface {
  name = 'normalizeRemainingFkColumnsToUuid1784000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Migration 1784000000007 was already applied when edited in-place.
    // These ALTER statements never executed. This migration also remediates
    // legacy Better Auth / Firebase IDs that predate the UUID migration.

    // Step 1: Map non-UUID userId values to their UUID equivalents.
    // gaddr_users_compat holds the old auth system records (text IDs).
    // identity.users holds the new UUID-based records.
    // Join on email to find the old→new mapping.
    await queryRunner.query(`
      DO $$ BEGIN
        UPDATE "userContents" uc
        SET "userId" = iu.id::text
        FROM "gaddr_users_compat" gc
        INNER JOIN "identity"."users" iu ON UPPER(gc.email) = UPPER(iu.email)
        WHERE uc."userId" = gc.id
          AND uc."userId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        UPDATE "userTopics" ut
        SET "userId" = iu.id::text
        FROM "gaddr_users_compat" gc
        INNER JOIN "identity"."users" iu ON UPPER(gc.email) = UPPER(iu.email)
        WHERE ut."userId" = gc.id
          AND ut."userId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `);

    // Step 2: Convert columns from text to uuid.
    // manualProfiles.userId is already all-UUID — safe to convert directly.
    await queryRunner.query(
      `ALTER TABLE "userContents" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "userTopics" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" ALTER COLUMN "userId" TYPE text USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "userTopics" ALTER COLUMN "userId" TYPE text USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "userContents" ALTER COLUMN "userId" TYPE text USING "userId"::text`,
    );

    // Note: the UPDATE mapping is not reversed in down().
    // The original Better Auth IDs are lost unless restored from backup.
  }
}
