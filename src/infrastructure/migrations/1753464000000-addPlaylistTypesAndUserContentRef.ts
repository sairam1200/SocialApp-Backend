import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlaylistTypesAndUserContentRef1753464000000 implements MigrationInterface {
  name = 'AddPlaylistTypesAndUserContentRef1753464000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "playlistType" character varying(20) NOT NULL DEFAULT 'User'`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "systemType" character varying(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "userContentId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_playlistContent_userContentId" ON "playlistContent" ("userContentId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD CONSTRAINT "FK_playlistContent_userContent" FOREIGN KEY ("userContentId") REFERENCES "userContents"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP CONSTRAINT "FK_playlistContent_userContent"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_playlistContent_userContentId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP COLUMN "userContentId"`,
    );
    await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "systemType"`);
    await queryRunner.query(
      `ALTER TABLE "playlists" DROP COLUMN "playlistType"`,
    );
  }
}
