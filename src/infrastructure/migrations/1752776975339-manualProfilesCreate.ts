import { MigrationInterface, QueryRunner } from 'typeorm';

export class ManualProfilesCreate1752776975339 implements MigrationInterface {
  name = 'ManualProfilesCreate1752776975339';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "identity"."userClaims" ("id" SERIAL NOT NULL, "userId" character varying NOT NULL, "claimType" character varying NOT NULL, "claimValue" character varying NOT NULL, CONSTRAINT "PK_d34823c6c7982192f4fec5fb520" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "manualProfiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "userId" character varying NOT NULL, "platform" character varying NOT NULL, "isActive" boolean NOT NULL, "icon" character varying NOT NULL, "url" character varying NOT NULL, "displayOrder" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_684c4f086b16ef892aa2a3b639c" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "manualProfiles"`);
    await queryRunner.query(`DROP TABLE "identity"."userClaims"`);
  }
}
