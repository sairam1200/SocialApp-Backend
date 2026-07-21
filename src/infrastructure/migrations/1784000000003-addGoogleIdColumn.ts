import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGoogleIdColumn1784000000003 implements MigrationInterface {
  name = 'AddGoogleIdColumn1784000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "googleId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "googleId"`,
    );
  }
}
