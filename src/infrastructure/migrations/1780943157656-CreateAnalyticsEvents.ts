import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAnalyticsEvents1780943157656 implements MigrationInterface {
    name = 'CreateAnalyticsEvents1780943157656'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "userTopics" DROP CONSTRAINT "FK_userTopics_topic"`);
        await queryRunner.query(`ALTER TABLE "userTopics" DROP CONSTRAINT "FK_userTopics_user"`);
        await queryRunner.query(`ALTER TABLE "userPreferences" DROP CONSTRAINT "FK_userPreferences_userId"`);
        await queryRunner.query(`DROP INDEX "public"."idx_userTopics_user"`);
        await queryRunner.query(`DROP INDEX "public"."idx_userTopics_topic"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_USER_CONTENT_UNIQUE_PLATFORM_EXTERNAL"`);
        await queryRunner.query(`ALTER TABLE "userTopics" DROP CONSTRAINT "UQ_userTopics_user_topic"`);
        await queryRunner.query(`CREATE TABLE "analytics"."premiumRollups" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "userId" character varying NOT NULL, "weekStartDate" TIMESTAMP NOT NULL, "totalInteractions" integer NOT NULL DEFAULT '0', "topFeatureUsed" character varying, "interactionBreakdown" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_4c25d6eaeffc88f2f49d2741865" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "analytics"."analyticsEvents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "eventName" character varying NOT NULL, "userId" character varying, "metadata" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_6933e4e96d889caa154facfba0c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TYPE "public"."userPreferences_notificationChannelsEnabled_enum" RENAME TO "userPreferences_notificationChannelsEnabled_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."userPreferences_notificationchannelsenabled_enum" AS ENUM('inApp', 'email', 'push')`);
        await queryRunner.query(`ALTER TABLE "userPreferences" ALTER COLUMN "notificationChannelsEnabled" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "userPreferences" ALTER COLUMN "notificationChannelsEnabled" TYPE "public"."userPreferences_notificationchannelsenabled_enum"[] USING "notificationChannelsEnabled"::"text"::"public"."userPreferences_notificationchannelsenabled_enum"[]`);
        await queryRunner.query(`DROP TYPE "public"."userPreferences_notificationChannelsEnabled_enum_old"`);
        await queryRunner.query(`CREATE INDEX "idx_user_topics_user" ON "userTopics" ("userId") `);
        await queryRunner.query(`CREATE INDEX "idx_user_topics_topic" ON "userTopics" ("topicId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a75ac19084eca4761df66a0071" ON "userContents" ("userId", "platform", "externalId") `);
        await queryRunner.query(`ALTER TABLE "userTopics" ADD CONSTRAINT "UQ_a77e2aaef01e7db6bef02b2320f" UNIQUE ("userId", "topicId")`);
        await queryRunner.query(`ALTER TABLE "userTopics" ADD CONSTRAINT "FK_5d0669da5e37ea98567f0e910c1" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "userTopics" ADD CONSTRAINT "FK_cb1f640105974c8a510ee990966" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "userPreferences" ADD CONSTRAINT "FK_4f8d527eeb2409b3f726535b1e3" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "userPreferences" DROP CONSTRAINT "FK_4f8d527eeb2409b3f726535b1e3"`);
        await queryRunner.query(`ALTER TABLE "userTopics" DROP CONSTRAINT "FK_cb1f640105974c8a510ee990966"`);
        await queryRunner.query(`ALTER TABLE "userTopics" DROP CONSTRAINT "FK_5d0669da5e37ea98567f0e910c1"`);
        await queryRunner.query(`ALTER TABLE "userTopics" DROP CONSTRAINT "UQ_a77e2aaef01e7db6bef02b2320f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a75ac19084eca4761df66a0071"`);
        await queryRunner.query(`DROP INDEX "public"."idx_user_topics_topic"`);
        await queryRunner.query(`DROP INDEX "public"."idx_user_topics_user"`);
        await queryRunner.query(`CREATE TYPE "public"."userPreferences_notificationChannelsEnabled_enum_old" AS ENUM('inApp', 'email', 'push')`);
        await queryRunner.query(`ALTER TABLE "userPreferences" ALTER COLUMN "notificationChannelsEnabled" TYPE "public"."userPreferences_notificationChannelsEnabled_enum_old"[] USING "notificationChannelsEnabled"::"text"::"public"."userPreferences_notificationChannelsEnabled_enum_old"[]`);
        await queryRunner.query(`ALTER TABLE "userPreferences" ALTER COLUMN "notificationChannelsEnabled" SET DEFAULT '{inApp,email,push}'`);
        await queryRunner.query(`DROP TYPE "public"."userPreferences_notificationchannelsenabled_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."userPreferences_notificationChannelsEnabled_enum_old" RENAME TO "userPreferences_notificationChannelsEnabled_enum"`);
        await queryRunner.query(`DROP TABLE "analytics"."analyticsEvents"`);
        await queryRunner.query(`DROP TABLE "analytics"."premiumRollups"`);
        await queryRunner.query(`ALTER TABLE "userTopics" ADD CONSTRAINT "UQ_userTopics_user_topic" UNIQUE ("userId", "topicId")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_USER_CONTENT_UNIQUE_PLATFORM_EXTERNAL" ON "userContents" ("externalId", "platform", "userId") `);
        await queryRunner.query(`CREATE INDEX "idx_userTopics_topic" ON "userTopics" ("topicId") `);
        await queryRunner.query(`CREATE INDEX "idx_userTopics_user" ON "userTopics" ("userId") `);
        await queryRunner.query(`ALTER TABLE "userPreferences" ADD CONSTRAINT "FK_userPreferences_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "userTopics" ADD CONSTRAINT "FK_userTopics_user" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "userTopics" ADD CONSTRAINT "FK_userTopics_topic" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
