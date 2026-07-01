import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixYoutubeAnalyticsJsonbDefaults1782478634647 implements MigrationInterface {
    name = 'FixYoutubeAnalyticsJsonbDefaults1782478634647'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "trafficSources" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`UPDATE "analytics"."youtubeChannelAnalytics" SET "trafficSources" = '[]'::jsonb WHERE "trafficSources" = '{}'::jsonb OR "trafficSources" IS NULL`);

        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "geography" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`UPDATE "analytics"."youtubeChannelAnalytics" SET "geography" = '[]'::jsonb WHERE "geography" = '{}'::jsonb OR "geography" IS NULL`);

        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "devices" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`UPDATE "analytics"."youtubeChannelAnalytics" SET "devices" = '[]'::jsonb WHERE "devices" = '{}'::jsonb OR "devices" IS NULL`);

        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "playbackLocations" SET DEFAULT '[]'::jsonb`);
        await queryRunner.query(`UPDATE "analytics"."youtubeChannelAnalytics" SET "playbackLocations" = '[]'::jsonb WHERE "playbackLocations" = '{}'::jsonb OR "playbackLocations" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "trafficSources" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "geography" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "devices" SET DEFAULT '{}'::jsonb`);
        await queryRunner.query(`ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "playbackLocations" SET DEFAULT '{}'::jsonb`);
    }
}
