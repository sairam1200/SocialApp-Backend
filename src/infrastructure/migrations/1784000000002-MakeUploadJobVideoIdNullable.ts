import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUploadJobVideoIdNullable1784000000002 implements MigrationInterface {
  name = 'MakeUploadJobVideoIdNullable1784000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE upload_jobs
        ALTER COLUMN "videoId" DROP NOT NULL;
      EXCEPTION
        WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE upload_jobs
        ALTER COLUMN "videoId" SET NOT NULL;
      EXCEPTION
        WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL;
      END $$;
    `);
  }
}
