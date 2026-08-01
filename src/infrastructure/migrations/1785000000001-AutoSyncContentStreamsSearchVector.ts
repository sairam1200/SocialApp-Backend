import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoSyncContentStreamsSearchVector1785000000001 implements MigrationInterface {
  name = 'AutoSyncContentStreamsSearchVector1785000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create trigger function that auto-computes searchVector from searchText
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_contentstreams_searchvector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."searchVector" := to_tsvector('english', COALESCE(NEW."searchText", ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 2. Apply trigger on INSERT or UPDATE of searchText
    await queryRunner.query(`
      CREATE TRIGGER trg_contentstreams_searchvector
      BEFORE INSERT OR UPDATE OF "searchText" ON "contentStreams"
      FOR EACH ROW
      EXECUTE FUNCTION update_contentstreams_searchvector();
    `);

    // 3. Backfill searchText for existing rows where it is NULL
    //    The trigger fires on UPDATE, so searchVector is automatically populated
    await queryRunner.query(`
      UPDATE "contentStreams"
      SET "searchText" = LOWER(COALESCE("title", ''))
      WHERE "searchText" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_contentstreams_searchvector ON "contentStreams"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS update_contentstreams_searchvector()`,
    );
  }
}
