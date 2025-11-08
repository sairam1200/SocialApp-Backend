import { MigrationInterface, QueryRunner } from "typeorm";

export class UserMOD1762606499768 implements MigrationInterface {
    name = 'UserMOD1762606499768'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "searchHistories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "originalQuery" character varying NOT NULL, "normalizedQuery" character varying NOT NULL, "userId" character varying NOT NULL, CONSTRAINT "PK_89094922dbbb514215cfc253446" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "identity"."users" ADD "newEmail" character varying`);
        await queryRunner.query(`ALTER TABLE "identity"."users" ADD "lastEmailModifiedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "identity"."users" ADD "lastUserNameModifiedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "identity"."users" ADD "lastPasswordModifiedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TYPE "public"."contentStreams_type_enum" RENAME TO "contentStreams_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."contentStreams_type_enum" AS ENUM('Profile', 'Content', 'Community')`);
        await queryRunner.query(`ALTER TABLE "contentStreams" ALTER COLUMN "type" TYPE "public"."contentStreams_type_enum" USING "type"::"text"::"public"."contentStreams_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."contentStreams_type_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."contentStreams_type_enum_old" AS ENUM('Profile', 'Post', 'Comment', 'Group', 'Channel')`);
        await queryRunner.query(`ALTER TABLE "contentStreams" ALTER COLUMN "type" TYPE "public"."contentStreams_type_enum_old" USING "type"::"text"::"public"."contentStreams_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."contentStreams_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."contentStreams_type_enum_old" RENAME TO "contentStreams_type_enum"`);
        await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "lastPasswordModifiedAt"`);
        await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "lastUserNameModifiedAt"`);
        await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "lastEmailModifiedAt"`);
        await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "newEmail"`);
        await queryRunner.query(`DROP TABLE "searchHistories"`);
    }

}
