import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkedAccountMOD1748972623704 implements MigrationInterface {
    name = 'LinkedAccountMOD1748972623704'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linkedAccounts" ALTER COLUMN "email" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "linkedAccounts" ALTER COLUMN "email" SET NOT NULL`);
    }

}
