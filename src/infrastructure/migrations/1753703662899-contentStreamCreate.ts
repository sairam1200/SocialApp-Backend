import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContentStreamCreate1753703662899 implements MigrationInterface {
  name = 'ContentStreamCreate1753703662899';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."contentStreams_type_enum" AS ENUM('Profile', 'Post', 'Comment', 'Group', 'Channel')`,
    );
    await queryRunner.query(
      `CREATE TABLE "contentStreams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "type" "public"."contentStreams_type_enum" NOT NULL, "subType" character varying NOT NULL, "title" character varying NOT NULL, "platform" character varying NOT NULL, "externalId" character varying NOT NULL, "metaData" json, CONSTRAINT "PK_074651dadd94b70b43142b067d9" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contentStreams"`);
    await queryRunner.query(`DROP TYPE "public"."contentStreams_type_enum"`);
  }
}
