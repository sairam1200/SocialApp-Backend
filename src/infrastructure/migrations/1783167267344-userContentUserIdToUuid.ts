import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserContentUserIdToUuid1783167267344 implements MigrationInterface {
  name = 'UserContentUserIdToUuid1783167267344';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const invalidRows: { userId: string }[] = await queryRunner.query(
      `SELECT "userId" FROM "userContents" WHERE "userId" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    );
    if (invalidRows.length > 0) {
      throw new Error(
        `Cannot convert "userId" to uuid: ${invalidRows.length} row(s) contain invalid UUID values. ` +
          `Affected userIds: ${[...new Set(invalidRows.map((r) => r.userId))].join(', ')}`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "userContents" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "userContents" ALTER COLUMN "userId" TYPE character varying`,
    );
  }
}
