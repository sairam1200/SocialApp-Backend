import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSchemaIdentity implements MigrationInterface {
  name = 'CreateSchemaIdentity1745256809081';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS identity`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS identity CASCADE`);
  }
}
