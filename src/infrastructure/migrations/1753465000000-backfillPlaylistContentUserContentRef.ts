import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillPlaylistContentUserContentRef1753465000000 implements MigrationInterface {
  name = 'BackfillPlaylistContentUserContentRef1753465000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "playlistContent" pc
       SET "userContentId" = uc.id
       FROM "userContents" uc
       WHERE pc."contentId" = uc."externalId"
         AND pc."platform" = uc."platform"
         AND pc."userContentId" IS NULL`,
    );

    await queryRunner.query(
      `UPDATE "playlists"
       SET "playlistType" = 'System',
           "systemType" = 'Bookmark'
       WHERE LOWER("name") = 'bookmark'
         AND "playlistType" = 'User'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "playlists"
       SET "playlistType" = 'User',
           "systemType" = NULL
       WHERE "systemType" = 'Bookmark'`,
    );

    await queryRunner.query(
      `UPDATE "playlistContent"
       SET "userContentId" = NULL
       WHERE "userContentId" IS NOT NULL`,
    );
  }
}
