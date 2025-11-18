import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchemaNotification implements MigrationInterface {
  name = 'CreateSchemaNotification1745256809081'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS notification`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS notification CASCADE`);
  }
}