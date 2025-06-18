import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationCreate1748003164535 implements MigrationInterface {
    name = 'NotificationCreate1748003164535'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('Import')`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "metaData" json, "type" "public"."notifications_type_enum" NOT NULL, "title" character varying NOT NULL, "body" character varying NOT NULL, "notifyId" uuid NOT NULL, "isLive" boolean NOT NULL DEFAULT false, "sound" boolean NOT NULL DEFAULT false, "readAt" TIMESTAMP, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    }

}
