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
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const [k, ...v] = line.split('=');
    const key = k.trim();
    let val = v.join('=').trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key === 'DATABASE_URL') process.env.DATABASE_URL = val;
  }
}
loadEnv();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const c = await pool.connect();
await c.query('SET search_path TO public');

console.log('=== POST-REPAIR AUDIT ===\n');

// Engagement: what's missing and why
const eng = await c.query(`
  SELECT
    COUNT(*)::int AS total_missing,
    COUNT(*) FILTER (WHERE "metaData"->>'viewCount' IS NOT NULL) AS has_viewcount,
    COUNT(*) FILTER (WHERE "metaData"->>'likeCount' IS NOT NULL) AS has_likecount,
    COUNT(*) FILTER (WHERE "metaData"->>'commentCount' IS NOT NULL) AS has_commentcount,
    COUNT(*) FILTER (WHERE "metaData"->'engagement'->>'viewCount' IS NOT NULL) AS has_nested_viewcount,
    COUNT(*) FILTER (WHERE "metaData"->'engagement'->>'likeCount' IS NOT NULL) AS has_nested_likecount
  FROM "contentStreams"
  WHERE "engagementScore" IS NULL
`);
console.log('EngagementScore still NULL (364):');
console.log(`  top-level viewCount: ${eng.rows[0].has_viewcount}`);
console.log(`  top-level likeCount: ${eng.rows[0].has_likecount}`);
console.log(`  top-level commentCount: ${eng.rows[0].has_commentcount}`);
console.log(`  nested engagement.viewCount: ${eng.rows[0].has_nested_viewcount}`);
console.log(`  nested engagement.likeCount: ${eng.rows[0].has_nested_likecount}`);

// Check nested engagement path
const eng2 = await c.query(`
  SELECT "platform", COUNT(*)::int AS cnt
  FROM "contentStreams"
  WHERE "engagementScore" IS NULL
  GROUP BY "platform"
  ORDER BY cnt DESC
`);
console.log('\nMissing engagementScore by platform:');
for (const r of eng2.rows) console.log(`  ${r.platform}: ${r.cnt}`);

// Check if nested engagement data exists
const eng3 = await c.query(`
  SELECT "platform", "metaData"->'engagement' AS eng
  FROM "contentStreams"
  WHERE "engagementScore" IS NULL AND "metaData"->'engagement' IS NOT NULL
  LIMIT 5
`);
console.log('\nSample nested engagement data:');
for (const r of eng3.rows) {
  console.log(`  ${r.platform}: ${JSON.stringify(r.eng)}`);
}

// Check remaining missing publishedAt
const pub = await c.query(`
  SELECT "id", "platform", "type", "title"
  FROM "contentStreams"
  WHERE "publishedAt" IS NULL
  LIMIT 10
`);
console.log(`\nStill missing publishedAt (${pub.rows.length} sampled):`);
for (const r of pub.rows) {
  console.log(`  ${r.id.substring(0,8)}... | ${r.platform} | ${r.type} | "${r.title?.substring(0,40)}"`);
}

// Platform distribution
const dist = await c.query(`
  SELECT "platform", COUNT(*)::int AS cnt,
         COUNT(*) FILTER (WHERE "searchVector" IS NOT NULL) AS searchable,
         COUNT(*) FILTER (WHERE "publishedAt" IS NOT NULL) AS has_date,
         COUNT(*) FILTER (WHERE "engagementScore" IS NOT NULL) AS has_engagement
  FROM "contentStreams"
  GROUP BY "platform"
  ORDER BY cnt DESC
`);
console.log('\nPlatform distribution post-repair:');
for (const r of dist.rows) {
  console.log(`  ${r.platform}: ${r.cnt} total, ${r.searchable} searchable, ${r.has_date} dated, ${r.has_engagement} scored`);
}

// Check the Instagram "spam" records still exist
const spam = await c.query(`
  SELECT COUNT(*)::int AS cnt FROM "contentStreams"
  WHERE LOWER(TRIM("title")) = 'instagram  video'
`);
console.log(`\nInstagram "spam" records (title "instagram  video"): ${spam.rows[0].cnt}`);

await c.release();
await pool.end();
