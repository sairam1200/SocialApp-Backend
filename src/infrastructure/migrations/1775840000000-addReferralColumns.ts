import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferralColumns1775840000000 implements MigrationInterface {
  name = 'AddReferralColumns1775840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "referralCode" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD CONSTRAINT "UQ_users_referralCode" UNIQUE ("referralCode")`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "referredBy" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "referredBy"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP CONSTRAINT "UQ_users_referralCode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "referralCode"`,
    );
  }
}
