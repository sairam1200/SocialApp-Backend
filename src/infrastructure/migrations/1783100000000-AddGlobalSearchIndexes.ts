import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGlobalSearchIndexes1783100000000 implements MigrationInterface {
  name = "AddGlobalSearchIndexes1783100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_firstName_trgm"
      ON identity.users USING gin ("firstName" gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_lastName_trgm"
      ON identity.users USING gin ("lastName" gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_userName_trgm"
      ON identity.users USING gin ("userName" gin_trgm_ops)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_userContents_title_trgm"
      ON "userContents" USING gin (title gin_trgm_ops)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_userContents_title_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS identity."IDX_users_userName_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS identity."IDX_users_lastName_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS identity."IDX_users_firstName_trgm"`);
  }
}
