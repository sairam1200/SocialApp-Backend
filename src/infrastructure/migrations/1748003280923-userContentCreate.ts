import { MigrationInterface, QueryRunner } from "typeorm";

export class UserContentCreate1748003280923 implements MigrationInterface {
    name = 'UserContentCreate1748003280923'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "userContents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "userId" character varying NOT NULL, "type" character varying NOT NULL, "title" character varying NOT NULL, "platform" character varying NOT NULL, "metaData" json, CONSTRAINT "PK_b6208ce7052f0ce91929c08fee0" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "userContents"`);
    }

}
