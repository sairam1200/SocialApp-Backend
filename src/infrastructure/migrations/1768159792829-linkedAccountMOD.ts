import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkedAccountMOD1768159792829 implements MigrationInterface {
    name = 'LinkedAccountMOD1768159792829'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" DROP CONSTRAINT "FK_user_follows_follower"`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" DROP CONSTRAINT "FK_user_follows_followed"`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" DROP CONSTRAINT "UQ_user_follows_pair"`);
        await queryRunner.query(`ALTER TABLE "playlists" ADD "displayOrder" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "linkedAccounts" ADD "syncEnabled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "manualProfiles" ALTER COLUMN "isActive" SET DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" ADD CONSTRAINT "UQ_c67b13661547ebf19852abb9493" UNIQUE ("followerId", "followedId")`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" ADD CONSTRAINT "FK_6300484b604263eaae8a6aab88d" FOREIGN KEY ("followerId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" ADD CONSTRAINT "FK_e9f5692cb31f5b45c412081546a" FOREIGN KEY ("followedId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" DROP CONSTRAINT "FK_e9f5692cb31f5b45c412081546a"`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" DROP CONSTRAINT "FK_6300484b604263eaae8a6aab88d"`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" DROP CONSTRAINT "UQ_c67b13661547ebf19852abb9493"`);
        await queryRunner.query(`ALTER TABLE "manualProfiles" ALTER COLUMN "isActive" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "linkedAccounts" DROP COLUMN "syncEnabled"`);
        await queryRunner.query(`ALTER TABLE "playlists" DROP COLUMN "displayOrder"`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" ADD CONSTRAINT "UQ_user_follows_pair" UNIQUE ("followedId", "followerId")`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" ADD CONSTRAINT "FK_user_follows_followed" FOREIGN KEY ("followedId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "identity"."user_follows" ADD CONSTRAINT "FK_user_follows_follower" FOREIGN KEY ("followerId") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
