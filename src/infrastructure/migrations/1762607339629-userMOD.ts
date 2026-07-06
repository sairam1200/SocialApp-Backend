import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserMOD1762607339629 implements MigrationInterface {
  name = 'UserMOD1762607339629';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "newEmail" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "lastEmailModifiedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "lastUserNameModifiedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "lastPasswordModifiedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "lastPasswordModifiedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "lastUserNameModifiedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "lastEmailModifiedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "newEmail"`,
    );
  }
}
