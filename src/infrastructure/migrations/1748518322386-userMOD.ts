import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserMOD1748518322386 implements MigrationInterface {
  name = 'UserMOD1748518322386';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."userLogins" ADD "isValid" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "concurrencyStamp" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "securityStamp" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "securityStamp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "concurrencyStamp"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."userLogins" DROP COLUMN "isValid"`,
    );
  }
}
