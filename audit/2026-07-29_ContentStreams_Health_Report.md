# ContentStreams Search Health Report

**Date:** 2026-07-29
**Total rows:** 395
**Repairs applied:** 4
**Status:** ✅ Healthy

---

## What was done

### Audit (20 checks)
Ran 20 integrity checks against `contentStreams`. Found 1 HIGH and 6 MEDIUM issues.

### Repairs applied

| Repair | Rows affected | Description |
|--------|--------------|-------------|
| Backfill `searchText` | 135 | Generated search text from title + metaData description/channelTitle/creatorName |
| Force trigger `searchVector` rebuild | 46 | Fired the PG trigger for records that had `searchText` but missing `searchVector` |
| Backfill `publishedAt` | 386 | Extracted timestamp from `metaData->>'publishedAt'` (352), `metaData->>'createdAt'` (6), `metaData->>'timestamp'` (28) |
| Backfill `engagementScore` | 31 | Computed from `viewCount`, `likeCount`, `commentCount` in metadata |

### Post-repair state

| Metric | Before | After |
|--------|--------|-------|
| Records with `searchText` | 260 | **395** |
| Records with `searchVector` | 349 | **395** |
| Records with `publishedAt` | 0 (after deep dive: 9 had it) | **386** |
| Records with `engagementScore` | 0 | **31** |
| Records searchable (searchVector NOT NULL) | 349 (88%) | **395 (100%)** |
| Records with NULL platform/type/externalId | 0 | **0** |
| Duplicate (platform, externalId) | 0 | **0** |

### Validation results

- Full-text search queries return correctly typed, ranked results
- No "undefined" platform or type groups would be produced in API responses
- All GIN indexes exist and are used by the query planner (Bitmap Heap Scan)
- Search returns results for queries like "cat", "instagram", "music" with correct platform attribution

---

## Remaining gaps (cannot be fixed by data repair)

| Issue | Records | Reason |
|-------|---------|--------|
| No `engagementScore` | 364 | No view/like/comment data in metaData — `search.list` API doesn't return engagement metrics. Requires background enrichment via `videos.list` (costs 1 unit each) or platform-specific enrichment pipeline |
| No `publishedAt` | 9 | YouTube profiles (2) and Facebook records (7) with no timestamp in any metaData key |
| Instagram placeholder titles | 19 | `"instagram  video"` / `"instagram  image"` titles — likely failed imports without enrichment |
| Facebook placeholder data | 7 | Minimal metadata, no enrichment implemented for Facebook |
| Pinterest | 6 | No enrichment pipeline for Pinterest |

---

## Recommendations

1. **EngagementScore enrichment:** The 364 records without engagement data are YouTube search results where `search.list` was called but `videos.list` enrichment never ran. Running background enrichment would populate view/like/comment counts and enable engagement-based ranking.

2. **Instagram re-import:** The 19 Instagram records with placeholder titles need re-import from the Instagram Graph API. If the original content is no longer accessible, they should be deleted after confirmation.

3. **Facebook/Pinterest enrichment:** Neither platform has an enrichment pipeline. Until implemented, these records will have minimal ranking signals.

4. **DB enum alignment:** `StreamEntityType.Project` (in TypeScript) is not in `contentStreams_type_enum` (PostgreSQL). Add `'Project'` via `ALTER TYPE ... ADD VALUE` if Project records will ever be stored in contentStreams, or remove from the TS enum if they won't.

5. **metaData json → jsonb:** Consider migrating the `metaData` column to `jsonb` to enable GIN indexing for metadata queries. Currently created as `json` in the original migration.

---

## Index health

12 indexes on contentStreams. The 6 search-specific indexes from migration `1785000000000` all exist:
- `IDX_contentStreams_searchVector` (GIN on tsvector)
- `IDX_contentStreams_searchText_trgm` (GIN on searchText)
- `IDX_contentStreams_publishedAt` (B-tree)
- `IDX_contentStreams_engagementScore` (B-tree)
- `IDX_contentStreams_creatorId` (B-tree)
- `IDX_contentStreams_search_partial` (partial on platform,type WHERE searchVector IS NOT NULL)

No index bloat detected.
