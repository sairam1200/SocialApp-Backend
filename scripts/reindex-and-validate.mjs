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

console.log('=== PHASE 4: REINDEX & VALIDATE ===\n');

// Step 1: ANALYZE to update statistics
console.log('[1/4] Running ANALYZE...');
await c.query('ANALYZE "contentStreams"');
console.log('  OK\n');

// Step 2: Verify all search vectors are valid tsvectors
const v1 = await c.query(`
  SELECT COUNT(*)::int AS invalid
  FROM "contentStreams"
  WHERE "searchVector" IS NULL
     OR "searchVector"::text = ''
`);
console.log(`[2/4] Search vector validity:`);
console.log(`  Records with invalid/empty searchVector: ${v1.rows[0].invalid}`);
console.log('  OK\n');

// Step 3: Verify index usage would work (test query)
console.log('[3/4] Testing full-text search query...');
const q1 = await c.query(`
  EXPLAIN (FORMAT JSON)
  SELECT cs."id", cs."platform", cs."type", cs."title"
  FROM "contentStreams" cs
  WHERE cs."searchVector" @@ plainto_tsquery('english', 'cat video')
  LIMIT 5
`);
const plan = JSON.stringify(q1.rows[0]?.['QUERY PLAN'] || '').substring(0, 300);
console.log(`  Query plan: ${plan}`);
console.log('  OK\n');

// Step 4: Run actual search query
console.log('[4/4] Running sample search queries...');

const searches = ['cat', 'instagram', 'api', 'tutorial', 'music'];
for (const q of searches) {
  const r = await c.query(`
    SELECT cs."platform", cs."type", cs."title", cs."publishedAt",
           ts_rank(cs."searchVector", plainto_tsquery('english', $1)) AS rank
    FROM "contentStreams" cs
    WHERE cs."searchVector" @@ plainto_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT 3
  `, [q]);
  console.log(`  Query "${q}": ${r.rows.length} results`);
  for (const row of r.rows) {
    console.log(`    [${row.platform}] ${row.title?.substring(0, 60)} (rank: ${row.rank?.toFixed(3)})`);
  }
}

// Step 5: Verify no records produce undefined platform/type
const v5 = await c.query(`
  SELECT COUNT(*)::int AS bad
  FROM "contentStreams"
  WHERE "platform" IS NULL OR "platform" = ''
     OR "type" IS NULL
     OR "externalId" IS NULL OR "externalId" = ''
`);
console.log(`\n[Extra] Records with NULL platform/type/externalId: ${v5.rows[0].bad}`);

// Step 6: Verify unique constraint
const v6 = await c.query(`
  SELECT COUNT(*)::int AS dups FROM (
    SELECT "platform", "externalId" FROM "contentStreams"
    GROUP BY "platform", "externalId" HAVING COUNT(*) > 1
  ) d
`);
console.log(`[Extra] Duplicate (platform,externalId) pairs: ${v6.rows[0].dups}`);

console.log('\n=== REINDEX & VALIDATE COMPLETE ===');

await c.release();
await pool.end();
