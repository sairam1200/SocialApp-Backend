import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePublishJobsTable1784000000000 implements MigrationInterface {
  name = 'CreatePublishJobsTable1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS publish_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "createdBy" character varying,
        "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
        "lastModifiedBy" character varying,
        "lastModifiedOn" TIMESTAMP,
        "lastRefreshed" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" character varying NOT NULL,
        "linkedAccountId" character varying NOT NULL,
        "platform" character varying NOT NULL,
        "r2Key" character varying,
        "fileSize" bigint,
        "status" character varying NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "progress" integer NOT NULL DEFAULT 0,
        "statusMessage" text,
        "lastError" text,
        "nextRetryAt" TIMESTAMP,
        "platformContentId" character varying,
        "platformContentUrl" character varying,
        "expiresAt" TIMESTAMP NOT NULL,
        "r2CleanedAt" TIMESTAMP,
        "metadata" jsonb
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_publish_jobs_userId"
      ON publish_jobs ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_publish_jobs_linkedAccountId"
      ON publish_jobs ("linkedAccountId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_publish_jobs_platform"
      ON publish_jobs ("platform")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_publish_jobs_status"
      ON publish_jobs ("status")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX "IDX_publish_jobs_expiresAt"
        ON publish_jobs ("expiresAt")
        WHERE "r2CleanedAt" IS NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS publish_jobs CASCADE`);
  }
}
