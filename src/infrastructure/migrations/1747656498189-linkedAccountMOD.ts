import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkedAccountMOD1747656498189 implements MigrationInterface {
  name = 'LinkedAccountMOD1747656498189';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" DROP COLUMN "username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" ADD "userName" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" ADD "allowImport" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" DROP COLUMN "allowImport"`,
    );
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" DROP COLUMN "userName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" ADD "username" character varying NOT NULL`,
    );
  }
}
