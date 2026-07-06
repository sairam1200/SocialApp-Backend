import { MigrationInterface, QueryRunner } from 'typeorm';

export class RateLimitCreate1748254385630 implements MigrationInterface {
  name = 'RateLimitCreate1748254385630';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "rateLimitLogs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "ip" character varying NOT NULL, "route" character varying NOT NULL, "count" integer NOT NULL, "userId" character varying, "expiredAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_991ef7b18a48ae0626bf3fcd44a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "rateLimits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdBy" character varying, "createdOn" TIMESTAMP NOT NULL DEFAULT now(), "lastModifiedBy" character varying, "lastModifiedOn" TIMESTAMP DEFAULT now(), "lastRefreshed" TIMESTAMP NOT NULL, "ip" character varying NOT NULL, "userId" character varying, "route" character varying NOT NULL, "count" integer NOT NULL DEFAULT '0', "expiresAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_e3e485fa2e71a9a06a92a81c9e1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3649df937b23d451ce53d77683" ON "rateLimits" ("ip", "route") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3649df937b23d451ce53d77683"`,
    );
    await queryRunner.query(`DROP TABLE "rateLimits"`);
    await queryRunner.query(`DROP TABLE "rateLimitLogs"`);
  }
}
