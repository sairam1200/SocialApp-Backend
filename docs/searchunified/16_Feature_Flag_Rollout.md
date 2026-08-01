# 16 — Feature Flag Rollout

Status: ✅ Resolved
Phase: Phase 1
Owner: Backend
Last Updated: 2026-07-31
Depends On: [15_Search_API_Refactor](./15_Search_API_Refactor.md)
Next Document: [17_Testing_Strategy](./17_Testing_Strategy.md)

---

> **Resolved (2026-07-31):** the `SEARCH_UNIFIED_ENABLED` flag was removed from
> `src/core/utils/const.ts`; zero references remain in `src/**/*.ts`. The staged
> rollout described below never ran. Search persistence is now unconditional:
> `SearchService` is a pure orchestration layer (cache coordination, DB-first
> lookup, staleness, fetch, response building) and every upstream provider result
> is written through `ContentStreamIndexService.indexBatch()`, which upserts into
> `contentStreams` on `(platform, externalId)`. There is no flag, no legacy
> persistence fallback, and no `IGeneralRepository` usage in the search path
> (`checkExistingItemsAsync` / `updateContentRefreshTimestampAsync` survive only
> for the platform-rollback listener). This document is retained as history.

---

## 1. Executive Summary

This document defines the feature flag strategy for unified search rollout. The flag `SEARCH_UNIFIED_ENABLED` controls whether requests use the new unified search pipeline or the legacy fan-out search.

Rollout is gradual with monitoring gates at each stage.

---

## 2. Feature Flag

### 2.1 Flag Definition

```typescript
const FEATURE_FLAGS = {
  SEARCH_UNIFIED_ENABLED: {
    defaultValue: false,
    description: 'Enable unified search pipeline',
    owner: 'backend',
  },
};
```

### 2.2 Flag Check

```typescript
function isEnabled(flag: string): boolean {
  return featureFlagService.isEnabled(flag);
}
```

---

## 3. Rollout Stages

### 3.1 Stage 0: Deploy (Flag Off)

```bash
# Deploy with flag off
SEARCH_UNIFIED_ENABLED=false
```

**Duration:** 1-2 days
**Purpose:** Verify deployment, no behavior change
**Monitoring:** Deployment health, error rates

### 3.2 Stage 1: Seed Content

```bash
# Enable for background jobs only
SEARCH_UNIFIED_ENABLED=false
SEARCH_INDEXING_ENABLED=true
```

**Duration:** 1-2 days
**Purpose:** Index YouTube content
**Monitoring:** Indexing progress, content count

### 3.3 Stage 2: Admin Testing

```bash
# Enable for admin users
SEARCH_UNIFIED_ENABLED=true
SEARCH_ALLOWED_USERS=admin@example.com
```

**Duration:** 1-2 days
**Purpose:** Verify unified search results
**Monitoring:** Search quality, latency, errors

### 3.4 Stage 3: 10% Rollout

```bash
# Enable for 10% of users
SEARCH_UNIFIED_ENABLED=true
SEARCH_ROLLOUT_PERCENTAGE=10
```

**Duration:** 2-3 days
**Purpose:** Test under production load
**Monitoring:** Latency, errors, user feedback

### 3.5 Stage 4: 50% Rollout

```bash
# Enable for 50% of users
SEARCH_UNIFIED_ENABLED=true
SEARCH_ROLLOUT_PERCENTAGE=50
```

**Duration:** 2-3 days
**Purpose:** Scale testing
**Monitoring:** Latency, errors, infrastructure metrics

### 3.6 Stage 5: 100% Rollout

```bash
# Enable for all users
SEARCH_UNIFIED_ENABLED=true
SEARCH_ROLLOUT_PERCENTAGE=100
```

**Duration:** 1 week
**Purpose:** Full production validation
**Monitoring:** All metrics, user feedback

---

## 4. Rollback Procedure

### 4.1 Immediate Rollback

```bash
# Disable unified search
SEARCH_UNIFIED_ENABLED=false
```

**Time to take effect:** < 60 seconds (Cloud Run restart)
**Data loss:** None (all indexed content remains)
**Code deployment:** Not required

### 4.2 Rollback Triggers

| Trigger | Action |
|---|---|
| Latency p99 > 500ms | Rollback to 50% |
| Error rate > 1% | Rollback to 10% |
| User complaints > 5 | Rollback to admin only |
| Infrastructure alerts | Full rollback |

---

## 5. Monitoring

### 5.1 Key Metrics

| Metric | Target | Alert Threshold |
|---|---|---|
| Search latency (p50) | < 100ms | > 200ms |
| Search latency (p99) | < 300ms | > 500ms |
| Error rate | < 0.1% | > 1% |
| Cache hit rate | > 80% | < 60% |
| Index freshness | < 24 hours | > 48 hours |

### 5.2 Dashboards

- Unified Search Latency
- Unified Search Errors
- Unified Search vs Legacy Comparison
- Indexing Progress
- Cache Performance

---

## 6. Configuration

### 6.1 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SEARCH_UNIFIED_ENABLED` | `false` | Enable unified search |
| `SEARCH_ROLLOUT_PERCENTAGE` | `0` | Percentage of users (0-100) |
| `SEARCH_ALLOWED_USERS` | `''` | Comma-separated user IDs |
| `SEARCH_INDEXING_ENABLED` | `false` | Enable background indexing |

### 6.2 Feature Flag Service

```typescript
class FeatureFlagService {
  isEnabled(flag: string, userId?: string): boolean {
    const config = FEATURE_FLAGS[flag];
    if (!config) return false;

    // Check if user is in allowed list
    if (userId && config.allowedUsers?.includes(userId)) {
      return true;
    }

    // Check rollout percentage
    if (config.rolloutPercentage > 0) {
      const hash = this.hashUserId(userId);
      return hash % 100 < config.rolloutPercentage;
    }

    return config.defaultValue;
  }
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

- Feature flag logic
- Rollout percentage calculation
- User allowlist

### 7.2 Integration Tests

- Flag routing
- Fallback logic
- Rollback procedure

---

## 8. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [15_Search_API_Refactor](./15_Search_API_Refactor.md) — API refactor
- [17_Testing_Strategy](./17_Testing_Strategy.md) — Testing approach
- [19_Rollback_Strategy](./19_Rollback_Strategy.md) — Rollback procedures
