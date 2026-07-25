import { MigrationInterface, QueryRunner } from 'typeorm';

export class DataProtectionKeyCreate1747420148752 implements MigrationInterface {
  name = 'DataProtectionKeyCreate1747420148752';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "dataProtectionKeys" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "userId" character varying, "key" character varying NOT NULL, "value" character varying, "expiresIn" integer, CONSTRAINT "PK_72baa752799a3d9266a2320a603" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "dataProtectionKeys"`);
  }
}
