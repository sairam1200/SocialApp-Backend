import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastRefreshedDefault1784000000004 implements MigrationInterface {
  name = 'AddLastRefreshedDefault1784000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."userLogins" ALTER COLUMN "lastRefreshed" SET DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."userLogins" ALTER COLUMN "lastRefreshed" DROP DEFAULT`,
    );
  }
}
