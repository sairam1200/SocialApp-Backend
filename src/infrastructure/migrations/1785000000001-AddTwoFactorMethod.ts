import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * How a user's second factor is delivered.
 *
 * A plain `varchar` with a default rather than a Postgres enum: adding a third
 * method later is then a code change, not a migration that takes an ACCESS
 * EXCLUSIVE lock on the users table. Existing rows default to `totp`, which is
 * the only method that existed before this.
 */
export class AddTwoFactorMethod1785000000001 implements MigrationInterface {
  name = 'AddTwoFactorMethod1785000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD COLUMN IF NOT EXISTS "twoFactorMethod" character varying(16) NOT NULL DEFAULT 'totp'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN IF EXISTS "twoFactorMethod"`,
    );
  }
}
