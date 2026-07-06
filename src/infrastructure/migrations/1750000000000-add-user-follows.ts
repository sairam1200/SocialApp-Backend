import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserFollows1750000000000 implements MigrationInterface {
  name = 'AddUserFollows1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "identity"."user_follows_status_enum" AS ENUM('requested','accepted','blocked')`,
    );
    await queryRunner.query(
      `CREATE TABLE "identity"."user_follows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "followerId" uuid NOT NULL, "followedId" uuid NOT NULL, "status" "identity"."user_follows_status_enum" NOT NULL DEFAULT 'accepted', CONSTRAINT "PK_8f619e0a62f7f6ca6aa1b0b1c97" PRIMARY KEY ("id"), CONSTRAINT "UQ_user_follows_pair" UNIQUE ("followerId", "followedId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_follows_follower" ON "identity"."user_follows" ("followerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_follows_followed" ON "identity"."user_follows" ("followedId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."user_follows" ADD CONSTRAINT "FK_user_follows_follower" FOREIGN KEY ("followerId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."user_follows" ADD CONSTRAINT "FK_user_follows_followed" FOREIGN KEY ("followedId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identity"."user_follows" DROP CONSTRAINT "FK_user_follows_followed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identity"."user_follows" DROP CONSTRAINT "FK_user_follows_follower"`,
    );
    await queryRunner.query(
      `DROP INDEX "identity"."idx_user_follows_followed"`,
    );
    await queryRunner.query(
      `DROP INDEX "identity"."idx_user_follows_follower"`,
    );
    await queryRunner.query(`DROP TABLE "identity"."user_follows"`);
    await queryRunner.query(`DROP TYPE "identity"."user_follows_status_enum"`);
  }
}
