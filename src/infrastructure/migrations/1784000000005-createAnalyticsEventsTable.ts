import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnalyticsEventsTable1784000000005 implements MigrationInterface {
  name = 'CreateAnalyticsEventsTable1784000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "analytics"."analyticsEvents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdBy" character varying,
        "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
        "lastModifiedBy" character varying,
        "lastModifiedOn" TIMESTAMP DEFAULT now(),
        "lastRefreshed" TIMESTAMP NOT NULL DEFAULT now(),
        "eventName" character varying NOT NULL,
        "userId" character varying,
        "metadata" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_analyticsEvents" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "analytics"."analyticsEvents"`);
  }
}
