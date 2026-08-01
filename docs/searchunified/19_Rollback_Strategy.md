# 19 — Rollback Strategy

Status: 🟡 In Progress
Phase: Phase 1
Owner: Backend
Last Updated: 2026-07-28
Depends On: [18_Migration_Plan](./18_Migration_Plan.md)
Next Document: [20_Facebook_Implementation](./20_Facebook_Implementation.md)

---

## 1. Executive Summary

This document defines the rollback strategy for unified search, including procedures for feature flag rollback, schema rollback, and code rollback. Rollback is designed to be fast (< 60 seconds) with no data loss.

---

## 2. Rollback Triggers

| Trigger | Action | Time to Effect |
|---|---|---|
| Latency p99 > 500ms | Disable unified search | < 60s |
| Error rate > 1% | Disable unified search | < 60s |
| User complaints | Disable unified search | < 60s |
| Infrastructure alerts | Full rollback | < 5 min |

---

## 3. Feature Flag Rollback

### 3.1 Immediate Rollback

```bash
# Set environment variable
SEARCH_UNIFIED_ENABLED=false

# Restart Cloud Run service
gcloud run services update gaddr-backend-api \
  --update-env-vars SEARCH_UNIFIED_ENABLED=false \
  --region us-central1
```

### 3.2 Verification

```bash
# Verify unified search is disabled
curl -X POST https://api.gaddr.com/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"searchTerm": "test"}'
```

---

## 4. Schema Rollback

### 4.1 Drop Indexes

```sql
DROP INDEX CONCURRENTLY IF EXISTS "IDX_contentStreams_search_partial";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_contentStreams_creatorId";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_contentStreams_engagementScore";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_contentStreams_publishedAt";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_contentStreams_searchText_trgm";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_contentStreams_searchVector";
```

### 4.2 Drop Columns

```sql
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "creatorId";
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "engagementScore";
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "publishedAt";
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "contentStreams" DROP COLUMN IF EXISTS "searchText";
```

---

## 5. Code Rollback

### 5.1 Git Revert

```bash
# Revert to previous version
git revert HEAD
git push origin main
```

### 5.2 Deployment Rollback

```bash
# Rollback to previous revision
gcloud run services update-traffic gaddr-backend-api \
  --to-revisions=gaddr-backend-api-00001=100 \
  --region us-central1
```

---

## 6. Data Preservation

### 6.1 Indexed Content

All indexed content remains in `contentStreams` after rollback. The new columns (`searchText`, `searchVector`, etc.) are not removed during feature flag rollback.

### 6.2 Schema Changes

Schema changes are only rolled back during major incidents. Normal rollback only disables the feature flag.

---

## 7. Testing Rollback

### 7.1 Rollback Test

```bash
# Test rollback procedure
SEARCH_UNIFIED_ENABLED=false npm run start
# Verify legacy search works
```

### 7.2 Recovery Test

```bash
# Test recovery
SEARCH_UNIFIED_ENABLED=true npm run start
# Verify unified search works
```

---

## 8. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [16_Feature_Flag_Rollout](./16_Feature_Flag_Rollout.md) — Feature flag strategy
- [18_Migration_Plan](./18_Migration_Plan.md) — Migration plan
