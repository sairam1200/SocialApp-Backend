import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCollectionEnhancements1753466000000 implements MigrationInterface {
  name = 'AddCollectionEnhancements1753466000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "pinOrder" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "sortBy" character varying(50) NOT NULL DEFAULT 'manual'`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "isArchived" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "coverImage" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "icon" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "color" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "playlists" ADD COLUMN "lastViewedAt" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "playlists" DROP COLUMN "lastViewedAt"`,
    );
    await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "color"`);
    await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "icon"`);
    await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "coverImage"`);
    await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "isArchived"`);
    await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "sortBy"`);
    await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "pinOrder"`);
  }
}
