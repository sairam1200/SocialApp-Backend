import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillLinkedAccountId1785455365000 implements MigrationInterface {
  name = 'BackfillLinkedAccountId1785455365000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill linkedAccountId on userContents where a matching linkedAccount exists
    // This is safe because (userId, platform) is unique in linkedAccounts
    await queryRunner.query(`
      UPDATE "userContents" uc
      SET "linkedAccountId" = la."id"
      FROM "linkedAccounts" la
      WHERE uc."userId" = la."userId"
        AND uc."platform" = la."platform"
        AND uc."linkedAccountId" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Clear linkedAccountId for all rows that were populated by the backfill
    // We cannot distinguish backfilled from non-backfilled, but the column
    // remains nullable and the FK allows it. Clearing is safe as a rollback
    // because the next import cycle repopulates it.
    await queryRunner.query(`
      UPDATE "userContents"
      SET "linkedAccountId" = NULL
      WHERE "linkedAccountId" IS NOT NULL
        AND "userId" IN (
          SELECT "userId" FROM "linkedAccounts"
        )
    `);
  }
}
