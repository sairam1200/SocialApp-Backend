# IMPLEMENTATION CHECKLIST

Status: 🟡 In Progress
Phase: Phase 1
Owner: Architect
Last Updated: 2026-07-31
Depends On: All documents

---

> **Implementation Update (2026-07-31):** the consolidated search landed ahead of this checklist's phased plan. `SearchOrchestratorService` runs the unified + legacy + project providers concurrently with per-provider timeouts, merges with the direct `userContents` search, and resolves creator identity on every result (`ResolvedCreatorIdentity` with `userId`). The feature-flag routing (section 4) was **removed** in favor of the single `POST /search` flow, and the dead `GET /search/results` + `GET /search/item` endpoints were deleted. The `userContents (platform, externalId)` identity index was added via migration `1785455366000`. Items below that contradict this reality are historical; keep them only if the consolidated behavior is reverted.

---

## Phase 1: YouTube + Architecture

### 1. Schema Changes

- [ ] Enable pg_trgm extension
- [ ] Add `searchText` column (nullable)
- [ ] Add `searchVector` column (nullable)
- [ ] Add `publishedAt` column (nullable)
- [ ] Add `engagementScore` column (nullable)
- [ ] Add `creatorId` column (nullable)
- [ ] Create GIN index on `searchVector`
- [ ] Create GIN index on `searchText` (pg_trgm)
- [ ] Create B-tree index on `publishedAt`
- [ ] Create B-tree index on `engagementScore`
- [ ] Create B-tree index on `creatorId`
- [ ] Create partial index for search
- [ ] Backfill `searchText` from title + metaData
- [ ] Backfill `searchVector` from searchText
- [ ] Backfill `publishedAt` from metaData
- [ ] Backfill `engagementScore` from engagement metrics

### 2. Core Components

- [ ] Create `SearchProvider` interface
- [ ] Implement `PostgresSearchProvider`
- [ ] Create `SearchDocumentBuilder`
- [ ] Create `SearchIndexer`
- [ ] Create `RankingService`
- [ ] Create `YouTube Normalizer`
- [ ] Add DI tokens for new components
- [ ] Wire up dependency injection

### 3. Background Services

- [ ] Create enrichment BullMQ processor
- [ ] Create refresh BullMQ processor (lazy, on-demand strategy)
- [ ] Implement YouTube video enrichment
- [ ] Implement YouTube channel enrichment
- [ ] Implement staleness detection
- [ ] Implement lazy refresh (NOT scheduled polling)
- [ ] Implement on-demand indexing for cache miss
- [ ] Implement Redis cache invalidation after refresh

### 4. API Integration

- [x] Add feature flag `SEARCH_UNIFIED_ENABLED` — added then **removed (2026-07-31)**; no flag remains
- [x] Refactor `GlobalSearchQueryHandler` for feature flag routing — flag routing removed (2026-07-31); single consolidated flow
- [x] Implement unified search path
- [x] Implement fallback to legacy search — superseded: `SearchService` no longer persists via `GeneralRepository`; all results index through `ContentStreamIndexService.indexBatch()`
- [x] Preserve API contract
- [x] Add response formatting

### 5. Testing

- [ ] Unit tests for SearchDocumentBuilder
- [ ] Unit tests for SearchIndexer
- [ ] Unit tests for RankingService
- [ ] Unit tests for YouTube Normalizer
- [ ] Unit tests for SearchProvider
- [ ] Integration tests for PostgreSQL search
- [ ] Integration tests for BullMQ jobs
- [ ] E2E tests for API endpoint
- [ ] Load tests for concurrent searches

### 6. Deployment

- [ ] Deploy with feature flag off
- [ ] Verify no errors
- [ ] Seed YouTube content
- [ ] Enable for admin users
- [ ] Monitor search quality
- [ ] Enable for 10% of users
- [ ] Monitor latency and errors
- [ ] Enable for 50% of users
- [ ] Enable for 100% of users
- [ ] Remove legacy code

---

## Phase 2: Additional Platforms

### 7. Facebook

- [ ] Create Facebook Normalizer
- [ ] Integrate with Facebook import service
- [ ] Add Facebook enrichment
- [ ] Test Facebook search
- [ ] Enable Facebook unified search

### 8. Instagram

- [ ] Create Instagram Normalizer
- [ ] Integrate with Instagram import service
- [ ] Add Instagram enrichment
- [ ] Test Instagram search
- [ ] Enable Instagram unified search

### 9. Pinterest

- [ ] Create Pinterest Normalizer
- [ ] Integrate with Pinterest import service
- [ ] Add Pinterest enrichment
- [ ] Test Pinterest search
- [ ] Enable Pinterest unified search

---

## Phase 3: Search Engine Migration

### 10. Meilisearch

- [ ] Deploy Meilisearch instance
- [ ] Create `MeilisearchSearchProvider`
- [ ] Sync contentStreams to Meilisearch
- [ ] A/B test PostgreSQL vs Meilisearch
- [ ] Enable Meilisearch for all users
- [ ] Remove PostgreSQL search indexes

---

## Phase 4: AI and Advanced Search

### 11. Semantic Search

- [ ] Add `embedding` column
- [ ] Generate embeddings for content
- [ ] Create HNSW index
- [ ] Implement vector similarity search

### 12. Vision-Based OCR

- [ ] Integrate Google Cloud Vision API
- [ ] Extract text from thumbnails
- [ ] Add extracted text to searchText

### 13. Speech Transcription

- [ ] Integrate Google Cloud Speech-to-Text
- [ ] Transcribe video audio
- [ ] Add transcript to searchText

### 14. Machine Learning Ranking

- [ ] Collect user interaction data
- [ ] Train ranking model
- [ ] Deploy model for inference
- [ ] A/B test against baseline

---

## Verification Commands

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run load tests
npm run test:load

# Run CI pipeline
./scripts/ci.sh

# Check migration status
npm run migration:status

# Run migration
npm run migration:run

# Rollback migration
npm run migration:revert
```

---

## Related Documents

- [README](./README.md) — Entry point and architecture summary
- [00_Overview](./00_Overview.md) — Project overview
- [25_Search_Governance](./25_Search_Governance.md) — Governance rules
