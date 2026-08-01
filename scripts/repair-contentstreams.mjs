import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.development');
  if (!existsSync(envPath)) {
    console.error('.env.development not found');
    process.exit(1);
  }
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key === 'DATABASE_URL') {
      process.env.DATABASE_URL = val;
    }
  }
}

loadEnv();
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not found'); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO public');

    console.log('='.repeat(80));
    console.log('CONTENTSTREAMS SEARCH DATA REPAIR');
    console.log('='.repeat(80));

    // ── Step 1: Backfill searchText from title for records with NULL/empty searchText ──
    console.log('\n[Step 1] Backfilling searchText from title + metaData...');
    const s1 = await client.query(`
      UPDATE "contentStreams"
      SET "searchText" = LOWER(
        COALESCE("title", '') || ' ' ||
        COALESCE("metaData"->>'description', '') || ' ' ||
        COALESCE("metaData"->>'channelTitle', '') || ' ' ||
        COALESCE("metaData"->>'creatorName', '') || ' ' ||
        COALESCE("metaData"->>'author', '')
      )
      WHERE "searchText" IS NULL OR "searchText" = '' OR "searchText" ~ '^\\s*$'
    `);
    console.log(`  Updated: ${s1.rowCount} rows (searchText backfilled)`);

    // ── Step 2: Force trigger for the 46 records with searchVector NULL ──
    //    The trigger fires on UPDATE OF "searchText", so we set it to itself
    console.log('\n[Step 2] Forcing searchVector rebuild for records missing it...');
    const s2 = await client.query(`
      UPDATE "contentStreams"
      SET "searchText" = "searchText"
      WHERE "searchVector" IS NULL AND "searchText" IS NOT NULL AND "searchText" != ''
    `);
    console.log(`  Updated: ${s2.rowCount} rows (searchVector trigger fired)`);

    // ── Step 3: Backfill publishedAt from metaData->>'publishedAt' ──
    console.log('\n[Step 3] Backfilling publishedAt from metaData->publishedAt...');
    const s3 = await client.query(`
      UPDATE "contentStreams"
      SET "publishedAt" = ("metaData"->>'publishedAt')::TIMESTAMP
      WHERE "publishedAt" IS NULL
      AND "metaData" IS NOT NULL
      AND "metaData"->>'publishedAt' IS NOT NULL
    `);
    console.log(`  Updated: ${s3.rowCount} rows (publishedAt backfilled)`);

    // ── Step 3b: Also try metaData->>'createdAt' for the remaining 6 ──
    console.log('\n[Step 3b] Trying metaData->createdAt fallback...');
    const s3b = await client.query(`
      UPDATE "contentStreams"
      SET "publishedAt" = ("metaData"->>'createdAt')::TIMESTAMP
      WHERE "publishedAt" IS NULL
      AND "metaData" IS NOT NULL
      AND "metaData"->>'createdAt' IS NOT NULL
    `);
    console.log(`  Updated: ${s3b.rowCount} rows (publishedAt from createdAt)`);

    // ── Step 3c: Try metaData->>'timestamp' fallback ──
    console.log('\n[Step 3c] Trying metaData->timestamp fallback...');
    const s3c = await client.query(`
      UPDATE "contentStreams"
      SET "publishedAt" = ("metaData"->>'timestamp')::TIMESTAMP
      WHERE "publishedAt" IS NULL
      AND "metaData" IS NOT NULL
      AND "metaData"->>'timestamp' IS NOT NULL
    `);
    console.log(`  Updated: ${s3c.rowCount} rows (publishedAt from timestamp)`);

    // ── Step 4: Backfill engagementScore ──
    console.log('\n[Step 4] Backfilling engagementScore...');
    const s4 = await client.query(`
      UPDATE "contentStreams"
      SET "engagementScore" = LEAST(
        COALESCE(("metaData"->>'viewCount')::FLOAT / 10000000, 0) * 0.4 +
        COALESCE(("metaData"->>'likeCount')::FLOAT / 1000000, 0) * 0.3 +
        COALESCE(("metaData"->>'commentCount')::FLOAT / 100000, 0) * 0.2 +
        COALESCE(("metaData"->>'subscriberCount')::FLOAT / 10000000, 0) * 0.1,
        1.0
      )
      WHERE "engagementScore" IS NULL
      AND "metaData" IS NOT NULL
      AND (
        ("metaData"->>'viewCount') IS NOT NULL
        OR ("metaData"->>'likeCount') IS NOT NULL
        OR ("metaData"->>'commentCount') IS NOT NULL
      )
    `);
    console.log(`  Updated: ${s4.rowCount} rows (engagementScore backfilled)`);

    // ── Step 5: Check Instagram/Facebook records for missing meta enrichment ──
    //    For Instagram records with placeholder title, we can't do much without source API.
    //    Flag them for review.

    // ── Verify results ──
    console.log('\n' + '─'.repeat(80));
    console.log('VERIFICATION');
    console.log('─'.repeat(80));

    const vRows = await client.query('SELECT COUNT(*)::int AS total FROM "contentStreams"');
    console.log(`\nTotal rows: ${vRows.rows[0].total}`);

    const v1 = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "searchVector" IS NOT NULL`);
    console.log(`With searchVector: ${v1.rows[0].cnt}`);

    const v2 = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "publishedAt" IS NULL`);
    console.log(`Still missing publishedAt: ${v2.rows[0].cnt}`);

    const v3 = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "engagementScore" IS NULL`);
    console.log(`Still missing engagementScore: ${v3.rows[0].cnt}`);

    const v4 = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "searchText" IS NULL OR "searchText" = ''`);
    console.log(`Still empty searchText: ${v4.rows[0].cnt}`);

    const v5 = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "searchVector" IS NULL AND ("searchText" IS NOT NULL AND "searchText" != '')`);
    console.log(`searchVector NULL but searchText exists: ${v5.rows[0].cnt}`);

    console.log('\nRepair complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error('Repair failed:', err); process.exit(1); });
