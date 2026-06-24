import { MigrationInterface, QueryRunner } from "typeorm";

export class AddYoutubeAnalytics1782241531692 implements MigrationInterface {
    name = 'AddYoutubeAnalytics1782241531692'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "analytics"."youtubeChannelAnalytics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "channelId" character varying NOT NULL, "userId" character varying NOT NULL, "subscriberCount" integer NOT NULL DEFAULT '0', "viewCount" bigint NOT NULL DEFAULT '0', "videoCount" integer NOT NULL DEFAULT '0', "engagementMetrics" jsonb NOT NULL DEFAULT '{}', "snapshotDate" date NOT NULL, CONSTRAINT "PK_da8169bbb4417f2a3d907a98ceb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_f128372ceb8a1f027d94c07d8b" ON "analytics"."youtubeChannelAnalytics" ("channelId", "snapshotDate") `);
        await queryRunner.query(`CREATE TABLE "analytics"."youtubeVideoAnalytics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "videoId" character varying NOT NULL, "userId" character varying NOT NULL, "viewCount" bigint NOT NULL DEFAULT '0', "likeCount" integer NOT NULL DEFAULT '0', "commentCount" integer NOT NULL DEFAULT '0', "favoriteCount" integer NOT NULL DEFAULT '0', "publishedAt" TIMESTAMP, "duration" character varying, "snapshotDate" date NOT NULL, CONSTRAINT "PK_7ff368d7299e72af9b6ec18165f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c26c808929762506bf95dc4f7a" ON "analytics"."youtubeVideoAnalytics" ("videoId", "snapshotDate") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "analytics"."IDX_c26c808929762506bf95dc4f7a"`);
        await queryRunner.query(`DROP TABLE "analytics"."youtubeVideoAnalytics"`);
        await queryRunner.query(`DROP INDEX "analytics"."IDX_f128372ceb8a1f027d94c07d8b"`);
        await queryRunner.query(`DROP TABLE "analytics"."youtubeChannelAnalytics"`);
    }

}
