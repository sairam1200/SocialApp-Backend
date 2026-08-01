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
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in .env.development');
  process.exit(1);
}

console.log('='.repeat(80));
console.log('CONTENTSTREAMS SEARCH DATA INTEGRITY AUDIT');
console.log('='.repeat(80));
console.log(`Database: ${DATABASE_URL.replace(/\/\/.*@/, '//***:***@')}`);
console.log(`Started: ${new Date().toISOString()}`);
console.log('');

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

async function run() {
  const client = await pool.connect();
  try {
    await client.query('SET search_path TO public');

    // ── Row count baseline ──
    const { rows: [totalRow] } = await client.query('SELECT COUNT(*)::int AS total FROM "contentStreams"');
    console.log(`\nTotal rows in contentStreams: ${totalRow.total}`);
    console.log('');

    const results = [];

    // ── Check 1: Invalid type values ──
    {
      const { rows } = await client.query(`
        SELECT "type", COUNT(*)::int AS cnt
        FROM "contentStreams"
        WHERE "type" NOT IN ('Profile', 'Content', 'Community')
        GROUP BY "type"
        ORDER BY cnt DESC
      `);
      results.push({ id: 1, name: 'Invalid type values (not in Profile/Content/Community)', rows, severity: rows.length > 0 ? 'HIGH' : 'OK', detail: rows.map(r => `${r.type}: ${r.cnt}`).join(', ') || 'none found' });
    }

    // ── Check 2: platform IS NULL or empty ──
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "platform" IS NULL OR "platform" = ''`);
      results.push({ id: 2, name: 'platform IS NULL or empty', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'HIGH' : 'OK' });
    }

    // ── Check 3: externalId IS NULL or empty ──
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "externalId" IS NULL OR "externalId" = ''`);
      results.push({ id: 3, name: 'externalId IS NULL or empty', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'HIGH' : 'OK' });
    }

    // ── Check 4: Both searchText AND searchVector NULL (completely unsearchable) ──
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "searchText" IS NULL AND "searchVector" IS NULL`);
      results.push({ id: 4, name: 'Both searchText AND searchVector NULL (unsearchable)', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'HIGH' : 'OK' });
    }

    // ── Check 5: Inconsistent search fields (one NULL, other not) ──
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE ("searchText" IS NULL AND "searchVector" IS NOT NULL) OR ("searchText" IS NOT NULL AND "searchVector" IS NULL)`);
      results.push({ id: 5, name: 'Inconsistent search fields (one NULL, other not)', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'MEDIUM' : 'OK' });
    }

    // ── Check 6: title IS NULL ──
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "title" IS NULL`);
      results.push({ id: 6, name: 'title IS NULL', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'HIGH' : 'OK' });
    }

    // ── Check 7: searchVector NULL when GIN index exists ──
    // (This is informational — NULLs are allowed, just unindexed)
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "searchVector" IS NULL`);
      results.push({ id: 7, name: 'searchVector IS NULL (not covered by GIN index)', rows: [], count: r.cnt, severity: r.cnt > totalRow.total * 0.5 ? 'HIGH' : 'INFO' });
    }

    // ── Check 8: publishedAt NULL but metaData has publishedAt ──
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "publishedAt" IS NULL AND "metaData" IS NOT NULL AND "metaData"->>'publishedAt' IS NOT NULL`);
      results.push({ id: 8, name: 'publishedAt IS NULL but metaData->publishedAt exists', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'MEDIUM' : 'OK' });
    }

    // ── Check 9: engagementScore NULL but engagement metrics exist ──
    {
      const { rows: [r] } = await client.query(`
        SELECT COUNT(*)::int AS cnt FROM "contentStreams"
        WHERE "engagementScore" IS NULL
        AND "metaData" IS NOT NULL
        AND (
          ("metaData"->>'viewCount') IS NOT NULL
          OR ("metaData"->>'likeCount') IS NOT NULL
          OR ("metaData"->>'commentCount') IS NOT NULL
          OR ("metaData"->'engagement'->>'viewCount') IS NOT NULL
          OR ("metaData"->'engagement'->>'likeCount') IS NOT NULL
        )
      `);
      results.push({ id: 9, name: 'engagementScore NULL but engagement data exists in metaData', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'MEDIUM' : 'OK' });
    }

    // ── Check 10: Duplicate (platform, externalId) ──
    {
      const { rows } = await client.query(`
        SELECT "platform", "externalId", COUNT(*)::int AS cnt
        FROM "contentStreams"
        GROUP BY "platform", "externalId"
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC
        LIMIT 20
      `);
      results.push({ id: 10, name: 'Duplicate (platform, externalId) pairs', rows, count: rows.length, severity: rows.length > 0 ? 'HIGH' : 'OK', detail: rows.length > 0 ? rows.slice(0, 5).map(r => `${r.platform}/${r.externalId}: ${r.cnt}x`).join(', ') : 'none' });
    }

    // ── Check 11: metaData IS NULL ──
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "metaData" IS NULL`);
      results.push({ id: 11, name: 'metaData IS NULL', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'MEDIUM' : 'OK' });
    }

    // ── Check 12: lastRefreshed very old (>90 days) ──
    {
      const { rows: [r] } = await client.query(`SELECT COUNT(*)::int AS cnt FROM "contentStreams" WHERE "lastRefreshed" < NOW() - INTERVAL '90 days'`);
      results.push({ id: 12, name: 'lastRefreshed > 90 days old (stale)', rows: [], count: r.cnt, severity: r.cnt > 0.2 * totalRow.total ? 'MEDIUM' : 'INFO' });
    }

    // ── Check 13: Profile/Channel/Community types without related content ──
    {
      const { rows: [r] } = await client.query(`
        SELECT COUNT(*)::int AS cnt FROM "contentStreams" p
        WHERE p."type" IN ('Profile', 'Community')
        AND NOT EXISTS (
          SELECT 1 FROM "contentStreams" c
          WHERE c."platform" = p."platform"
          AND c."type" = 'Content'
        )
      `);
      results.push({ id: 13, name: 'Profile/Community with no associated Content on same platform', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'LOW' : 'OK' });
    }

    // ── Check 14: Index existence ──
    {
      const { rows } = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'contentStreams'
        ORDER BY indexname
      `);
      results.push({ id: 14, name: 'Indexes on contentStreams', rows, count: rows.length, severity: rows.length < 6 ? 'HIGH' : 'OK', detail: rows.map(r => r.indexname).join(', ') });
    }

    // ── Check 15: Invalid searchable flag ──
    {
      // We don't have a "searchable" column, so we check rows that WOULD be searchable
      // vs rows that have no searchable content. The "searchable" flag doesn't exist
      // in the schema, so we flag rows with empty/no search metadata that would be
      // returned as empty/invalid results.
      const { rows: [r] } = await client.query(`
        SELECT COUNT(*)::int AS cnt FROM "contentStreams"
        WHERE ("searchText" IS NULL OR "searchText" = '' OR "searchText" ~ '^\\s*$')
        OR ("title" IS NULL OR "title" = '')
      `);
      results.push({ id: 15, name: 'Records returned but no searchable content (empty title or searchText)', rows: [], count: r.cnt, severity: r.cnt > 0 ? 'HIGH' : 'OK' });
    }

    // ── Check 16: Response serialization — platform or type would be undefined ──
    {
      const { rows } = await client.query(`
        SELECT COUNT(*)::int AS cnt,
               COUNT(*) FILTER (WHERE "platform" IS NULL OR "platform" = '') AS null_platform,
               COUNT(*) FILTER (WHERE "type" IS NULL) AS null_type,
               COUNT(*) FILTER (WHERE "externalId" IS NULL OR "externalId" = '') AS null_externalid
        FROM "contentStreams"
      `);
      const problemCount = parseInt(rows[0].null_platform) + parseInt(rows[0].null_type);
      results.push({ id: 16, name: 'Response serialization — would produce undefined platform/type', count: problemCount, severity: problemCount > 0 ? 'CRITICAL' : 'OK', detail: `null_platform=${rows[0].null_platform}, null_type=${rows[0].null_type}, null_externalId=${rows[0].null_externalid}`, rows: rows });
    }

    // ── Check 17: Ranking integrity — negative, invalid, future dates ──
    {
      const { rows: [r] } = await client.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "engagementScore" < 0) AS negative_score,
          COUNT(*) FILTER (WHERE "publishedAt" > NOW() + INTERVAL '1 day') AS future_date,
          COUNT(*) FILTER (WHERE "publishedAt" < '1970-01-01' OR "publishedAt" > '2100-01-01') AS impossible_date
        FROM "contentStreams"
      `);
      const problems = parseInt(r.negative_score) + parseInt(r.future_date) + parseInt(r.impossible_date);
      results.push({ id: 17, name: 'Ranking integrity issues', count: problems, severity: problems > 0 ? 'HIGH' : 'OK', detail: `negative_engagementScore=${r.negative_score}, future_publishedAt=${r.future_date}, impossible_date=${r.impossible_date}`, rows: [r] });
    }

    // ── Check 18: Broken normalization (duplicate by case/whitespace) ──
    {
      const { rows } = await client.query(`
        SELECT LOWER(TRIM("externalId")) AS norm_id, COUNT(DISTINCT "externalId")::int AS variants, COUNT(*)::int AS total_cnt
        FROM "contentStreams"
        GROUP BY LOWER(TRIM("externalId"))
        HAVING COUNT(DISTINCT "externalId") > 1 OR COUNT(*) > 1
        ORDER BY total_cnt DESC
        LIMIT 20
      `);
      const normalizationIssues = rows.filter(r => r.variants > 1);
      results.push({ id: 18, name: 'Broken normalization (case/whitespace variants in externalId)', count: normalizationIssues.length, severity: normalizationIssues.length > 0 ? 'MEDIUM' : 'OK', detail: normalizationIssues.length > 0 ? normalizationIssues.slice(0, 5).map(r => `"${r.norm_id}": ${r.variants} variants, ${r.total_cnt} total`).join('; ') : 'none', rows: normalizationIssues });
    }

    // ── Check 19: Search text quality ──
    {
      const { rows: [r] } = await client.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "searchText" IS NOT NULL AND "searchText" ~ '^\\s*$') AS whitespace_only,
          COUNT(*) FILTER (WHERE "searchText" IS NOT NULL AND LENGTH("searchText") < 10 AND "searchText" !~ '^\\s*$') AS too_short,
          COUNT(*) FILTER (WHERE "searchVector" IS NOT NULL AND ("searchText" IS NULL OR "searchText" = '' OR "searchText" ~ '^\\s*$')) AS vector_from_empty
        FROM "contentStreams"
      `);
      const qualityIssues = parseInt(r.whitespace_only) + parseInt(r.too_short) + parseInt(r.vector_from_empty);
      results.push({ id: 19, name: 'Search text quality issues', count: qualityIssues, severity: qualityIssues > 0 ? 'MEDIUM' : 'OK', detail: `whitespace_only=${r.whitespace_only}, too_short(<10 chars)=${r.too_short}, vector_from_empty_text=${r.vector_from_empty}`, rows: [r] });
    }

    // ── Check 19b: Title duplication (spam detection) ──
    {
      const { rows } = await client.query(`
        SELECT LOWER(TRIM("title")) AS norm_title, COUNT(*)::int AS cnt
        FROM "contentStreams"
        WHERE "title" IS NOT NULL AND "title" != ''
        GROUP BY LOWER(TRIM("title"))
        HAVING COUNT(*) > 10
        ORDER BY cnt DESC
        LIMIT 10
      `);
      results.push({ id: '19b', name: 'Title duplication (potential spam — 10+ identical titles)', count: rows.length, severity: rows.length > 0 ? 'MEDIUM' : 'OK', detail: rows.map(r => `"${r.norm_title.substring(0, 50)}": ${r.cnt}x`).join('; ') || 'none', rows });
    }

    // ── Check 20: Provider consistency (platform-specific field validation) ──
    {
      const { rows } = await client.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE "platform" = 'youtube' AND "metaData" IS NOT NULL AND "metaData"->>'channelId' IS NULL AND "metaData"->>'videoId' IS NULL) AS youtube_missing_ids,
          COUNT(*) FILTER (WHERE "platform" = 'youtube' AND "type" = 'Profile' AND "metaData" IS NOT NULL AND "metaData"->>'channelId' IS NULL) AS youtube_profile_missing_channelid,
          COUNT(*) FILTER (WHERE "platform" = 'facebook' AND "metaData" IS NOT NULL AND "metaData"->>'postId' IS NULL AND "metaData"->>'pageId' IS NULL) AS facebook_missing_ids,
          COUNT(*) FILTER (WHERE "platform" = 'instagram' AND "metaData" IS NOT NULL AND "metaData"->>'mediaId' IS NULL AND "metaData"->>'accountId' IS NULL) AS instagram_missing_ids
        FROM "contentStreams"
      `);
      const providerIssues = parseInt(rows[0].youtube_missing_ids) + parseInt(rows[0].youtube_profile_missing_channelid) + parseInt(rows[0].facebook_missing_ids) + parseInt(rows[0].instagram_missing_ids);
      results.push({ id: 20, name: 'Provider consistency — missing platform-specific IDs', count: providerIssues, severity: providerIssues > 0 ? 'MEDIUM' : 'OK', detail: `youtube_no_videoId/channelId=${rows[0].youtube_missing_ids}, youtube_profile_no_channelId=${rows[0].youtube_profile_missing_channelid}, facebook_no_ids=${rows[0].facebook_missing_ids}, instagram_no_ids=${rows[0].instagram_missing_ids}`, rows });
    }

    // ── Print Report ──
    console.log('─'.repeat(80));
    console.log('AUDIT RESULTS');
    console.log('─'.repeat(80));
    console.log('');

    for (const r of results) {
      const severityTag = r.severity === 'OK' ? '  OK' : ` ${r.severity}`;
      console.log(`${severityTag}  #${String(r.id).padEnd(3)} ${r.name}`);
      if (r.count !== undefined) {
        console.log(`       Count: ${r.count}`);
      }
      if (r.detail) {
        console.log(`       Detail: ${r.detail}`);
      }
      if (r.rows && r.rows.length > 0 && !r.detail) {
        console.log(`       Samples: ${JSON.stringify(r.rows.slice(0, 3))}`);
      }
      console.log('');
    }

    // ── Summary ──
    const critical = results.filter(r => r.severity === 'CRITICAL').length;
    const high = results.filter(r => r.severity === 'HIGH').length;
    const medium = results.filter(r => r.severity === 'MEDIUM').length;
    const low = results.filter(r => r.severity === 'LOW').length;
    const ok = results.filter(r => r.severity === 'OK').length;

    console.log('─'.repeat(80));
    console.log('SUMMARY');
    console.log('─'.repeat(80));
    console.log(`  CRITICAL: ${critical}`);
    console.log(`  HIGH:     ${high}`);
    console.log(`  MEDIUM:   ${medium}`);
    console.log(`  LOW:      ${low}`);
    console.log(`  OK:       ${ok}`);
    console.log('');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
