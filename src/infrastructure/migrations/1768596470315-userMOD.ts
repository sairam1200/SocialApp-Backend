import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserMOD1768596470315 implements MigrationInterface {
  name = 'UserMOD1768596470315';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "identity"."users_profileprivacy_enum" AS ENUM('Public', 'Private')`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "profilePrivacy" "identity"."users_profileprivacy_enum" NOT NULL DEFAULT 'Public'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "profilePrivacy"`,
    );
    await queryRunner.query(`DROP TYPE "identity"."users_profileprivacy_enum"`);
  }
}
