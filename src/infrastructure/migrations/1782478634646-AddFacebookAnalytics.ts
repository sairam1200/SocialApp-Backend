import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookAnalytics1782478634646 implements MigrationInterface {
  name = 'AddFacebookAnalytics1782478634646';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "analytics"."facebookVideoAnalytics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "videoId" character varying NOT NULL, "userId" character varying NOT NULL, "videoViews" bigint NOT NULL DEFAULT '0', "uniqueViewers" integer NOT NULL DEFAULT '0', "threeSecondViews" integer NOT NULL DEFAULT '0', "oneMinuteViews" integer NOT NULL DEFAULT '0', "averageWatchTime" double precision NOT NULL DEFAULT '0', "totalWatchTime" bigint NOT NULL DEFAULT '0', "completionRate" double precision NOT NULL DEFAULT '0', "publishedAt" TIMESTAMP, "duration" character varying, "snapshotDate" date NOT NULL, CONSTRAINT "PK_df62a5d868caa53ba0303576167" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0e23d2dd5bbebcf986b9bf31e3" ON "analytics"."facebookVideoAnalytics" ("snapshotDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d2dedf833066b554b6f10d6618" ON "analytics"."facebookVideoAnalytics" ("videoId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c3505d303263fed8ecb6bc87de" ON "analytics"."facebookVideoAnalytics" ("videoId", "snapshotDate") `,
    );
    await queryRunner.query(
      `CREATE TABLE "analytics"."facebookPostAnalytics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "postId" character varying NOT NULL, "userId" character varying NOT NULL, "reach" bigint NOT NULL DEFAULT '0', "impressions" bigint NOT NULL DEFAULT '0', "engagement" double precision NOT NULL DEFAULT '0', "reactionsCount" integer NOT NULL DEFAULT '0', "likeCount" integer NOT NULL DEFAULT '0', "loveCount" integer NOT NULL DEFAULT '0', "hahaCount" integer NOT NULL DEFAULT '0', "wowCount" integer NOT NULL DEFAULT '0', "sadCount" integer NOT NULL DEFAULT '0', "angryCount" integer NOT NULL DEFAULT '0', "commentCount" integer NOT NULL DEFAULT '0', "shareCount" integer NOT NULL DEFAULT '0', "clickCount" integer NOT NULL DEFAULT '0', "videoViews" integer NOT NULL DEFAULT '0', "averageWatchTime" double precision NOT NULL DEFAULT '0', "publishedAt" TIMESTAMP, "postType" character varying, "snapshotDate" date NOT NULL, CONSTRAINT "PK_d9c712a603349f7d77461c38a72" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c8f5470ba6bc524a8679f06e7" ON "analytics"."facebookPostAnalytics" ("reach") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a66607ae14da185f2c87ca0643" ON "analytics"."facebookPostAnalytics" ("impressions") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1b75cefdc2d4eb32956efdf9da" ON "analytics"."facebookPostAnalytics" ("engagement") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f60e80b0a92b70d636421757cf" ON "analytics"."facebookPostAnalytics" ("snapshotDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a593b8702450a2efea1ae10549" ON "analytics"."facebookPostAnalytics" ("postId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_25436a0120a9c8845b549a7050" ON "analytics"."facebookPostAnalytics" ("postId", "snapshotDate") `,
    );
    await queryRunner.query(
      `CREATE TABLE "analytics"."facebookPageAnalytics" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "pageId" character varying NOT NULL, "userId" character varying NOT NULL, "followerCount" integer NOT NULL DEFAULT '0', "fanCount" integer NOT NULL DEFAULT '0', "impressions" bigint NOT NULL DEFAULT '0', "reach" bigint NOT NULL DEFAULT '0', "engagement" double precision NOT NULL DEFAULT '0', "pageViews" integer NOT NULL DEFAULT '0', "clicks" integer NOT NULL DEFAULT '0', "snapshotDate" date NOT NULL, CONSTRAINT "PK_0a6bef3d822848cd90cd464f8d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c5b1144d9a60b529c3604fbb45" ON "analytics"."facebookPageAnalytics" ("reach") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_760b94172a7ead39c3667cf4a2" ON "analytics"."facebookPageAnalytics" ("impressions") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_90fd091da068a6a915a04db9aa" ON "analytics"."facebookPageAnalytics" ("engagement") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d72202657cfe37fbde4d6ad5e9" ON "analytics"."facebookPageAnalytics" ("snapshotDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_22631eca5b083d3173f35085d3" ON "analytics"."facebookPageAnalytics" ("pageId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c828142402e7dfafc06e1deb32" ON "analytics"."facebookPageAnalytics" ("pageId", "snapshotDate") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_c828142402e7dfafc06e1deb32"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_22631eca5b083d3173f35085d3"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_d72202657cfe37fbde4d6ad5e9"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_90fd091da068a6a915a04db9aa"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_760b94172a7ead39c3667cf4a2"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_c5b1144d9a60b529c3604fbb45"`,
    );
    await queryRunner.query(`DROP TABLE "analytics"."facebookPageAnalytics"`);
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_25436a0120a9c8845b549a7050"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_a593b8702450a2efea1ae10549"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_f60e80b0a92b70d636421757cf"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_1b75cefdc2d4eb32956efdf9da"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_a66607ae14da185f2c87ca0643"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_0c8f5470ba6bc524a8679f06e7"`,
    );
    await queryRunner.query(`DROP TABLE "analytics"."facebookPostAnalytics"`);
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_c3505d303263fed8ecb6bc87de"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_d2dedf833066b554b6f10d6618"`,
    );
    await queryRunner.query(
      `DROP INDEX "analytics"."IDX_0e23d2dd5bbebcf986b9bf31e3"`,
    );
    await queryRunner.query(`DROP TABLE "analytics"."facebookVideoAnalytics"`);
  }
}
