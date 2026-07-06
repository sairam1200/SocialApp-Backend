import { MigrationInterface, QueryRunner } from 'typeorm';

export class ManualProfilesMOD1752838118033 implements MigrationInterface {
  name = 'ManualProfilesMOD1752838118033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" DROP COLUMN "userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" ADD "userId" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" ADD CONSTRAINT "FK_aacc2e97bf762b3e29c109c4885" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" DROP CONSTRAINT "FK_aacc2e97bf762b3e29c109c4885"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" DROP COLUMN "userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" ADD "userId" character varying NOT NULL`,
    );
  }
}
