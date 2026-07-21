import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePremiumRollupsTable1784000000006
  implements MigrationInterface {
  name = 'CreatePremiumRollupsTable1784000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "analytics"."premiumRollups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdBy" character varying,
        "createdOn" TIMESTAMP NOT NULL DEFAULT now(),
        "lastModifiedBy" character varying,
        "lastModifiedOn" TIMESTAMP DEFAULT now(),
        "lastRefreshed" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" character varying NOT NULL,
        "weekStartDate" TIMESTAMP NOT NULL,
        "totalInteractions" integer NOT NULL DEFAULT 0,
        "topFeatureUsed" character varying,
        "interactionBreakdown" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_premiumRollups" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "analytics"."premiumRollups"`);
  }
}
