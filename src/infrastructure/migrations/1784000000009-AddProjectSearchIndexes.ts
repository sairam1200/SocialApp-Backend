import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectSearchIndexes1784000000009 implements MigrationInterface {
  name = 'AddProjectSearchIndexes1784000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_title_trgm"
        ON project USING gin (title gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_project_description_trgm"
        ON project USING gin (description gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_project_description_trgm"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_project_title_trgm"`);
  }
}
