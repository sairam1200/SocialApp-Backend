import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserContentsPlatformExternalIdIndex1785455366000 implements MigrationInterface {
  name = 'AddUserContentsPlatformExternalIdIndex1785455366000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_userContents_platform_externalId"
       ON "userContents" ("platform", "externalId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_userContents_platform_externalId"`,
    );
  }
}
