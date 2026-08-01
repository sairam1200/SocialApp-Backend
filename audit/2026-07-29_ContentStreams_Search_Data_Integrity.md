# ContentStreams Search Data Integrity Audit

**Date:** 2026-07-29
**Table:** `contentStreams`
**Total rows:** 395
**Database:** Neon (production)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 1  |
| MEDIUM   | 6  |
| LOW      | 0  |
| OK       | 12 |

---

## Findings

### #1 — Invalid type values: OK
No records with `type` outside `('Profile', 'Content', 'Community')`.

### #2 — `platform` IS NULL or empty: OK
All 395 records have a non-empty platform.

### #3 — `externalId` IS NULL or empty: OK
All records have an externalId.

### #4 — Both `searchText` AND `searchVector` NULL: OK
Zero completely unsearchable records.

### #5 — Inconsistent search fields: **MEDIUM** — 181 records
| Direction | Count |
|-----------|-------|
| `searchText` NULL, `searchVector` NOT NULL | 135 |
| `searchText` NOT NULL, `searchVector` NULL | 46 |

Root cause for `searchText=NULL, searchVector=NOT NULL`:
The trigger function (`update_contentstreams_searchvector()`) runs `to_tsvector('english', COALESCE(NEW."searchText", ''))`. When `searchText` is NULL, `COALESCE` produces `''`, and `to_tsvector('english', '')` returns an **empty tsvector** (non-NULL). So the trigger stores a non-NULL but empty searchVector even when searchText is null/empty.

The 46 records with `searchText NOT NULL, searchVector NULL` were likely inserted before the trigger existed, or the trigger was not applied to existing rows.

**Classification:** Repair (backfill searchText, then rebuild searchVector via trigger)

### #6 — `title` IS NULL: OK
All records have a title.

### #7 — `searchVector` IS NULL (not indexable): INFO — 46 records
These 46 records are the same as the `text_not_vec_null` group from #5. They are not covered by the GIN index for full-text search.

**Classification:** Repair (backfill searchVector)

### #8 — `publishedAt` NULL with `metaData->publishedAt` exists: **MEDIUM** — 352 records
352 of 395 records have `publishedAt = NULL` but `metaData->>'publishedAt'` contains a valid timestamp. This is a massive gap. The backfill SQL from `09_ContentStreams_Extension.md` section 5.2 was apparently never run.

**Classification:** Repair (backfill from metaData)

### #9 — `engagementScore` NULL with engagement metrics present: **MEDIUM** — 31 records
31 records have `engagementScore = NULL` but contain view/like/comment counts in `metaData`. The engagement score can be computed.

Breakdown by platform: instagram=28, youtube=3.

**Classification:** Repair (backfill engagementScore)

### #10 — Duplicate `(platform, externalId)` pairs: OK
Zero duplicates — unique constraint is working.

### #11 — `metaData` IS NULL: OK
All records have metadata.

### #12 — `lastRefreshed` > 90 days stale: OK
All records are within 90 days.

### #13 — Profile/Community with no Content: OK
No orphaned profiles found.

### #14 — Indexes: OK — 12 indexes found
Expected 6 search indexes all exist. Additionally, 6 legacy indexes are present (PK, platform+refreshed, title_trgm, type+subtype, unique constraint, another search_text_trgm).

Search indexes present:
- `IDX_contentStreams_searchVector` (GIN)
- `IDX_contentStreams_searchText_trgm` (GIN)
- `IDX_contentStreams_publishedAt` (B-tree)
- `IDX_contentStreams_engagementScore` (B-tree)
- `IDX_contentStreams_creatorId` (B-tree)
- `IDX_contentStreams_search_partial` (partial on platform,type WHERE searchVector IS NOT NULL)

### #15 — Records returned but no searchable content: **HIGH** — 135 records
135 records have `searchText IS NULL` (the same 135 from #5). They DO have valid titles, but `searchText` was never generated for them. Even though they have titles, the PostgreSQL query uses `ILike` on title as a fallback, so they might still appear in results — but the full-text search (tsvector) and trigram similarity cannot match them.

Breakdown: youtube/Content=130, youtube/Profile=5.

**Classification:** Repair (backfill searchText from title + metaData)

### #16 — Response serialization: OK
Zero records with NULL platform, type, or externalId — no "undefined" groups.

### #17 — Ranking integrity: OK
Zero negative engagementScore, zero future or impossible dates.

### #18 — Broken normalization (case/whitespace externalId): OK
No case or whitespace variants found for the same externalId.

### #19 — Search text quality: **MEDIUM** — 144 issues
| Issue | Count |
|-------|-------|
| Whitespace-only searchText | 0 |
| searchText too short (<10 chars) | 9 |
| searchVector generated from empty text | 135 |

The 135 with "vector from empty text" are the same records from #5 where `searchText=NULL` and the trigger generated an empty tsvector.

**Classification:** Repair (backfill searchText, vector auto-updates via trigger)

### #19b — Title duplication (potential spam): **MEDIUM** — 1 group
Title `"instagram  video"` (with double space) appears **19 times**. These are Instagram Content records with subType=VIDEO, no description, and no mediaId/accountId in metaData. They appear to be failed imports where the title was set to a placeholder and never enriched.

Sample externalIds: 17977942962042299, 18037736453432111, 17993044208813926, ...

**Classification:** Manual Review (may be unrecoverable; could be safe-delete if source no longer exists)

### #20 — Provider consistency: **MEDIUM** — 39 records
| Platform | Missing IDs | Count |
|----------|-------------|-------|
| Instagram | No mediaId or accountId in metaData | 28 |
| Facebook | No postId or pageId in metaData | 7 |
| YouTube Profile | No channelId in metaData | 2 |
| YouTube Content | No videoId or channelId | 2 (subsumed by profile count) |

The 28 Instagram records are the same as the `"instagram  video"` spam group from #19b. The Facebook records have similar placeholder titles.

**Classification:** Manual Review / Repair (try re-enrichment; if source unavailable, consider deletion)

---

## Platform Distribution

| Platform | Total | Indexed (searchVector NOT NULL) |
|----------|-------|--------------------------------|
| youtube  | 354   | 349                              |
| instagram| 28    | 0                                |
| facebook | 7     | 0                                |
| pinterest| 6     | 0                                |

Instagram, Facebook, and Pinterest records have never been indexed for full-text search (all have NULL searchVector). The Instagram records also have the spam title issue.

---

## Doc/Code Discrepancies

1. **DB enum vs TypeScript enum:** DB has `('Profile', 'Content', 'Community')`; TS `StreamEntityType` adds `Project`. Documented in `03_Search_Domain_Model.md` as `Profile, Content, Community` (matches DB). The `Project` value cannot be stored in `contentStreams.type` — if any code path routes through `PostgresSearchProvider.index()` with `type='Project'`, it will get a PostgreSQL error.

2. **metaData column type:** Migration created as `json`; entity says `type: 'json'`; but docs (`09_ContentStreams_Extension.md`, `03_Search_Domain_Model.md`) reference `jsonb`. `jsonb` supports GIN indexing. Currently no GIN index on metaData exists.

---

## Recommended Execution Order

1. **Repair** — backfill derived data (publishedAt, searchText, engagementScore)
2. **Reindex** — rebuild search vectors via trigger
3. **Validate** — run unified search, confirm no undefined groups
4. **Delete** — only after validation, remove provably unrecoverable records

---

## Repair SQL

See companion script: `scripts/repair-contentstreams.sql`
