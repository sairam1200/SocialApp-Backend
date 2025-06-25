import { MigrationInterface, QueryRunner } from "typeorm";

export class PlaylistContentCreate1750887193061 implements MigrationInterface {
    name = 'PlaylistContentCreate1750887193061'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "playlistContent" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "type" character varying(255) NOT NULL, "platform" character varying(30) NOT NULL, "contentId" character varying(255) NOT NULL, "contentUrl" character varying NOT NULL, "title" character varying NOT NULL, "description" text, "thumbnailUrl" character varying NOT NULL, "metadata" json, "playlistId" uuid, "addedById" uuid, CONSTRAINT "PK_2a9ce79fd0afd4cf95fd439a69b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "metadata"`);
        await queryRunner.query(`ALTER TABLE "playlistContent" ADD CONSTRAINT "FK_46c8f3bcf9fd39aa6d63fc6ee96" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "playlistContent" ADD CONSTRAINT "FK_46650044a622fb1d42a6ba5be8f" FOREIGN KEY ("addedById") REFERENCES "playlistMembers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "playlistContent" DROP CONSTRAINT "FK_46650044a622fb1d42a6ba5be8f"`);
        await queryRunner.query(`ALTER TABLE "playlistContent" DROP CONSTRAINT "FK_46c8f3bcf9fd39aa6d63fc6ee96"`);
        await queryRunner.query(`ALTER TABLE "playlists" ADD "metadata" json`);
        await queryRunner.query(`DROP TABLE "playlistContent"`);
    }

}
