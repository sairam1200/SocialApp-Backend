import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserBiometricCreate1763722984473 implements MigrationInterface {
  name = 'UserBiometricCreate1763722984473';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "identity"."userBiometrics_privacy_enum" AS ENUM('Everyone', 'Interactions')`,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."userBiometrics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "userId" uuid NOT NULL, "profileImageUrl" character varying, "defaultProfileImageUrl" character varying NOT NULL, "privacy" "identity"."userBiometrics_privacy_enum" NOT NULL DEFAULT 'Everyone', CONSTRAINT "UQ_d4e6f3ed052677a1e4fa42e3e22" UNIQUE ("userId"), CONSTRAINT "REL_d4e6f3ed052677a1e4fa42e3e2" UNIQUE ("userId"), CONSTRAINT "PK_501248c442b04482db84e15fc2e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "profileImagePrivacy"`,
    );
    await queryRunner.query(
      `DROP TYPE "identity"."users_profileimageprivacy_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "profileImage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."userBiometrics" ADD CONSTRAINT "FK_d4e6f3ed052677a1e4fa42e3e22" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."userBiometrics" DROP CONSTRAINT "FK_d4e6f3ed052677a1e4fa42e3e22"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "profileImage" character varying`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."users_profileimageprivacy_enum" AS ENUM('Everyone', 'Interactions')`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "profileImagePrivacy" "identity"."users_profileimageprivacy_enum" NOT NULL DEFAULT 'Everyone'`,
    );
    await queryRunner.query(`DROP TABLE "identity"."userBiometrics"`);
    await queryRunner.query(
      `DROP TYPE "identity"."userBiometrics_privacy_enum"`,
    );
  }
}
