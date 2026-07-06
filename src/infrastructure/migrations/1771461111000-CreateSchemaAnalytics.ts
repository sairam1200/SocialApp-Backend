import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchemaAnalytics1771461111000 implements MigrationInterface {
  name = 'CreateSchemaAnalytics1771461111000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS analytics`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS analytics CASCADE`);
  }
}
