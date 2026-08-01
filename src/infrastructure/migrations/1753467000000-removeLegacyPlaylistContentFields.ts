/**
 * DANGEROUS MIGRATION — Only run after full production validation.
 *
 * Prerequisites:
 * - All playlistContent rows have non-null userContentId
 * - No errors in production for 2+ weeks
 * - Frontend fully migrated to use userContentId
 * - Monitoring confirms no fallback to legacy fields
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveLegacyPlaylistContentFields1753467000000 implements MigrationInterface {
  name = 'RemoveLegacyPlaylistContentFields1753467000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP COLUMN "contentId"`,
    );
    await queryRunner.query(`ALTER TABLE "playlistContent" DROP COLUMN "type"`);
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP COLUMN "platform"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP COLUMN "contentUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP COLUMN "title"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP COLUMN "description"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP COLUMN "thumbnailUrl"`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" DROP COLUMN "metadata"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "contentId" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "type" character varying(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "platform" character varying(30) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "contentUrl" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "title" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "description" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "thumbnailUrl" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlistContent" ADD COLUMN "metadata" json`,
    );
  }
}
