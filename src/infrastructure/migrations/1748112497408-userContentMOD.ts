import { MigrationInterface, QueryRunner } from "typeorm";

export class UserContentMOD1748112497408 implements MigrationInterface {
    name = 'UserContentMOD1748112497408'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "userContents" ADD "externalId" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "userContents" DROP COLUMN "externalId"`);
    }

}
