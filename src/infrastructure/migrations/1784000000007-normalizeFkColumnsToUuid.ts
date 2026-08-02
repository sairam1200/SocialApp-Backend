import { MigrationInterface, QueryRunner } from 'typeorm';

export class normalizeFkColumnsToUuid1784000000007 implements MigrationInterface {
  name = 'normalizeFkColumnsToUuid1784000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Normalize nullable varchar columns: empty strings and whitespace -> NULL
    // These columns are nullable and contain '' from OAuth flows where userId is unknown
    await queryRunner.query(
      `UPDATE "dataProtectionKeys" SET "userId" = NULL WHERE "userId" = '' OR "userId" ~ '^[[:space:]]+$'`,
    );
    await queryRunner.query(
      `UPDATE "rateLimits" SET "userId" = NULL WHERE "userId" = '' OR "userId" ~ '^[[:space:]]+$'`,
    );
    await queryRunner.query(
      `UPDATE "rateLimitLogs" SET "userId" = NULL WHERE "userId" = '' OR "userId" ~ '^[[:space:]]+$'`,
    );
    await queryRunner.query(
      `UPDATE "analytics"."analyticsEvents" SET "userId" = NULL WHERE "userId" = '' OR "userId" ~ '^[[:space:]]+$'`,
    );
    await queryRunner.query(
      `UPDATE "publish_jobs" SET "uploadId" = NULL WHERE "uploadId" = '' OR "uploadId" ~ '^[[:space:]]+$'`,
    );

    // identity schema (all NOT NULL — safe to convert directly)
    await queryRunner.query(
      `ALTER TABLE "identity"."userLogins" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."userRoles" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."userRoles" ALTER COLUMN "roleId" TYPE uuid USING "roleId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."userClaims" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );

    // public schema — NOT NULL columns first
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "searchHistories" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "userContents" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "userTopics" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "publish_jobs" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "publish_jobs" ALTER COLUMN "linkedAccountId" TYPE uuid USING "linkedAccountId"::uuid`,
    );
    await queryRunner.query(
<<<<<<< HEAD
      `DO $$ BEGIN
        ALTER TABLE "youtube_accounts" ALTER COLUMN "user_id" TYPE uuid USING "user_id"::uuid;
       EXCEPTION WHEN undefined_table THEN NULL;
       END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        ALTER TABLE "youtube_videos" ALTER COLUMN "account_id" TYPE uuid USING "account_id"::uuid;
       EXCEPTION WHEN undefined_table THEN NULL;
       END $$`,
=======
      `ALTER TABLE "youtube_accounts" ALTER COLUMN "user_id" TYPE uuid USING "user_id"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_videos" ALTER COLUMN "account_id" TYPE uuid USING "account_id"::uuid`,
>>>>>>> other/staging
    );

    // public schema — nullable columns (already normalized above)
    await queryRunner.query(
      `ALTER TABLE "dataProtectionKeys" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "rateLimits" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "rateLimitLogs" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "publish_jobs" ALTER COLUMN "uploadId" TYPE uuid USING "uploadId"::uuid`,
    );

    // analytics schema — NOT NULL columns first
    await queryRunner.query(
      `ALTER TABLE "analytics"."premiumRollups" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."youtubeVideoAnalytics" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."facebookVideoAnalytics" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."facebookPostAnalytics" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."facebookPageAnalytics" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );

    // analytics schema — nullable columns (already normalized above)
    await queryRunner.query(
      `ALTER TABLE "analytics"."analyticsEvents" ALTER COLUMN "userId" TYPE uuid USING "userId"::uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // analytics schema
    await queryRunner.query(
      `ALTER TABLE "analytics"."facebookPageAnalytics" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."facebookPostAnalytics" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."facebookVideoAnalytics" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."youtubeChannelAnalytics" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."youtubeVideoAnalytics" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."premiumRollups" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics"."analyticsEvents" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );

    // public schema
    await queryRunner.query(
      `ALTER TABLE "youtube_videos" ALTER COLUMN "account_id" TYPE text USING "account_id"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "youtube_accounts" ALTER COLUMN "user_id" TYPE character varying(255) USING "user_id"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "publish_jobs" ALTER COLUMN "uploadId" TYPE character varying(255) USING "uploadId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "publish_jobs" ALTER COLUMN "linkedAccountId" TYPE character varying(255) USING "linkedAccountId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "publish_jobs" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "manualProfiles" ALTER COLUMN "userId" TYPE text USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "userTopics" ALTER COLUMN "userId" TYPE text USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "userContents" ALTER COLUMN "userId" TYPE text USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "rateLimitLogs" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "rateLimits" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "dataProtectionKeys" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "searchHistories" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "linkedAccounts" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );

    // identity schema
    await queryRunner.query(
      `ALTER TABLE "identity"."userClaims" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."userRoles" ALTER COLUMN "roleId" TYPE character varying(255) USING "roleId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."userRoles" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."userLogins" ALTER COLUMN "userId" TYPE character varying(255) USING "userId"::text`,
    );
  }
}
