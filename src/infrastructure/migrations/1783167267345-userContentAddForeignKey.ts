import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserContentAddForeignKey1783167267345 implements MigrationInterface {
  name = 'UserContentAddForeignKey1783167267345';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orphanRows: { userId: string }[] = await queryRunner.query(
      `SELECT DISTINCT uc."userId" FROM "userContents" uc LEFT JOIN "identity"."users" u ON u.id = uc."userId" WHERE u.id IS NULL`,
    );
    if (orphanRows.length > 0) {
      throw new Error(
        `Cannot add foreign key: ${orphanRows.length} userId value(s) do not reference existing users. ` +
          `Orphaned userIds: ${orphanRows.map((r) => r.userId).join(', ')}. ` +
          `Resolve by either deleting orphaned userContent rows or creating the referenced users.`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "userContents" ADD CONSTRAINT "FK_userContents_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "userContents" DROP CONSTRAINT "FK_userContents_userId"`,
    );
  }
}
