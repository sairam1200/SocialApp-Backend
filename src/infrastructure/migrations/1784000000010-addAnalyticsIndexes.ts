import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalyticsIndexes1784000000010 implements MigrationInterface {
  name = 'AddAnalyticsIndexes1784000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Index for analyticsEvents queries by userId + date range
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analyticsEvents_userId_createdOn" 
      ON "analytics"."analyticsEvents" ("userId", "createdOn")
    `);

    // Index for getAllEventsAsync date range scans
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analyticsEvents_createdOn" 
      ON "analytics"."analyticsEvents" ("createdOn")
    `);

    // Index for premiumRollups user lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_premiumRollups_userId" 
      ON "analytics"."premiumRollups" ("userId")
    `);

    // Unique composite index for upserts
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_premiumRollups_userId_weekStartDate" 
      ON "analytics"."premiumRollups" ("userId", "weekStartDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "analytics"."IDX_analyticsEvents_userId_createdOn"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "analytics"."IDX_analyticsEvents_createdOn"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "analytics"."IDX_premiumRollups_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "analytics"."IDX_premiumRollups_userId_weekStartDate"`);
  }
}
