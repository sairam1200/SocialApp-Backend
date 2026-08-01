# 15 — Search API Refactor

Status: ✅ Implemented
Phase: Phase 1
Owner: Backend
Last Updated: 2026-07-31
Depends On: [14_Background_Refresh](./14_Background_Refresh.md)
Next Document: [16_Feature_Flag_Rollout](./16_Feature_Flag_Rollout.md)

---

## 1. Executive Summary

This document defines the search API refactor. **Update (2026-07-31):** the phase-gated feature-flag rollout described below is historical. Search was consolidated into a single `POST /search` orchestration flow (`SearchOrchestratorService`), the obsolete `GET /search/results` and `GET /search/item` endpoints were removed (verified zero consumers), and only `POST /search` + `GET /search/suggestions` remain. The sections below document the original plan and how it was resolved.

> **Update (2026-07-31, second):** the legacy persistence path inside
> `SearchService` was retired. `persistNewContentStreams` (flag-gated dedupe via
> `GeneralRepository.checkExistingItemsAsync` + `updateContentRefreshTimestampAsync`)
> is gone; `SearchService` delegates every upstream provider result to
> `ContentStreamIndexService.indexBatch()` unconditionally and remains a pure
> orchestration layer. The 12 per-platform search endpoints (`/integrations/<platform>/search`)
> that `SearchService` backs are still live but write exclusively through the
> unified indexer. `IGeneralRepository` stays registered for the rollback
> listener (`platform-rollback.listener.ts`) only.

---

## 2. API Contract Preservation

### 2.1 Existing API

```typescript
// POST /api/v1/search
{
  searchTerm: string,
  platforms?: string[],
  filter?: Record<string, any>,
  page?: number,
  limit?: number,
  paginationTokens?: Record<string, string>,
  forceRefresh?: boolean
}

// Response
{
  query: string,
  platforms: string[],
  results: { [platform: string]: any },
  paginationTokens: { [platform: string]: string | null },
  totalResults: number,
  page: number,
  limit: number
}
```

### 2.2 New API (Same Contract)

```typescript
// POST /api/v1/search (same endpoint)
// Same request body
// Same response format (backward compatible)
```

---

## 3. Feature Flag Integration

> **Resolved (2026-07-31):** the `SEARCH_UNIFIED_ENABLED` flag was removed. `POST /search` always runs the consolidated orchestrator. The remaining live surface is exactly two endpoints:
>
> | Method | Path | Handler | Notes |
> |---|---|---|---|
> | `POST` | `/api/v1/search` | `SearchOrchestratorService.execute` | Single consolidated search (unified + legacy + project providers + direct userContents, merged) |
> | `GET` | `/api/v1/search/suggestions` | `SearchSuggestionsQueryHandler` | Live typeahead; identity-aware suggestions |
>
> Removed (dead, verified zero consumers): `GET /api/v1/search/results` (`SearchResultsQuery`) and `GET /api/v1/search/item` (`SearchItemQuery`) — along with their handlers, schemas, and the repository/interface `getGlobalSearchItemAsync` method.

### 3.1 Flag Check (historical)

```typescript
// In GlobalSearchQueryHandler
async execute(command: GlobalSearchQuery): Promise<GlobalSearchResponseModel> {
  if (this.featureFlag.isEnabled('SEARCH_UNIFIED_ENABLED')) {
    return this.unifiedSearch(command.model);
  } else {
    return this.legacySearch(command.model);
  }
}
```

### 3.2 Unified Search (Three-Tier Retrieval)

```typescript
private async unifiedSearch(model: GlobalSearchRequestModel): Promise<GlobalSearchResponseModel> {
  // 1. Build search query
  const query: SearchQuery = {
    originalQuery: model.searchTerm,
    normalizedQuery: this.normalizeQuery(model.searchTerm),
    platforms: model.platforms,
    page: model.page || 1,
    limit: model.limit || 25,
    sortBy: 'relevance',
    sortOrder: 'desc',
    forceRefresh: model.forceRefresh || false,
  };

  // 2. Search via three-tier retrieval (Redis → PostgreSQL → Platform API)
  const candidates = await this.searchWithThreeTierRetrieval(query);

  // 3. Rank results
  const ranked = this.rankingService.rank(candidates, query);

  // 4. Format response
  return this.formatResponse(ranked, query);
}
```

### 3.3 Three-Tier Retrieval

```typescript
private async searchWithThreeTierRetrieval(query: SearchQuery): Promise<SearchCandidate[]> {
  // 1. Check Redis cache first (fastest)
  const cacheKey = this.buildCacheKey(query);
  const cached = await this.redis.getFromRedisAsync(cacheKey);
  if (cached) {
    return cached; // Redis cache hit (< 1ms)
  }

  // 2. Search PostgreSQL contentStreams
  const candidates = await this.searchProvider.search(query);

  // 3. If results found, cache and return (PostgreSQL hit)
  if (candidates.length > 0) {
    await this.redis.storeInRedisAsync(cacheKey, candidates, SEARCH_CACHE.QUERY_CACHE_TTL_SEC);
    return candidates;
  }

  // 4. If no results found (cache miss), trigger on-demand indexing
  const platform = query.platforms?.[0] || 'youtube';

  try {
    // 4a. Call platform API (YouTube search.list)
    const response = await this.platformApiService.search(platform, query.originalQuery);

    // 4b. Normalize response
    const canonicalDocs = this.platformNormalizer.normalizeBatch(response.items);

    // 4c. Build search documents
    const searchDocs = canonicalDocs.map(doc => this.searchDocumentBuilder.build(doc));

    // 4d. Index into contentStreams
    await this.searchIndexer.indexBatch(searchDocs);

    // 4e. Search again (content is now indexed)
    const newCandidates = await this.searchProvider.search(query);

    // 4f. Cache results in Redis
    if (newCandidates.length > 0) {
      await this.redis.storeInRedisAsync(cacheKey, newCandidates, SEARCH_CACHE.QUERY_CACHE_TTL_SEC);
    }

    return newCandidates;
  } catch (error) {
    // 4g. On API failure, return empty results (never block search)
    logger.warn(`On-demand indexing failed for ${platform}`, error);
    return [];
  }
}
```

### 3.4 Legacy Search

```typescript
private async legacySearch(model: GlobalSearchRequestModel): Promise<GlobalSearchResponseModel> {
  // Existing fan-out logic (unchanged)
  return this.searchService.searchAsync(model);
}
```

---

## 4. Response Formatting

### 4.1 Backward-Compatible Response

```typescript
private formatResponse(results: SearchResult[], query: SearchQuery): GlobalSearchResponseModel {
  const response = new GlobalSearchResponseModel();
  response.query = query.originalQuery;
  response.platforms = query.platforms || Object.values(_const.PLATFORMS);
  response.page = query.page;
  response.limit = query.limit;
  response.totalResults = results.length;

  // Group results by platform (backward compatible)
  results.forEach(result => {
    if (!response.results[result.platform]) {
      response.results[result.platform] = [];
    }
    response.results[result.platform].push(result);
  });

  return response;
}
```

---

## 5. Fallback Strategy

### 5.1 Provider Failure

```typescript
private async unifiedSearch(model: GlobalSearchRequestModel): Promise<GlobalSearchResponseModel> {
  try {
    return await this.searchWithProvider(model);
  } catch (error) {
    logger.warn('Unified search failed, falling back to legacy', error);
    return this.legacySearch(model);
  }
}
```

### 5.2 Partial Failure

```typescript
// If some platforms fail, return partial results
const results = await Promise.allSettled(
  platforms.map(platform => this.searchPlatform(platform, query))
);

const successful = results
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);

const failed = results
  .filter(r => r.status === 'rejected')
  .map((r, i) => ({ platform: platforms[i], error: r.reason }));

return { results: successful, errors: failed };
```

---

## 6. Migration Strategy

> **Complete (2026-07-31).** The phased rollout below ran and finished: Phase 4 (legacy removal) was completed in a stronger form — instead of only removing the flag, the duplicate/dead search flows were deleted outright and search was consolidated to the single orchestrator endpoint. Remaining history:

### 6.1 Phase 1: Feature Flag Off

- Deploy new code with `SEARCH_UNIFIED_ENABLED=false`
- All requests use legacy search
- No behavior change

### 6.2 Phase 2: Admin Testing

- Enable for admin users only
- Verify unified search results
- Compare with legacy results

### 6.3 Phase 3: Gradual Rollout

- Enable for 10% of users
- Monitor latency, errors
- Increase to 50%, then 100%

### 6.4 Phase 4: Legacy Removal

- After 100% rollout, remove legacy code
- Remove feature flag
- Clean up unused code

---

## 7. Testing Strategy

### 7.1 Unit Tests

- Feature flag routing
- Response formatting
- Fallback logic

### 7.2 Integration Tests

- Full API endpoint
- Unified search flow
- Legacy search flow

### 7.3 Regression Tests

- Compare unified vs legacy results
- Verify API contract preservation
- Test all platform combinations

---

## 8. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [04_Search_Query_Pipeline](./04_Search_Query_Pipeline.md) — Query lifecycle
- [16_Feature_Flag_Rollout](./16_Feature_Flag_Rollout.md) — Feature flag strategy
- [17_Testing_Strategy](./17_Testing_Strategy.md) — Testing approach
