import { MigrationInterface, QueryRunner } from "typeorm";

export class UserPreferenceCreate1769100304723 implements MigrationInterface {
    name = 'UserPreferenceCreate1769100304723'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "identity"."userPreferences_theme_enum" AS ENUM('System', 'Light', 'Dark')`);
        await queryRunner.query(`CREATE TYPE "identity"."userPreferences_notificationChannelsEnabled_enum" AS ENUM('inApp', 'email', 'push')`);
        await queryRunner.query(`CREATE TABLE "identity"."userPreferences" ("userId" uuid NOT NULL, "theme" "identity"."userPreferences_theme_enum" NOT NULL DEFAULT 'System', "notificationChannelsEnabled" "identity"."userPreferences_notificationChannelsEnabled_enum" array NOT NULL DEFAULT '{inApp,email,push}', "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, CONSTRAINT "PK_userPreferences_userId" PRIMARY KEY ("userId"))`);
        await queryRunner.query(`ALTER TABLE "identity"."userPreferences" ADD CONSTRAINT "FK_userPreferences_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."userPreferences" DROP CONSTRAINT "FK_userPreferences_userId"`);
        await queryRunner.query(`DROP TABLE "identity"."userPreferences"`);
        await queryRunner.query(`DROP TYPE "identity"."userPreferences_notificationChannelsEnabled_enum"`);
        await queryRunner.query(`DROP TYPE "identity"."userPreferences_theme_enum"`);
    }

}
