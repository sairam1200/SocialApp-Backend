# 24 — Meilisearch Migration

Status: ⚪ Planned
Phase: Phase 3
Owner: Backend
Last Updated: 2026-07-28
Depends On: [05_Search_Provider](./05_Search_Provider.md)
Next Document: [25_Search_Governance](./25_Search_Governance.md)

---

## 1. Executive Summary

This document defines the migration plan from PostgreSQL to Meilisearch as the search engine. Meilisearch provides typo-tolerant search, instant results, and zero configuration. The SearchProvider interface makes this a drop-in replacement.

**Status:** ⚪ Planned — Phase 3

---

## 2. Meilisearch Benefits

| Feature | PostgreSQL | Meilisearch |
|---|---|---|
| Typo tolerance | Manual (pg_trgm) | Built-in |
| Search speed | 10-50ms | < 10ms |
| Indexing speed | Moderate | Fast |
| Configuration | Complex | Zero |
| Relevance | Good | Excellent |

---

## 3. Migration Plan

### 3.1 Phase 1: Setup

1. Deploy Meilisearch instance
2. Create `MeilisearchSearchProvider`
3. Sync `contentStreams` to Meilisearch

### 3.2 Phase 2: Testing

1. A/B test PostgreSQL vs Meilisearch
2. Compare search quality
3. Compare latency

### 3.3 Phase 3: Migration

1. Enable Meilisearch for all users
2. Monitor performance
3. Remove PostgreSQL search indexes

---

## 4. Sync Strategy

### 4.1 Initial Sync

```typescript
async syncToMeilisearch(): Promise<void> {
  const documents = await this.contentStreamRepository.find();
  
  const index = this.client.index('contentStreams');
  await index.addDocuments(documents.map(doc => ({
    id: doc.id,
    platform: doc.platform,
    externalId: doc.externalId,
    type: doc.type,
    subType: doc.subType,
    title: doc.title,
    searchText: doc.searchText,
    publishedAt: doc.publishedAt,
    engagementScore: doc.engagementScore,
  })));
}
```

### 4.2 Real-Time Sync

```typescript
// Listen for content changes and sync to Meilisearch
eventEmitter.on('content.indexed', async (event) => {
  const document = await this.contentStreamRepository.findOne(event.documentId);
  await this.client.index('contentStreams').addDocuments([document]);
});
```

---

## 5. Configuration

### 5.1 Index Settings

```typescript
await this.client.index('contentStreams').updateSettings({
  searchableAttributes: ['title', 'searchText'],
  filterableAttributes: ['platform', 'type', 'publishedAt'],
  sortableAttributes: ['publishedAt', 'engagementScore'],
  rankingRules: [
    'words',
    'typo',
    'proximity',
    'attribute',
    'sort',
    'exactness',
  ],
});
```

### 5.2 Feature Flag

```typescript
const FEATURE_FLAGS = {
  MEILISEARCH_ENABLED: {
    defaultValue: false,
    description: 'Enable Meilisearch as search engine',
    owner: 'backend',
  },
};
```

---

## 6. Rollback

### 6.1 Immediate Rollback

```bash
# Disable Meilisearch
MEILISEARCH_ENABLED=false
```

### 6.2 Data Preservation

All data remains in `contentStreams`. Meilisearch is a read-optimized index, not a source of truth.

---

## 7. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [05_Search_Provider](./05_Search_Provider.md) — SearchProvider interface
- [09_ContentStreams_Extension](./09_ContentStreams_Extension.md) — Schema changes
- [23_Future_AI_Search](./23_Future_AI_Search.md) — AI search features
