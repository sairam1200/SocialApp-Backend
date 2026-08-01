import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLinkedAccountRelations1785455364000 implements MigrationInterface {
  name = 'AddLinkedAccountRelations1785455364000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add linkedAccountId column to userContents (nullable — Phase 1)
    await queryRunner.query(
      `ALTER TABLE "userContents" ADD COLUMN "linkedAccountId" uuid`,
    );

    // Index for linkedAccountId lookups
    await queryRunner.query(
      `CREATE INDEX "IDX_userContents_linkedAccountId" ON "userContents" ("linkedAccountId")`,
    );

    // Index for (platform, externalId) lookups (speeds up disconnect cleanup)
    await queryRunner.query(
      `CREATE INDEX "IDX_userContents_platform_externalId" ON "userContents" ("platform", "externalId")`,
    );

    // FK: UserContent -> LinkedAccount (CASCADE delete)
    await queryRunner.query(
      `ALTER TABLE "userContents" ADD CONSTRAINT "FK_userContents_linkedAccount" 
       FOREIGN KEY ("linkedAccountId") REFERENCES "linkedAccounts"(id) ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "userContents" DROP CONSTRAINT IF EXISTS "FK_userContents_linkedAccount"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_userContents_platform_externalId"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_userContents_linkedAccountId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "userContents" DROP COLUMN "linkedAccountId"`,
    );
  }
}
