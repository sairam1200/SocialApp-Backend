# 05 — Search Provider

Status: 🟡 In Progress
Phase: Phase 1
Owner: Backend
Last Updated: 2026-07-28
Depends On: [03_Search_Domain_Model](./03_Search_Domain_Model.md)
Next Document: [06_Search_Indexer](./06_Search_Indexer.md)

---

> **Update (2026-07-31):** the `SEARCH_UNIFIED_ENABLED` / `MEILISEARCH_ENABLED`
> provider-selection snippets in §4 are historical. `SEARCH_UNIFIED_ENABLED` was
> removed from `src/core/utils/const.ts` (zero references in `src/**/*.ts`) and
> there is no legacy-mode provider fallback. `ContentStreamIndexService.indexBatch()`
> is the sole write path for upstream provider results; the PostgreSQL provider is
> the read path.

---

## 1. Executive Summary

This document defines the `SearchProvider` interface and its implementations. The SearchProvider abstracts the search engine, allowing PostgreSQL to be replaced by Meilisearch or any future engine without changing callers.

The interface is designed for simplicity: four methods covering search, index, update, and delete. Implementations handle the complexity of query construction, index management, and result mapping.

**Note:** Redis cache is integrated at the pipeline level (see 04_Search_Query_Pipeline.md), not within the SearchProvider itself. The SearchProvider focuses purely on search engine abstraction.

---

## 2. Interface Definition

```typescript
interface ISearchProvider {
  search(query: SearchQuery): Promise<SearchCandidate[]>;
  index(document: SearchDocument): Promise<void>;
  update(document: SearchDocument): Promise<void>;
  delete(platform: string, externalId: string): Promise<void>;
  count(query: SearchQuery): Promise<number>;
}
```

### 2.1 Method Signatures

| Method | Input | Output | Purpose |
|---|---|---|---|
| `search` | `SearchQuery` | `SearchCandidate[]` | Search the corpus and return candidates |
| `index` | `SearchDocument` | `void` | Add or update a document in the corpus |
| `update` | `SearchDocument` | `void` | Update an existing document |
| `delete` | `platform`, `externalId` | `void` | Remove a document from the corpus |
| `count` | `SearchQuery` | `number` | Count matching documents (for pagination) |

---

## 3. Implementations

### 3.1 PostgresSearchProvider (Phase 1)

**File:** `src/infrastructure/search/postgresSearchProvider.ts`

The PostgreSQL implementation uses `tsvector` for full-text search and `pg_trgm` for fuzzy matching.

#### 3.1.1 Search Implementation

```typescript
async search(query: SearchQuery): Promise<SearchCandidate[]> {
  const { normalizedQuery, platforms, type, page, limit, sortBy, sortOrder } = query;

  const queryBuilder = this.repository.createQueryBuilder('cs');

  // Full-text search with tsvector
  const tsQuery = this.toTsQuery(normalizedQuery);

  queryBuilder
    .select([
      'cs.*',
      `ts_rank(cs."searchVector", to_tsquery('english', :tsQuery)) AS "textRelevance"`,
      `similarity(cs."searchText", :similarityQuery) AS "textSimilarity"`,
      `CASE WHEN cs.title ILIKE :exactQuery THEN 1 ELSE 0 END AS "exactMatch"`,
    ])
    .where(
      `cs."searchVector" @@ to_tsquery('english', :tsQuery)
       OR cs."searchText" % :similarityQuery`,
      { tsQuery, similarityQuery: normalizedQuery, exactQuery: `%${normalizedQuery}%` }
    );

  // Platform filter
  if (platforms && platforms.length > 0) {
    queryBuilder.andWhere('cs.platform IN (:...platforms)', { platforms });
  }

  // Type filter
  if (type) {
    queryBuilder.andWhere('cs.type = :type', { type });
  }

  // Sorting
  this.applySorting(queryBuilder, sortBy, sortOrder);

  // Pagination
  queryBuilder.skip((page - 1) * limit).take(limit);

  const results = await queryBuilder.getRawMany();

  return results.map(row => this.toSearchCandidate(row));
}
```

#### 3.1.2 Query Construction

```typescript
private toTsQuery(query: string): string {
  // Convert natural language query to tsquery
  // "how to build a rest api" → "how & to & build & a & rest & api"
  return query.split(/\s+/).filter(Boolean).join(' & ');
}
```

#### 3.1.3 Index Implementation

```typescript
async index(document: SearchDocument): Promise<void> {
  const searchText = this.generateSearchText(document);
  const searchVector = this.generateSearchVector(searchText);

  await this.repository
    .createQueryBuilder()
    .insert()
    .into('contentStreams')
    .values({
      id: document.id,
      platform: document.platform,
      externalId: document.externalId,
      type: document.type,
      subType: document.subType,
      title: document.title,
      searchText,
      searchVector,
      publishedAt: document.publishedAt,
      engagementScore: document.engagementScore,
      creatorId: document.creatorId,
      metaData: document.metaData,
      lastRefreshed: new Date(),
    })
    .orUpdate([
      'title', 'searchText', 'searchVector', 'publishedAt',
      'engagementScore', 'creatorId', 'metaData', 'lastRefreshed'
    ], ['platform', 'externalId'])
    .execute();
}
```

#### 3.1.4 Text Generation

```typescript
private generateSearchText(document: SearchDocument): string {
  const parts = [
    document.title,
    document.description,
    ...(document.tags || []),
    document.creatorName,
  ];

  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

private generateSearchVector(searchText: string): string {
  return `to_tsvector('english', '${searchText.replace(/'/g, "''")}')`;
}
```

---

### 3.2 MeilisearchSearchProvider (Future)

**File:** `src/infrastructure/search/meilisearchSearchProvider.ts`

The Meilisearch implementation provides typo-tolerant search with zero configuration.

#### 3.2.1 Search Implementation

```typescript
async search(query: SearchQuery): Promise<SearchCandidate[]> {
  const index = this.client.index('contentStreams');

  const results = await index.search(query.normalizedQuery, {
    filter: this.buildFilter(query),
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
    attributesToHighlight: ['title', 'description'],
  });

  return results.hits.map(hit => this.toSearchCandidate(hit));
}
```

#### 3.2.2 Filter Construction

```typescript
private buildFilter(query: SearchQuery): string[] {
  const filters: string[] = [];

  if (query.platforms && query.platforms.length > 0) {
    filters.push(`platform IN [${query.platforms.map(p => `"${p}"`).join(', ')}]`);
  }

  if (query.type) {
    filters.push(`type = "${query.type}"`);
  }

  return filters;
}
```

#### 3.2.3 Index Implementation

```typescript
async index(document: SearchDocument): Promise<void> {
  const index = this.client.index('contentStreams');

  await index.addDocuments([{
    id: document.id,
    platform: document.platform,
    externalId: document.externalId,
    type: document.type,
    subType: document.subType,
    title: document.title,
    searchText: this.generateSearchText(document),
    publishedAt: document.publishedAt,
    engagementScore: document.engagementScore,
    creatorId: document.creatorId,
    metaData: document.metaData,
  }]);
}
```

---

## 4. Provider Selection

### 4.1 Feature Flag Integration

```typescript
function getSearchProvider(): ISearchProvider {
  if (featureFlag.isEnabled('SEARCH_UNIFIED_ENABLED')) {
    if (featureFlag.isEnabled('MEILISEARCH_ENABLED')) {
      return meilisearchSearchProvider;
    }
    return postgresSearchProvider;
  }
  return legacySearchService;
}
```

### 4.2 Dependency Injection

```typescript
// src/infrastructure/dependency.ts
SearchProvider: {
  provide: _const.ISEARCH_PROVIDER,
  useFactory: (featureFlag, postgresProvider, meilisearchProvider) => {
    if (featureFlag.isEnabled('SEARCH_UNIFIED_ENABLED')) {
      if (featureFlag.isEnabled('MEILISEARCH_ENABLED')) {
        return meilisearchProvider;
      }
      return postgresProvider;
    }
    return null; // Legacy mode
  },
  inject: [FEATURE_FLAG, PostgresSearchProvider, MeilisearchSearchProvider],
},
```

---

## 5. Query Builder

### 5.1 PostgreSQL Query Builder

The PostgreSQL query builder constructs TypeORM QueryBuilder instances:

```typescript
class PostgresQueryBuilder {
  buildSearchQuery(query: SearchQuery): SelectQueryBuilder<ContentStream> {
    // ... query construction logic
  }

  buildCountQuery(query: SearchQuery): SelectQueryBuilder<ContentStream> {
    // ... count query logic
  }

  applySorting(
    queryBuilder: SelectQueryBuilder<ContentStream>,
    sortBy: string,
    sortOrder: string
  ): void {
    // ... sorting logic
  }
}
```

### 5.2 Meilisearch Query Builder

The Meilisearch query builder constructs search parameters:

```typescript
class MeilisearchQueryBuilder {
  buildSearchParams(query: SearchQuery): SearchParams {
    // ... search params construction
  }

  buildFilter(query: SearchQuery): string[] {
    // ... filter construction
  }
}
```

---

## 6. Result Mapping

### 6.1 PostgreSQL Result Mapping

```typescript
private toSearchCandidate(row: any): SearchCandidate {
  return {
    document: {
      id: row.id,
      platform: row.platform,
      externalId: row.externalId,
      type: row.type,
      subType: row.subType,
      title: row.title,
      searchText: row.searchText,
      publishedAt: row.publishedAt,
      engagementScore: row.engagementScore,
      creatorId: row.creatorId,
      metaData: row.metaData,
      lastRefreshed: row.lastRefreshed,
    },
    textRelevance: parseFloat(row.textRelevance) || 0,
    textSimilarity: parseFloat(row.textSimilarity) || 0,
    exactMatch: row.exactMatch === 1,
    matchedFields: this.getMatchedFields(row),
  };
}
```

### 6.2 Meilisearch Result Mapping

```typescript
private toSearchCandidate(hit: any): SearchCandidate {
  return {
    document: {
      id: hit.id,
      platform: hit.platform,
      externalId: hit.externalId,
      type: hit.type,
      subType: hit.subType,
      title: hit.title,
      searchText: hit.searchText,
      publishedAt: new Date(hit.publishedAt),
      engagementScore: hit.engagementScore,
      creatorId: hit.creatorId,
      metaData: hit.metaData,
      lastRefreshed: new Date(hit.lastRefreshed),
    },
    textRelevance: hit._rankingScore || 0,
    textSimilarity: 0,
    exactMatch: false,
    matchedFields: Object.keys(hit._formatted || {}),
  };
}
```

---

## 7. Performance Considerations

### 7.1 PostgreSQL

| Optimization | Description |
|---|---|
| GIN Index | `CREATE INDEX idx_contentStreams_searchVector ON contentStreams USING GIN(searchVector)` |
| Trigram Index | `CREATE INDEX idx_contentStreams_searchText ON contentStreams USING GIN(searchText gin_trgm_ops)` |
| Partial Index | `CREATE INDEX idx_contentStreams_platform ON contentStreams(platform) WHERE searchVector IS NOT NULL` |
| Connection Pooling | Reuse existing TypeORM connection pool |

### 7.2 Meilisearch

| Optimization | Description |
|---|---|
| Typo Tolerance | Built-in, no configuration needed |
| Faceted Search | Use for platform filtering |
| Sortable Attributes | Pre-configure for `publishedAt`, `engagementScore` |
| Indexing | Batch updates for better performance |

---

## 8. Error Handling

### 8.1 Provider Errors

```typescript
try {
  const candidates = await provider.search(query);
} catch (error) {
  if (error instanceof SearchProviderError) {
    logger.error('Search provider error', error);
    throw new SearchException('Search failed', error);
  }
  throw error;
}
```

### 8.2 Fallback Strategy

```typescript
async search(query: SearchQuery): Promise<SearchCandidate[]> {
  try {
    return await this.primaryProvider.search(query);
  } catch (error) {
    logger.warn('Primary provider failed, trying fallback', error);
    return await this.fallbackProvider.search(query);
  }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

- Query construction
- Result mapping
- Text generation
- Filter building

### 9.2 Integration Tests

- PostgreSQL search with real data
- Meilisearch search with real data
- Full provider lifecycle (index → search → update → delete)

### 9.3 Performance Tests

- 100 concurrent searches
- Latency under load
- Memory usage under load

---

## 10. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [03_Search_Domain_Model](./03_Search_Domain_Model.md) — Domain model definitions
- [04_Search_Query_Pipeline](./04_Search_Query_Pipeline.md) — Query lifecycle
- [06_Search_Indexer](./06_Search_Indexer.md) — SearchIndexer implementation
- [10_Postgres_Search](./10_Postgres_Search.md) — PostgreSQL FTS details
- [24_Meilisearch_Migration](./24_Meilisearch_Migration.md) — Meilisearch migration plan
