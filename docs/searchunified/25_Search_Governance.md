# 25 — Search Governance

Status: ⚪ Planned
Phase: Phase 1
Owner: Architect
Last Updated: 2026-07-28
Depends On: All previous documents
Next Document: [IMPLEMENTATION_CHECKLIST](./IMPLEMENTATION_CHECKLIST.md)

---

## 1. Executive Summary

This document defines the long-term contracts for platform integrations, ensuring consistency and maintainability as new platforms are added. It establishes governance rules for normalizers, imports, and search quality.

**Status:** ⚪ Planned — Phase 1 (governance framework), Phase 2+ (platform-specific rules)

---

## 2. Platform Integration Contract

### 2.1 Normalizer Requirements

Every platform normalizer MUST:

1. Map all required fields to Canonical Search Document
2. Handle missing fields gracefully (default values)
3. Log normalization errors without failing
4. Support batch normalization
5. Be idempotent (same input → same output)

### 2.2 Import Requirements

Every platform import MUST:

1. Trigger search indexing after import
2. Handle API errors gracefully
3. Respect rate limits and quotas
4. Log import progress
5. Support incremental updates

### 2.3 Enrichment Requirements

Every platform enrichment MUST:

1. Batch API calls for efficiency
2. Handle quota exhaustion gracefully
3. Retry failed enrichments
4. Log enrichment progress
5. Update `lastRefreshed` timestamp

### 2.4 Refresh Requirements

Every platform refresh MUST:

1. Use lazy, on-demand refresh strategy (NOT scheduled polling)
2. Only refresh content that is searched AND stale (> 24 hours old)
3. Never block search responses waiting for refresh
4. Queue refresh jobs asynchronously via BullMQ
5. Handle API errors gracefully (return stale content on failure)
6. Invalidate Redis cache entries after updating contentStreams

---

## 3. Search Quality Standards

### 3.1 Relevance Requirements

| Metric | Target |
|---|---|
| Top-10 precision | > 80% |
| Top-10 recall | > 90% |
| Mean reciprocal rank | > 0.7 |

### 3.2 Performance Requirements

| Metric | Target |
|---|---|
| Search latency (p50) | < 100ms |
| Search latency (p99) | < 300ms |
| Index freshness | < 24 hours |

### 3.3 Monitoring Requirements

Every platform MUST provide:

1. Import success rate
2. Enrichment completion rate
3. Search latency per platform
4. Error rate per platform

---

## 4. API Contract

### 4.1 Request Contract

```typescript
{
  searchTerm: string,        // Required, 1-200 chars
  platforms?: string[],      // Optional, valid platform names
  page?: number,             // Optional, >= 1
  limit?: number,            // Optional, 1-100
  sortBy?: string,           // Optional, 'relevance' | 'date' | 'engagement'
}
```

### 4.2 Response Contract

```typescript
{
  query: string,
  platforms: string[],
  results: SearchResult[],
  totalResults: number,
  page: number,
  limit: number,
}
```

### 4.3 Backward Compatibility

The API contract MUST remain backward compatible during Phase 1 rollout. No breaking changes without version bump.

---

## 5. Documentation Requirements

### 5.1 Platform Documentation

Every platform MUST have:

1. Normalizer documentation
2. Import pipeline documentation
3. Enrichment documentation
4. Quota documentation
5. Error handling documentation

### 5.2 API Documentation

Every API endpoint MUST have:

1. Request/response examples
2. Error codes and descriptions
3. Rate limiting information
4. Authentication requirements

---

## 6. Review Process

### 6.1 Code Review

All search-related code MUST be reviewed by:

1. Backend lead
2. Database lead
3. Security review (for API keys)

### 6.2 Architecture Review

All search architecture changes MUST be reviewed by:

1. Architect
2. Backend lead
3. Database lead

---

## 7. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [00_Overview](./00_Overview.md) — Project overview
- [02_Architecture](./02_Architecture.md) — Architecture diagrams
- [03_Search_Domain_Model](./03_Search_Domain_Model.md) — Domain models
- [IMPLEMENTATION_CHECKLIST](./IMPLEMENTATION_CHECKLIST.md) — Implementation checklist
