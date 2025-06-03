import { MigrationInterface, QueryRunner } from "typeorm";

export class UserMOD1748636206587 implements MigrationInterface {
    name = 'UserMOD1748636206587'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."users" ADD "profileImage" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "profileImage"`);
    }

}
