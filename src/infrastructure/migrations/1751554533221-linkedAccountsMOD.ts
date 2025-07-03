import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkedAccountsMOD1751554533221 implements MigrationInterface {
    name = 'LinkedAccountsMOD1751554533221'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linkedAccounts" ADD "verified" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "linkedAccounts" ADD "externalUrl" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linkedAccounts" DROP COLUMN "externalUrl"`);
        await queryRunner.query(`ALTER TABLE "linkedAccounts" DROP COLUMN "verified"`);
    }

}
