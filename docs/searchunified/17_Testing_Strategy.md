# 17 — Testing Strategy

Status: 🟡 In Progress
Phase: Phase 1
Owner: QA
Last Updated: 2026-07-28
Depends On: [16_Feature_Flag_Rollout](./16_Feature_Flag_Rollout.md)
Next Document: [18_Migration_Plan](./18_Migration_Plan.md)

---

## 1. Executive Summary

This document defines the testing strategy for unified search, covering unit, integration, E2E, and load testing. Testing verifies correctness, performance, and backward compatibility.

---

## 2. Test Types

### 2.1 Unit Tests

| Component | Test Coverage |
|---|---|
| SearchDocumentBuilder | Text cleaning, searchText generation, engagement score |
| SearchIndexer | Insert, update, deduplication, event emission |
| RankingService | Score calculation, normalization, sorting |
| YouTube Normalizer | Field mapping, batch normalization |
| SearchProvider | Query construction, result mapping |

### 2.2 Integration Tests

| Test | Description |
|---|---|
| PostgreSQL Search | Full-text search with real data |
| BullMQ Jobs | Enrichment and refresh job processing |
| Feature Flag | Routing and fallback logic |

### 2.3 E2E Tests

| Test | Description |
|---|---|
| API Endpoint | POST /api/v1/search with unified search |
| Response Format | Backward compatibility verification |
| Platform Filtering | Search across specific platforms |

### 2.4 Load Tests

| Test | Target |
|---|---|
| Concurrent Searches | 100 concurrent requests |
| Latency Under Load | p99 < 300ms |
| Memory Usage | < 512 MB |

---

## 3. Test Data

### 3.1 YouTube Test Data

- 100 videos with varying metadata
- 10 channels with subscriber counts
- 5 playlists

### 3.2 Search Queries

- Exact match: "How to Build a REST API"
- Partial match: "rest api tutorial"
- Fuzzy match: "rest apii"
- No match: "xyznonexistent"

---

## 4. Test Execution

### 4.1 Local Development

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

### 4.2 CI/CD Pipeline

```bash
# Run all tests
./scripts/ci.sh

# Run load tests (nightly)
npm run test:load
```

---

## 5. Test Assertions

### 5.1 Search Quality

```typescript
// Verify search returns relevant results
const results = await search({ query: 'rest api' });
expect(results.length).toBeGreaterThan(0);
expect(results[0].title).toContain('REST API');
```

### 5.2 Performance

```typescript
// Verify latency
const start = Date.now();
await search({ query: 'test' });
const duration = Date.now() - start;
expect(duration).toBeLessThan(100); // < 100ms
```

### 5.3 Backward Compatibility

```typescript
// Verify response format
const response = await post('/api/v1/search', { searchTerm: 'test' });
expect(response).toHaveProperty('query');
expect(response).toHaveProperty('results');
expect(response).toHaveProperty('totalResults');
```

---

## 6. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [15_Search_API_Refactor](./15_Search_API_Refactor.md) — API refactor
- [16_Feature_Flag_Rollout](./16_Feature_Flag_Rollout.md) — Feature flag strategy
