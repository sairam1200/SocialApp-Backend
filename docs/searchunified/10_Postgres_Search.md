# 10 — PostgreSQL Search

Status: 🟡 In Progress
Phase: Phase 1
Owner: Database
Last Updated: 2026-07-28
Depends On: [09_ContentStreams_Extension](./09_ContentStreams_Extension.md)
Next Document: [11_YouTube_Normalizer](./11_YouTube_Normalizer.md)

---

## 1. Executive Summary

This document defines the PostgreSQL full-text search implementation for Gaddr Unified Search. It covers `tsvector`, `ts_rank`, `pg_trgm`, GIN indexes, and query optimization.

PostgreSQL is the initial search engine. Meilisearch migration is planned but not implemented. The SearchProvider interface abstracts the implementation.

---

## 2. PostgreSQL Full-Text Search

### 2.1 tsvector

`tsvector` is a sorted list of distinct lexemes (normalized words) with their positions:

```sql
-- Create tsvector from text
SELECT to_tsvector('english', 'How to Build a REST API with Node.js');
-- Result: 'build':3 'node.js':7 'rest':5 'api':6

-- Store in column
UPDATE "contentStreams"
SET "searchVector" = to_tsvector('english', "searchText");
```

### 2.2 tsquery

`tsquery` is a boolean expression of lexemes:

```sql
-- Create tsquery from text
SELECT to_tsquery('english', 'build & api');
-- Result: 'build' & 'api'

-- Phrase query
SELECT plainto_tsquery('english', 'build rest api');
-- Result: 'build' & 'rest' & 'api'
```

### 2.3 ts_rank

`ts_rank` scores documents based on term frequency:

```sql
-- Rank by tsvector
SELECT cs.*,
       ts_rank(cs."searchVector", to_tsquery('english', 'build & api')) AS rank
FROM "contentStreams" cs
WHERE cs."searchVector" @@ to_tsquery('english', 'build & api')
ORDER BY rank DESC;
```

### 2.4 Full-Text Search Query

```sql
-- Complete search query
SELECT cs.*,
       ts_rank(cs."searchVector", plainto_tsquery('english', :query)) AS "textRelevance"
FROM "contentStreams" cs
WHERE cs."searchVector" @@ plainto_tsquery('english', :query)
ORDER BY "textRelevance" DESC
LIMIT :limit OFFSET :offset;
```

---

## 3. pg_trgm

### 3.1 Trigram Concept

`pg_trgm` breaks text into trigrams (three-character sequences):

```sql
-- Example
SELECT show_trgm('hello');
-- Result: {0xc42000e34a0}  (hex representation of trigrams)

-- Similarity
SELECT similarity('hello', 'jello');
-- Result: 0.5 (3 shared trigrams out of 6 total)
```

### 3.2 Similarity Search

```sql
-- Fuzzy matching
SELECT cs.*,
       similarity(cs."searchText", :query) AS sim
FROM "contentStreams" cs
WHERE cs."searchText" % :query
ORDER BY sim DESC;
```

### 3.3 GIN Index for pg_trgm

```sql
-- Create GIN index
CREATE INDEX "IDX_contentStreams_searchText_trgm" 
  ON "contentStreams" USING GIN("searchText" gin_trgm_ops);

-- Query uses index
EXPLAIN ANALYZE
SELECT cs.*
FROM "contentStreams" cs
WHERE cs."searchText" % 'rest api';
-- Result: Index Scan using IDX_contentStreams_searchText_trgm
```

---

## 4. GIN Indexes

### 4.1 GIN for tsvector

```sql
-- Create GIN index
CREATE INDEX "IDX_contentStreams_searchVector" 
  ON "contentStreams" USING GIN("searchVector");

-- Query uses index
EXPLAIN ANALYZE
SELECT cs.*
FROM "contentStreams" cs
WHERE cs."searchVector" @@ to_tsquery('english', 'build & api');
-- Result: Bitmap Heap Scan using IDX_contentStreams_searchVector
```

### 4.2 GIN for pg_trgm

```sql
-- Create GIN index
CREATE INDEX "IDX_contentStreams_searchText_trgm" 
  ON "contentStreams" USING GIN("searchText" gin_trgm_ops);

-- Query uses index
EXPLAIN ANALYZE
SELECT cs.*
FROM "contentStreams" cs
WHERE cs."searchText" % 'rest api';
-- Result: Bitmap Heap Scan using IDX_contentStreams_searchText_trgm
```

### 4.3 GIN Performance

| Operation | Without GIN | With GIN | Improvement |
|---|---|---|---|
| Full-text search | 20-100ms | < 10ms | 2-10x |
| Fuzzy matching | 50-200ms | < 20ms | 2-10x |
| Index build | N/A | 10-30s | One-time cost |
| Index size | N/A | 20-100% of table | Storage trade-off |

---

## 5. Combined Search Query

### 5.1 Full-Text + Fuzzy

```sql
-- Combine tsvector and pg_trgm
SELECT cs.*,
       ts_rank(cs."searchVector", plainto_tsquery('english', :query)) AS "textRelevance",
       similarity(cs."searchText", :query) AS "textSimilarity"
FROM "contentStreams" cs
WHERE (
  cs."searchVector" @@ plainto_tsquery('english', :query)
  OR cs."searchText" % :query
)
ORDER BY 
  (ts_rank(cs."searchVector", plainto_tsquery('english', :query)) * 0.7 +
   similarity(cs."searchText", :query) * 0.3) DESC
LIMIT :limit OFFSET :offset;
```

### 5.2 Platform Filter

```sql
-- Add platform filter
SELECT cs.*,
       ts_rank(cs."searchVector", plainto_tsquery('english', :query)) AS "textRelevance",
       similarity(cs."searchText", :query) AS "textSimilarity"
FROM "contentStreams" cs
WHERE (
  cs."searchVector" @@ plainto_tsquery('english', :query)
  OR cs."searchText" % :query
)
AND cs."platform" = :platform
ORDER BY 
  (ts_rank(cs."searchVector", plainto_tsquery('english', :query)) * 0.7 +
   similarity(cs."searchText", :query) * 0.3) DESC
LIMIT :limit OFFSET :offset;
```

### 5.3 Type Filter

```sql
-- Add type filter
SELECT cs.*,
       ts_rank(cs."searchVector", plainto_tsquery('english', :query)) AS "textRelevance",
       similarity(cs."searchText", :query) AS "textSimilarity"
FROM "contentStreams" cs
WHERE (
  cs."searchVector" @@ plainto_tsquery('english', :query)
  OR cs."searchText" % :query
)
AND cs."type" = :type
ORDER BY 
  (ts_rank(cs."searchVector", plainto_tsquery('english', :query)) * 0.7 +
   similarity(cs."searchText", :query) * 0.3) DESC
LIMIT :limit OFFSET :offset;
```

---

## 6. Query Optimization

### 6.1 EXPLAIN ANALYZE

Always use `EXPLAIN ANALYZE` to verify index usage:

```sql
EXPLAIN ANALYZE
SELECT cs.*
FROM "contentStreams" cs
WHERE cs."searchVector" @@ plainto_tsquery('english', 'build api');
```

### 6.2 Index Usage Check

```sql
-- Check index usage
SELECT 
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE relname = 'contentStreams';
```

### 6.3 Index Size Check

```sql
-- Check index size
SELECT 
  indexrelname,
  pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE relname = 'contentStreams';
```

---

## 7. Configuration

### 7.1 Text Search Configuration

```sql
-- List available configurations
SELECT * FROM pg_ts_config;

-- Use English configuration
SELECT to_tsconfig('english', 'How to Build a REST API');
```

### 7.2 Stop Words

```sql
-- Check stop words for English
SELECT * FROM pg_ts_stopword WHERE cfgname = 'english';
```

### 7.3 Dictionary

```sql
-- Check dictionary
SELECT * FROM pg_ts_dict WHERE dictname = 'english_stem';
```

---

## 8. Performance Considerations

### 8.1 Index Maintenance

GIN indexes are slow to update but fast to query. For write-heavy workloads, consider:

- Batch updates during low-traffic periods
- Use `FASTUPDATE = OFF` for faster updates
- Monitor index bloat

### 8.2 Connection Pooling

Reuse existing TypeORM connection pool. No new connections.

### 8.3 Query Planning

PostgreSQL query planner uses statistics to choose indexes. Keep statistics up-to-date:

```sql
ANALYZE "contentStreams";
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

- tsvector generation
- tsquery construction
- ts_rank calculation
- pg_trgm similarity

### 9.2 Integration Tests

- Full-text search queries
- Fuzzy matching queries
- Combined queries
- Index usage verification

### 9.3 Performance Tests

- 100 concurrent searches
- Latency under load
- Index size monitoring

---

## 10. Related Documents

- [README](./README.md) — Entry point and architecture summary
- [09_ContentStreams_Extension](./09_ContentStreams_Extension.md) — Schema changes
- [05_Search_Provider](./05_Search_Provider.md) — SearchProvider interface
- [24_Meilisearch_Migration](./24_Meilisearch_Migration.md) — Meilisearch migration
