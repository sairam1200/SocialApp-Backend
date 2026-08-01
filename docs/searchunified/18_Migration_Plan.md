# 18 — Migration Plan

Status: 🟡 In Progress
Phase: Phase 1
Owner: Database
Last Updated: 2026-07-28
Depends On: [17_Testing_Strategy](./17_Testing_Strategy.md)
Next Document: [19_Rollback_Strategy](./19_Rollback_Strategy.md)

---

> **Update (2026-07-31):** the feature-flag deployment steps in §2.3 and the
> `SEARCH_UNIFIED_ENABLED=false` rollback in §4.2 are historical. The flag was
> removed from `src/core/utils/const.ts`; there is no flag to disable. Indexing
> is unconditional and write-path rollback means reverting to
> `ContentStreamIndexService.indexBatch()` being the sole writer — the current
> state.
>
> **Schema ownership boundary (2026-07-31):** the `project` table is **owned by
> the Drizzle project**, not by this NestJS/TypeORM backend. `ProjectSearchRepository`
> is a read-only consumer. The TypeORM migration chain must **not** add a
> `CREATE TABLE project` migration — doing so would create two sources of truth
> and schema drift. Because `POSTGRES_SYNCHRONIZE=false` and no TypeORM migration
> creates `project`, a from-empty migration build fails at
> `AddProjectSearchIndexes1784000000009` **unless the Drizzle migrations have run
> first**. Fresh-environment bootstrap order is therefore:
>
> 1. Apply Drizzle migrations → creates `project` (and any other Drizzle-owned tables)
> 2. Apply TypeORM migrations → creates backend-owned tables
> 3. Start the application
>
> The TypeORM chain was hardened (2026-07-31) to tolerate externally-managed or
> absent legacy tables: `1784000000002` (`upload_jobs`), `1784000000007`
> (`youtube_accounts`/`youtube_videos`), and `1784000000008` (`gaddr_users_compat`)
> are now guarded with `EXCEPTION WHEN undefined_table` so a fresh build does not
> abort on tables the backend does not own or that no longer exist.

---

## 1. Executive Summary

This document defines the migration plan for schema changes, backfill scripts, and zero-downtime deployment. All changes are additive — no destructive operations.

---

## 2. Migration Order

### 2.1 Phase 1: Schema Changes

1. Enable pg_trgm extension
2. Add new columns (nullable)
3. Create GIN indexes
4. Create B-tree indexes

### 2.2 Phase 2: Backfill

1. Backfill `searchText` from title + metaData
2. Backfill `searchVector` from searchText
3. Backfill `publishedAt` from metaData
4. Backfill `engagementScore` from engagement metrics

### 2.3 Phase 3: Code Deployment

1. Deploy new code with feature flag off
2. Verify no errors
3. Enable feature flag for admin users
4. Gradual rollout

---

## 3. Zero-Downtime Strategy

### 3.1 Additive Changes Only

- New columns are nullable
- New indexes are created CONCURRENTLY
- Old code continues to work

### 3.2 Backfill Strategy

```sql
-- Batch backfill (1000 rows per batch)
DO $$
DECLARE
  batch_size INT := 1000;
  total_rows INT;
  processed INT := 0;
BEGIN
  SELECT COUNT(*) INTO total_rows FROM "contentStreams" WHERE "searchText" IS NULL;
  
  WHILE processed < total_rows LOOP
    UPDATE "contentStreams"
    SET "searchText" = LOWER(COALESCE("title", '') || ' ' || COALESCE("metaData"->>'description', ''))
    WHERE "searchText" IS NULL
    LIMIT batch_size;
    
    processed := processed + batch_size;
    COMMIT;
  END LOOP;
END $$;
```

### 3.3 Index Creation

```sql
-- Create indexes CONCURRENTLY (non-blocking)
CREATE INDEX CONCURRENTLY "IDX_contentStreams_searchVector" 
  ON "contentStreams" USING GIN("searchVector");
```

---

## 4. Rollback Procedures

### 4.1 Schema Rollback

```sql
-- Drop indexes
DROP INDEX CONCURRENTLY IF EXISTS "IDX_contentStreams_searchVector";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_contentStreams_searchText_trgm";

-- Drop columns
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "searchText";
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "publishedAt";
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "engagementScore";
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "creatorId";
```

### 4.2 Code Rollback

```bash
# Disable unified search
SEARCH_UNIFIED_ENABLED=false

# Or rollback deployment
git revert <commit-hash>
```

---

## 5. Monitoring

### 5.1 Migration Progress

```sql
-- Check backfill progress
SELECT 
  COUNT(*) FILTER (WHERE "searchText" IS NULL) AS remaining,
  COUNT(*) FILTER (WHERE "searchText" IS NOT NULL) AS completed,
  COUNT(*) AS total
FROM "contentStreams";
```

### 5.2 Index Size

```sql
-- Check index size
SELECT 
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE relname = 'contentStreams';
```

---

## 6. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [09_ContentStreams_Extension](./09_ContentStreams_Extension.md) — Schema changes
- [19_Rollback_Strategy](./19_Rollback_Strategy.md) — Rollback procedures
