import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPreferenceCreate1769100304723 implements MigrationInterface {
  name = 'UserPreferenceCreate1769100304723';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "userPreferences_theme_enum" AS ENUM('System', 'Light', 'Dark')`,
    );
    await queryRunner.query(
      `CREATE TYPE "userPreferences_notificationChannelsEnabled_enum" AS ENUM('inApp', 'email', 'push')`,
    );
    await queryRunner.query(
      `CREATE TABLE "userPreferences" ("userId" uuid NOT NULL, "theme" "userPreferences_theme_enum" NOT NULL DEFAULT 'System', "notificationChannelsEnabled" "userPreferences_notificationChannelsEnabled_enum" array NOT NULL DEFAULT '{inApp,email,push}', CONSTRAINT "PK_userPreferences_userId" PRIMARY KEY ("userId"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "userPreferences" ADD CONSTRAINT "FK_userPreferences_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "userPreferences" DROP CONSTRAINT "FK_userPreferences_userId"`,
    );
    await queryRunner.query(`DROP TABLE "userPreferences"`);
    await queryRunner.query(
      `DROP TYPE "userPreferences_notificationChannelsEnabled_enum"`,
    );
    await queryRunner.query(`DROP TYPE "userPreferences_theme_enum"`);
  }
}
