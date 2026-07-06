import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserMODANDNotificationMOD1763667048670
  implements MigrationInterface
{
  name = 'UserMODANDNotificationMOD1763667048670';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification"."notificationTemplates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_152112c8b299fca8edb172c8c63" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification"."notifications_type_enum" AS ENUM('Import')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification"."notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "metaData" json, "type" "notification"."notifications_type_enum" NOT NULL, "title" character varying NOT NULL, "body" character varying NOT NULL, "notifyId" uuid NOT NULL, "isLive" boolean NOT NULL DEFAULT false, "sound" boolean NOT NULL DEFAULT false, "readAt" TIMESTAMP, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification"."notificationEvents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, CONSTRAINT "PK_c275527024915e0c90e5431c610" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" ADD "isVisible" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "newPhoneNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "lastPhoneNumberModifiedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE TYPE "identity"."users_profileimageprivacy_enum" AS ENUM('Everyone', 'Interactions')`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" ADD "profileImagePrivacy" "identity"."users_profileimageprivacy_enum" NOT NULL DEFAULT 'Everyone'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "profileImagePrivacy"`,
    );
    await queryRunner.query(
      `DROP TYPE "identity"."users_profileimageprivacy_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "lastPhoneNumberModifiedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."users" DROP COLUMN "newPhoneNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" DROP COLUMN "isVisible"`,
    );
    await queryRunner.query(`DROP TABLE "notification"."notificationEvents"`);
    await queryRunner.query(`DROP TABLE "notification"."notifications"`);
    await queryRunner.query(
      `DROP TYPE "notification"."notifications_type_enum"`,
    );
    await queryRunner.query(
      `DROP TABLE "notification"."notificationTemplates"`,
    );
  }
}
