import { MigrationInterface, QueryRunner } from 'typeorm';

export class addBaseEntityColumnsToYoutubeAccounts1787000000000
  implements MigrationInterface
{
  name = 'addBaseEntityColumnsToYoutubeAccounts1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" ADD COLUMN "created_by" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" ADD COLUMN "created_on" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" ADD COLUMN "last_modified_by" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" ADD COLUMN "last_modified_on" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" ADD COLUMN "last_refreshed" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" DROP COLUMN "last_refreshed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" DROP COLUMN "last_modified_on"`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" DROP COLUMN "last_modified_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" DROP COLUMN "created_on"`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" DROP COLUMN "created_by"`,
    );
  }
}
