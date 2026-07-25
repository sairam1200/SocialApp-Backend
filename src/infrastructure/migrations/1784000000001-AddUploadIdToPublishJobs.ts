import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUploadIdToPublishJobs1784000000001 implements MigrationInterface {
  name = 'AddUploadIdToPublishJobs1784000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE publish_jobs
        ADD COLUMN "uploadId" character varying;
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE INDEX "IDX_publish_jobs_uploadId"
        ON publish_jobs ("uploadId");
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_publish_jobs_uploadId"`);
    await queryRunner.query(
      `ALTER TABLE publish_jobs DROP COLUMN IF EXISTS "uploadId"`,
    );
  }
}
