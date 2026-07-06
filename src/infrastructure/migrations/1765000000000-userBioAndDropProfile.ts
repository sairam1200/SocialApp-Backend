import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserBioAndDropProfile1765000000000 implements MigrationInterface {
  name = 'UserBioAndDropProfile1765000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD "bio" text`);
    await queryRunner.query(`DROP TABLE IF EXISTS "identity"."user_profiles"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "identity"."user_profiles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "displayName" character varying(80),
                "bio" text,
                "theme" character varying(32) NOT NULL DEFAULT 'system',
                "settings" jsonb NOT NULL DEFAULT '{}',
                "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
                "lastModifiedOn" TIMESTAMP,
                CONSTRAINT "PK_user_profiles_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_user_profiles_userId" UNIQUE ("userId"),
                CONSTRAINT "FK_user_profiles_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE
            )
        `);
    await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "bio"`);
  }
}
