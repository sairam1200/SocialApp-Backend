import { MigrationInterface, QueryRunner } from "typeorm";

export class UserMOD1751085117546 implements MigrationInterface {
    name = 'UserMOD1751085117546'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."users" ADD "twoFactorEnabled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "identity"."users" ADD "twoFactorSecret" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "twoFactorSecret"`);
        await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "twoFactorEnabled"`);
    }

}
