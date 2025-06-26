import { MigrationInterface, QueryRunner } from "typeorm";

export class UserClaimCreate1750962566077 implements MigrationInterface {
    name = 'UserClaimCreate1750962566077'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "identity"."UserClaims" ("id" SERIAL NOT NULL, "userId" character varying NOT NULL, "claimType" character varying NOT NULL, "claimValue" character varying NOT NULL, CONSTRAINT "PK_e3c6da6878656857455b21605cb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "identity"."users" ADD "normalizedUserName" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity"."users" DROP COLUMN "normalizedUserName"`);
        await queryRunner.query(`DROP TABLE "identity"."UserClaims"`);
    }

}
