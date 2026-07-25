import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes `contentStreams` searchable at scale, and makes its dedup invariant real.
 *
 * ## Why
 *
 * `contentStreams` is the aggregated cross-platform content table — the read model
 * behind `GET /search/results`. Until 2026-07-25 nothing read it (see
 * docs/integrations/END_TO_END_VERIFICATION.md), so its query path had never
 * mattered. Now that it is served to users, it does:
 *
 * 1. **No index at all.** Not even on `platform`, which every query filters on.
 * 2. **`title ILIKE '%term%'`** cannot use a btree index — always a full scan.
 * 3. **`json_each_text(cs.metaData)`** expanded *every row's* JSON on *every search*.
 *    A full table scan with per-row JSON parsing, which does not survive real volume.
 * 4. **Dedup was application-only.** `(platform, externalId)` had no unique
 *    constraint, so two concurrent searches returning the same item could both pass
 *    the in-code check and insert duplicates.
 *
 * ## What this does
 *
 * - Adds a `searchText` column, populated at write time with the title plus the
 *   platform's body text, and indexes it with `pg_trgm`. That replaces the JSON scan
 *   with an index lookup while preserving substring-match recall.
 * - Adds the missing btree indexes for filtering and ordering.
 * - De-duplicates existing rows, then adds the unique index so the invariant is
 *   enforced by the database rather than hoped for.
 *
 * Idempotent throughout, so it is safe on an environment that already has some of it.
 */
export class IndexContentStreamsForSearch1784000000010 implements MigrationInterface {
  name = 'IndexContentStreamsForSearch1784000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Trigram support for indexed substring matching. Available on Neon.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    // --- searchText -------------------------------------------------------
    // A plain column rather than a generated one: the body text lives under a
    // different key per platform (description / message / caption / selftext), and a
    // GENERATED expression cannot reach into json flexibly enough without becoming
    // unreadable. Populated by the repository on write.
    await queryRunner.query(`
      ALTER TABLE "contentStreams"
      ADD COLUMN IF NOT EXISTS "searchText" text
    `);

    // Backfill from existing rows so already-stored content stays findable.
    // COALESCE across the known body-text keys; metaData is json, so ->> is safe on
    // a missing key (returns null) but not on a non-object, hence the guard.
    await queryRunner.query(`
      UPDATE "contentStreams"
      SET "searchText" = trim(
        COALESCE(title, '') || ' ' ||
        COALESCE(
          CASE WHEN json_typeof("metaData") = 'object' THEN
            COALESCE(
              "metaData"->>'description',
              "metaData"->>'message',
              "metaData"->>'caption',
              "metaData"->>'selftext',
              ''
            )
          ELSE '' END,
          ''
        )
      )
      WHERE "searchText" IS NULL
    `);

    // GIN + gin_trgm_ops is what makes ILIKE '%term%' index-assisted.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_content_streams_search_text_trgm"
      ON "contentStreams" USING gin ("searchText" gin_trgm_ops)
    `);

    // Title is still matched directly in some paths, and ranked higher than body text.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_content_streams_title_trgm"
      ON "contentStreams" USING gin (title gin_trgm_ops)
    `);

    // --- filtering and ordering -------------------------------------------
    // Composite, in the order queries use them: filter by platform, order by recency.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_content_streams_platform_refreshed"
      ON "contentStreams" (platform, "lastRefreshed" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_content_streams_type_subtype"
      ON "contentStreams" (type, "subType")
    `);

    // --- make dedup a real constraint -------------------------------------
    // Remove existing duplicates first, keeping the most recently refreshed row.
    // These are redundant copies of the same external item — the same YouTube video
    // returned by two different queries — so collapsing them loses nothing. The
    // ctid tiebreaker keeps this deterministic when lastRefreshed matches.
    const duplicates: Array<{ count: string }> = await queryRunner.query(`
      SELECT count(*)::text AS count FROM (
        SELECT platform, "externalId"
        FROM "contentStreams"
        GROUP BY platform, "externalId"
        HAVING count(*) > 1
      ) d
    `);

    if (Number(duplicates?.[0]?.count ?? 0) > 0) {
      await queryRunner.query(`
        DELETE FROM "contentStreams" cs
        USING (
          SELECT ctid,
                 row_number() OVER (
                   PARTITION BY platform, "externalId"
                   ORDER BY "lastRefreshed" DESC NULLS LAST, ctid DESC
                 ) AS rn
          FROM "contentStreams"
        ) ranked
        WHERE cs.ctid = ranked.ctid AND ranked.rn > 1
      `);
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_content_streams_platform_external_id"
      ON "contentStreams" (platform, "externalId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Indexes and the added column are reversible. The de-duplication is not — those
    // rows were redundant and are not recreated.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_content_streams_platform_external_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_content_streams_type_subtype"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_content_streams_platform_refreshed"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_content_streams_title_trgm"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_content_streams_search_text_trgm"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "searchText"`,
    );
  }
}
