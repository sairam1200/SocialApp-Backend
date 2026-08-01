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

    // ── Deep dive 5a: Which direction is inconsistency? ──
    const d5a = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE "searchText" IS NULL AND "searchVector" IS NOT NULL) AS text_null_vec_not,
        COUNT(*) FILTER (WHERE "searchText" IS NOT NULL AND "searchVector" IS NULL) AS text_not_vec_null
      FROM "contentStreams"
    `);
    console.log('\n[D5a] Inconsistency direction:');
    console.log(`  searchText NULL, searchVector NOT NULL: ${d5a.rows[0].text_null_vec_not}`);
    console.log(`  searchText NOT NULL, searchVector NULL: ${d5a.rows[0].text_not_vec_null}`);

    // ── Deep dive 5b: Of text_not_vec_null, how many have title (can backfill searchText)? ──
    const d5b = await client.query(`
      SELECT COUNT(*)::int AS backfillable
      FROM "contentStreams"
      WHERE "searchText" IS NOT NULL AND "searchVector" IS NULL AND "title" IS NOT NULL
    `);
    console.log(`\n[D5b] Backfillable (searchText exists + title exists, only searchVector missing): ${d5b.rows[0].backfillable}`);

    // ── Deep dive 5c: Remaining unvectorized ──
    const d5c = await client.query(`
      SELECT COUNT(*)::int AS remaining
      FROM "contentStreams"
      WHERE "searchVector" IS NULL
    `);
    console.log(`\n[D5c] Total missing searchVector: ${d5c.rows[0].remaining}`);

    // ── Deep dive 8: What metaData key holds publishedAt? ──
    const d8 = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE "metaData"->>'publishedAt' IS NOT NULL) AS dot_publishedAt,
        COUNT(*) FILTER (WHERE "metaData"->>'published_at' IS NOT NULL) AS dot_published_at,
        COUNT(*) FILTER (WHERE "metaData"->>'createdAt' IS NOT NULL) AS dot_createdAt,
        COUNT(*) FILTER (WHERE "metaData"->>'created_at' IS NOT NULL) AS dot_created_at,
        COUNT(*) FILTER (WHERE "metaData"->>'timestamp' IS NOT NULL) AS dot_timestamp,
        COUNT(*) FILTER (WHERE "metaData"->'engagement'->>'publishedAt' IS NOT NULL) AS engagement_publishedAt
      FROM "contentStreams"
    `);
    console.log('\n[D8] metaData timestamp key presence:');
    for (const [k, v] of Object.entries(d8.rows[0])) {
      console.log(`  ${k}: ${v}`);
    }

    // ── Deep dive 8b: Sample records with unextracted publishedAt ──
    const d8b = await client.query(`
      SELECT "id", "platform", "type", "publishedAt", "metaData"->>'publishedAt' AS meta_pa,
             "metaData"->>'createdAt' AS meta_ca, LEFT("metaData"::text, 200) AS meta_snippet
      FROM "contentStreams"
      WHERE "publishedAt" IS NULL AND "metaData" IS NOT NULL
      LIMIT 5
    `);
    console.log('\n[D8b] Samples with publishedAt NULL (metaData available):');
    for (const r of d8b.rows) {
      console.log(`  ${r.id.substring(0, 8)}... | ${r.platform} | ${r.type} | meta.publishedAt=${r.meta_pa} | meta.createdAt=${r.meta_ca}`);
      console.log(`    metaSnippet: ${r.meta_snippet.substring(0, 150)}`);
    }

    // ── Deep dive 9: Which platforms have missing engagementScore? ──
    const d9 = await client.query(`
      SELECT "platform", COUNT(*)::int AS cnt
      FROM "contentStreams"
      WHERE "engagementScore" IS NULL
      AND "metaData" IS NOT NULL
      AND ("metaData"->>'viewCount' IS NOT NULL OR "metaData"->>'likeCount' IS NOT NULL)
      GROUP BY "platform"
      ORDER BY cnt DESC
    `);
    console.log('\n[D9] Missing engagementScore by platform:');
    for (const r of d9.rows) {
      console.log(`  ${r.platform}: ${r.cnt}`);
    }

    // ── Deep dive 15: What type are the unsearchable records? ──
    const d15 = await client.query(`
      SELECT "platform", "type", COUNT(*)::int AS cnt
      FROM "contentStreams"
      WHERE ("searchText" IS NULL OR "searchText" = '' OR "searchText" ~ '^\\s*$')
      OR ("title" IS NULL OR "title" = '')
      GROUP BY "platform", "type"
      ORDER BY cnt DESC
    `);
    console.log('\n[D15] Unsearchable records (no searchText/title) by platform + type:');
    for (const r of d15.rows) {
      console.log(`  ${r.platform} / ${r.type}: ${r.cnt}`);
    }

    // ── Deep dive 15b: Sample unsearchable records ──
    const d15b = await client.query(`
      SELECT "id", "platform", "type", "title", LEFT("searchText", 50) AS st,
             "externalId", "subType"
      FROM "contentStreams"
      WHERE ("searchText" IS NULL OR "searchText" = '' OR "searchText" ~ '^\\s*$')
      OR ("title" IS NULL OR "title" = '')
      LIMIT 10
    `);
    console.log('\n[D15b] Sample unsearchable records:');
    for (const r of d15b.rows) {
      console.log(`  ${r.id.substring(0, 8)}... | ${r.platform} | ${r.type} | "${r.title}" | searchText="${r.st}" | extId=${r.externalId}`);
    }

    // ── Deep dive 19b: The "instagram video" spam ──
    const d19b = await client.query(`
      SELECT "id", "platform", "externalId", "type", "subType", "title", "metaData"->>'description' AS descr
      FROM "contentStreams"
      WHERE LOWER(TRIM("title")) = 'instagram  video'
      LIMIT 5
    `);
    console.log('\n[D19b] Samples of "instagram  video" spam:');
    for (const r of d19b.rows) {
      console.log(`  ${r.id.substring(0, 8)}... | platform=${r.platform} | type=${r.type} | subType=${r.subType} | extId=${r.externalId} | desc="${(r.descr || '').substring(0, 80)}"`);
    }

    // ── Deep dive 20: Provider consistency details ──
    const d20 = await client.query(`
      SELECT "id", "platform", "type", "externalId", "title",
             "metaData"->>'channelId' AS channelId,
             "metaData"->>'videoId' AS videoId,
             "metaData"->>'pageId' AS pageId,
             "metaData"->>'postId' AS postId,
             "metaData"->>'mediaId' AS mediaId,
             "metaData"->>'accountId' AS accountId
      FROM "contentStreams"
      WHERE
        ("platform" = 'youtube' AND "metaData"->>'channelId' IS NULL AND "metaData"->>'videoId' IS NULL)
        OR ("platform" = 'facebook' AND "metaData"->>'postId' IS NULL AND "metaData"->>'pageId' IS NULL)
        OR ("platform" = 'instagram' AND "metaData"->>'mediaId' IS NULL AND "metaData"->>'accountId' IS NULL)
      LIMIT 10
    `);
    console.log('\n[D20] Samples missing platform-specific IDs:');
    for (const r of d20.rows) {
      console.log(`  ${r.id.substring(0, 8)}... | ${r.platform} | ${r.type} | extId=${r.externalId} | "${r.title}" | chId=${r.channelid || '-'} | vId=${r.videoid || '-'} | paId=${r.pageid || '-'} | poId=${r.postid || '-'} | meId=${r.mediaid || '-'} | acId=${r.accountid || '-'}`);
    }

    // ── Deep dive: Platform distribution ──
    const platDist = await client.query(`
      SELECT "platform", COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE "searchVector" IS NOT NULL) AS indexed
      FROM "contentStreams"
      GROUP BY "platform"
      ORDER BY cnt DESC
    `);
    console.log('\n[Platform distribution]:');
    for (const r of platDist.rows) {
      console.log(`  ${r.platform}: ${r.cnt} total, ${r.indexed} indexed`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
