import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixYoutubeAnalyticsJsonbDefaults1782478634647 implements MigrationInterface {
    name = 'FixYoutubeAnalyticsJsonbDefaults1782478634647'

   public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "analytics"."youtubeChannelAnalytics"
    ADD COLUMN IF NOT EXISTS "trafficSources" jsonb NOT NULL DEFAULT '[]'::jsonb
  `);

  await queryRunner.query(`
    ALTER TABLE "analytics"."youtubeChannelAnalytics"
    ADD COLUMN IF NOT EXISTS "geography" jsonb NOT NULL DEFAULT '[]'::jsonb
  `);

  await queryRunner.query(`
    ALTER TABLE "analytics"."youtubeChannelAnalytics"
    ADD COLUMN IF NOT EXISTS "devices" jsonb NOT NULL DEFAULT '[]'::jsonb
  `);

  await queryRunner.query(`
    ALTER TABLE "analytics"."youtubeChannelAnalytics"
    ADD COLUMN IF NOT EXISTS "playbackLocations" jsonb NOT NULL DEFAULT '[]'::jsonb
  `);
}

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "trafficSources" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "geography" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "devices" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "playbackLocations" SET DEFAULT '{}'::jsonb`);
    }
}
