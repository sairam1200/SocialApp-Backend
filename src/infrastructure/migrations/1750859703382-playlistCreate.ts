import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlaylistCreate1750859703382 implements MigrationInterface {
  name = 'PlaylistCreate1750859703382';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."playlistMembers_role_enum" AS ENUM('Owner', 'Editor', 'Viewer')`,
    );
    await queryRunner.query(
      `CREATE TABLE "playlistMembers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "role" "public"."playlistMembers_role_enum" NOT NULL DEFAULT 'Viewer', "joinedAt" TIMESTAMP NOT NULL DEFAULT now(), "removedAt" TIMESTAMP, "playlistId" uuid, "userId" uuid, CONSTRAINT "PK_e653ff431fec13df8ee60e7925e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2bb9af69cde36842624bd6b01f" ON "playlistMembers" ("playlistId", "userId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "playlists" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "name" character varying(255) NOT NULL, "referenceId" character varying(255) NOT NULL, "description" text, "metadata" json, "ownerId" uuid NOT NULL, CONSTRAINT "UQ_4a8390cf213d9c8765d7a796baf" UNIQUE ("referenceId"), CONSTRAINT "PK_a4597f4189a75d20507f3f7ef0d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistMembers" ADD CONSTRAINT "FK_3e4647ab0a6bb332992aaefa2cf" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistMembers" ADD CONSTRAINT "FK_bfc49ecc4810c7dac4fe0308771" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD CONSTRAINT "FK_aa5d498a2f045be2fb71ef98d45" FOREIGN KEY ("ownerId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "playlists" DROP CONSTRAINT "FK_aa5d498a2f045be2fb71ef98d45"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistMembers" DROP CONSTRAINT "FK_bfc49ecc4810c7dac4fe0308771"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistMembers" DROP CONSTRAINT "FK_3e4647ab0a6bb332992aaefa2cf"`,
    );
    await queryRunner.query(`DROP TABLE "playlists"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2bb9af69cde36842624bd6b01f"`,
    );
    await queryRunner.query(`DROP TABLE "playlistMembers"`);
    await queryRunner.query(`DROP TYPE "public"."playlistMembers_role_enum"`);
  }
}
