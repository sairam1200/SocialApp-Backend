# 10 — Rename Strategy Investigation: Unique Table Naming for Conflict Resolution

> **Status:** Draft | **Date:** 2026-07-20 | **Scope:** All DB-level table name conflicts across Project A (merger-schema) and Project B (TypeORM entities) | **Depends on:** Doc 08 (Identity Resolution), Doc 09 (Merge Strategy)

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Stage 1 — Updated Conflict Discovery](#2-stage-1--updated-conflict-discovery)
3. [Stage 2 — Business Domain Analysis](#3-stage-2--business-domain-analysis)
4. [Stage 3 — Rename Strategy: Proposed Unique Names](#4-stage-3--rename-strategy-proposed-unique-names)
5. [Stage 4 — Feasibility Analysis](#5-stage-4--feasibility-analysis)
6. [Stage 5 — Dependency Investigation](#6-stage-5--dependency-investigation)
7. [Stage 6 — ORM Compatibility](#7-stage-6--orm-compatibility)
8. [Stage 7 — Database Analysis](#8-stage-7--database-analysis)
9. [Stage 8 — Shared Identity Compatibility](#9-stage-8--shared-identity-compatibility)
10. [Stage 9 — Security Review](#10-stage-9--security-review)
11. [Stage 10 — Migration Strategy](#11-stage-10--migration-strategy)
12. [Stage 11 — Long-Term Architecture Comparison](#12-stage-11--long-term-architecture-comparison)
13. [Stage 12 — Decision Matrix](#13-stage-12--decision-matrix)
14. [Stage 13 — Naming Standards](#14-stage-13--naming-standards)
15. [Stage 14 — Future Compatibility](#15-stage-14--future-compatibility)
16. [Resource Analysis](#16-resource-analysis)
17. [Risks and Mitigations](#17-risks-and-mitigations)
18. [Final Recommendation](#18-final-recommendation)

---

## 1. Executive Summary

This investigation examines whether **renaming tables** (giving each conflicting table a unique database name) is a viable alternative to merging schemas for the 14 DB-level table name conflicts identified between Project A (Drizzle/merger-schema) and Project B (TypeORM entities).

**Key findings:**

- Of 14 DB-level conflicts, **8 tables are EASY to merge** (one schema simply absorbs the other with minimal column additions), making renaming unnecessary for those tables.
- **4 tables are MODERATE** (structural differences but compatible), where renaming is feasible but merge remains simpler.
- **3 tables are HARD** (fundamentally different designs), where renaming into unique names is the **recommended path** to avoid forced schema compromises.
- Renaming avoids data migration risk for HARD conflicts but doubles table count, complicates queries, and increases long-term maintenance burden.
- **Recommended strategy:** Hybrid approach — merge EASY/MODERATE tables into unified schemas, rename only the 3 HARD-conflict tables.

---

## 2. Stage 1 — Updated Conflict Discovery

### 2.1 Methodology Correction from Doc 09

Doc 09 listed conflicts based on ORM entity names. This investigation corrects for actual PostgreSQL table names, since Drizzle and TypeORM use different naming conventions:

- Drizzle (Project A): snake_case table names by default
- TypeORM (Project B): configurable — some entities use camelCase (`userContents`), others snake_case (`linked_accounts`)

The critical distinction: **ORM name conflicts ≠ database name conflicts**. Only database-level name collisions cause actual PostgreSQL errors.

### 2.2 Actual Database-Level Conflicts (14 tables)

These are tables where both projects create tables with **identical PostgreSQL table names**, meaning they cannot coexist in the same schema:

| # | Table Name | Project A Source | Project B Entity | PK Conflict |
|---|---|---|---|---|
| 1 | `linked_accounts` | merger-schema.ts (serial) | LinkedAccount (UUID) | serial vs UUID |
| 2 | `notification_events` | merger-schema.ts (serial) | NotificationEvent (UUID) | serial vs UUID |
| 3 | `notification_templates` | merger-schema.ts (serial) | NotificationTemplate (UUID) | serial vs UUID |
| 4 | `newsletter_subscribers` | merger-schema.ts (serial) | NewsletterSubscriber (UUID) | serial vs UUID |
| 5 | `playlists` | merger-schema.ts (serial) | Playlist (UUID) | serial vs UUID |
| 6 | `playlist_members` | merger-schema.ts (serial) | PlaylistMember (UUID) | serial vs UUID |
| 7 | `playlist_content` | merger-schema.ts (serial) | PlaylistContent (UUID) | serial vs UUID |
| 8 | `youtube_accounts` | merger-schema.ts (serial) | YoutubeAccount (UUID) | serial vs UUID |
| 9 | `youtube_videos` | merger-schema.ts (serial) | YoutubeVideo (UUID) | serial vs UUID |
| 10 | `content_streams` | merger-schema.ts (serial) | ContentStream (UUID) | serial vs UUID |
| 11 | `upload_jobs` | merger-schema.ts (serial) | UploadJob (UUID) | serial vs UUID |
| 12 | `search_histories` | merger-schema.ts (serial) | SearchHistory (UUID) | serial vs UUID |
| 13 | `premium_rollups` | merger-schema.ts (serial) | PremiumRollup (UUID) | serial vs UUID |
| 14 | `newsletter_subscribers` | merger-schema.ts (serial) | NewsletterSubscriber (UUID) | serial vs UUID |

> Note: `user` (A) vs `users` (B) is excluded — Doc 08 already resolved this with `public.user` as canonical.

### 2.3 Same Business Concept, Different DB Names (5 pairs)

These pairs represent the **same business entity** but with different PostgreSQL table names — no DB collision, but ORM-level confusion:

| # | Project A Name | Project B Name | Business Concept |
|---|---|---|---|
| 15 | `user_topics` | `userTopics` | User's topic interests |
| 16 | `profiles` | `manualProfiles` | User profile / platform links |
| 17 | `notification` | `notifications` | User notifications |
| 18 | `analytics_event` | `analyticsEvents` | Analytics tracking |
| 19 | `user_contents` | `userContents` | User's content items |

### 2.4 Updated Classification Table

| Category | Count | Tables | Recommended Path |
|---|---|---|---|
| DB-level conflicts (EASY merge) | 8 | linked_accounts, notification_events, notification_templates, newsletter_subscribers, youtube_accounts, youtube_videos, search_histories, premium_rollups | **Merge** |
| DB-level conflicts (MODERATE) | 3 | playlists, playlist_members, playlist_content | **Merge** preferred, rename if needed |
| DB-level conflicts (HARD) | 3 | content_streams, upload_jobs, playlist_content | **Rename** |
| Same concept, different names | 5 | user_topics, profiles, notification, analytics_event, user_contents | **Merge** to single canonical name |

---

## 3. Stage 2 — Business Domain Analysis

For every MODERATE and HARD conflict, we answer two questions:

**Q1: Do both tables serve the same business concept?**
**Q2: Should they be merged into one table, or kept as separate uniquely-named tables?**

### playlists (MODERATE)

**Q1 — Same business concept?** Partially. Both represent user-created collections of content. Project A's version is a simple list (userId, name, isPublic). Project B adds ownership semantics, display ordering, and member/content relations.

**Q2 — Merge or separate?** Merge. Project B's schema is a superset of A's. Project A's `isPublic` can be mapped to B's permission model. The `referenceId` and `displayOrder` columns from B are useful additions. A single `playlists` table with B's richer schema serves both use cases.

### playlist_members (MODERATE)

**Q1 — Same business concept?** Yes — both represent a user's membership in a playlist with a role. Project B adds `joinedAt`/`removedAt` timestamps and uses an enum for role instead of a varchar.

**Q2 — Merge or separate?** Merge. Project B's enum and timestamps are strictly better. The varchar→enum change is a migration concern, not a design conflict.

### playlist_content (HARD)

**Q1 — Same business concept?** No — they represent fundamentally different data models:

- **Project A** (`playlist_content`): A pure **junction table** — `playlistId + contentId + position`. References existing `user_contents` rows via FK.
- **Project B** (`PlaylistContent`): A **denormalized content record** — stores `type`, `platform`, `contentId`, `contentUrl`, `title`, `description`, `thumbnailUrl`, `metadata` directly. No FK to `user_contents`.

**Q2 — Merge or separate?** **Keep separate.** Forcing these into one table would either:
- Require Project B to add a FK to `user_contents` (breaking its self-contained design), or
- Require Project A to add denormalized content fields (breaking normalization).

Rename is recommended. Proposed names below.

### content_streams (HARD)

**Q1 — Same business concept?** No:
- **Project A**: User-specific stream URLs (e.g., Twitch stream links). Has `userId`, `streamUrl`, `isActive`.
- **Project B**: Categorized content stream records with `type` (Profile/Content/Community), `subType`, `externalId`. No user ownership, no URL.

**Q2 — Merge or separate?** **Keep separate.** These serve different purposes. A is a user's streaming endpoint; B is a content classification system.

### upload_jobs (HARD)

**Q1 — Same business concept?** Partially — both track upload status. But:
- **Project A**: Generic upload job — `type`, `status`, `sourceUrl`, `result` (jsonb). User-owned.
- **Project B**: YouTube-specific upload with retry logic — `videoId`, `attempts`, `progress`, `statusMessage`, `lastError`, `nextRetryAt`, `r2Key`, `fileSize`. Not user-owned.

**Q2 — Merge or separate?** **Keep separate.** Project A's generic model cannot accommodate B's retry/retry-logic fields without becoming bloated. B's YouTube-specific fields don't belong in a generic upload tracker.

---

## 4. Stage 3 — Rename Strategy: Proposed Unique Names

For tables where renaming is recommended (HARD conflicts and select MODERATE conflicts), or where a unique name provides clarity:

| Current Name | Project | Business Purpose | Proposed Name | Reason |
|---|---|---|---|---|
| `playlist_content` | A | Junction table: playlist ↔ user_contents | `playlist_items` | A is a junction table — name reflects linking role |
| `playlist_content` | B | Denormalized content stored in playlist | `playlist_media` | B stores actual media/content data — name reflects content type |
| `content_streams` | A | User streaming endpoint URLs | `user_stream_urls` | A is user-owned URL storage — name is explicit |
| `content_streams` | B | Categorized content stream records | `content_stream_defs` | B defines stream categories — name reflects definition vs instance |
| `upload_jobs` | A | Generic upload tracking | `generic_upload_jobs` | A handles any upload type — name is explicit |
| `upload_jobs` | B | YouTube upload with retry logic | `youtube_upload_jobs` | B is YouTube-specific — name clarifies scope |

### Tables That Do NOT Need Renaming (Merge Recommended)

For these tables, merging one schema into the other eliminates the conflict without renaming:

| Table | Merge Direction | Target Schema | Action |
|---|---|---|---|
| `linked_accounts` | A → B | B (superset) | Add A's missing cols to B |
| `notification_events` | A → B | A (B is empty shell) | Add BaseEntity cols to A |
| `notification_templates` | A → B | A (B only has name) | Add BaseEntity cols to A |
| `newsletter_subscribers` | A → B | A (B only has email) | Add BaseEntity cols to A |
| `youtube_accounts` | A → B | B (superset +1 col) | Add disconnectedAt to A |
| `youtube_videos` | A → B | B (superset +5 cols) | Add B's extra cols to A |
| `search_histories` | A → B | B (normalized queries) | Adopt B's split query model |
| `premium_rollups` | A → B | B (structured metrics) | Adopt B's structured model |

---

## 5. Stage 4 — Feasibility Analysis

Eight criteria are evaluated for each rename candidate:

### Criteria

| # | Criterion | Description |
|---|---|---|
| F1 | Zero frontend changes | No API contract changes |
| F2 | Zero breaking API changes | Response shapes unchanged |
| F3 | Single PostgreSQL database | Both schemas share one DB |
| F4 | Both auth systems independent | Better Auth + Custom JWT coexist |
| F5 | POSTGRES_MIGRATIONS_RUN=true | Auto-migration on deploy |
| F6 | ~49 users | Small user base, low data volume |
| F7 | Phase 6+ is point of no return | Decisions are durable |
| F8 | Drizzle + TypeORM coexistence | Both ORMs write to same tables |

### Rename Feasibility per Table

| Table | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `playlist_content` (A→`playlist_items`) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | **FEASIBLE** |
| `playlist_content` (B→`playlist_media`) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | **FEASIBLE** |
| `content_streams` (A→`user_stream_urls`) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | **FEASIBLE** |
| `content_streams` (B→`content_stream_defs`) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | **FEASIBLE** |
| `upload_jobs` (A→`generic_upload_jobs`) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | **FEASIBLE** |
| `upload_jobs` (B→`youtube_upload_jobs`) | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | **FEASIBLE** |

> ⚠️ F5 note: With `POSTGRES_MIGRATIONS_RUN=true`, Drizzle will attempt to create tables that already exist if the schema definition still references the old name. The migration must update the schema definition **before** the rename migration runs, or the rename must happen as a raw SQL migration outside Drizzle's migration runner.

---

## 6. Stage 5 — Dependency Investigation

### Renamed Tables — Dependency Impact

#### `playlist_content` → `playlist_items` (Project A) / `playlist_media` (Project B)

| Dependency Type | Project A | Project B |
|---|---|---|
| FK references (inbound) | `playlist_members.playlistId` → `playlists` (not `playlist_content`) | None inbound to `playlist_content` |
| FK references (outbound) | → `playlists`, → `user_contents` | → `Playlist` entity |
| Indexes | `playlistId`, `contentId` composite | Default TypeORM indexes |
| Unique constraints | None | None |
| Drizzle schema refs | `merger-schema.ts` definition + any query builder usage | N/A (TypeORM) |
| TypeORM entity refs | N/A (Drizzle) | `PlaylistContent` entity + repository |
| API routes | Playlist CRUD operations | Playlist content endpoints |
| Estimated code changes | 3-5 files (schema + queries) | 3-5 files (entity + repository + service) |

#### `content_streams` → `user_stream_urls` (A) / `content_stream_defs` (B)

| Dependency Type | Project A | Project B |
|---|---|---|
| FK references (outbound) | → `user` (userId) | None (no FK) |
| Indexes | `userId`, `isActive` | Default TypeORM |
| Drizzle schema refs | `merger-schema.ts` | N/A |
| TypeORM entity refs | N/A | `ContentStream` entity |
| API routes | Stream management endpoints | Content stream queries |
| Estimated code changes | 2-3 files | 2-3 files |

#### `upload_jobs` → `generic_upload_jobs` (A) / `youtube_upload_jobs` (B)

| Dependency Type | Project A | Project B |
|---|---|---|
| FK references (outbound) | → `user` (userId) | → YoutubeVideo (videoId) |
| Indexes | `userId`, `status` | `videoId`, `status` |
| Drizzle schema refs | `merger-schema.ts` | N/A |
| TypeORM entity refs | N/A | `UploadJob` entity |
| API routes | Upload status endpoints | YouTube upload pipeline |
| Estimated code changes | 2-3 files | 3-4 files (retry logic refs) |

### Total Estimated Changes

| Category | Files Changed | Lines Changed |
|---|---|---|
| Drizzle schema definitions | 1 file | ~20 lines |
| TypeORM entity definitions | 3 files | ~15 lines |
| Query/repository code | 8-12 files | ~50-80 lines |
| Migration SQL | 3-6 files | ~30 lines |
| **Total** | **~15-20 files** | **~120-150 lines** |

---

## 7. Stage 6 — ORM Compatibility

### Drizzle (Project A)

Drizzle maps table names directly from schema definitions. Renaming requires:

1. Update the `pgTable()` call: `pgTable('playlist_content', ...)` → `pgTable('playlist_items', ...)`
2. Update all query references: `select().from(playlistContent)` → `select().from(playlistItems)`
3. Export name change propagates through all importing files

**Risk:** Drizzle's migration system generates DDL from schema definitions. If the old schema definition is still loaded when migrations run, it will attempt to `CREATE TABLE playlist_content` which will either fail (if renamed table exists) or create a duplicate.

**Mitigation:** Use a raw SQL migration for the rename (`ALTER TABLE playlist_content RENAME TO playlist_items`), then update the schema definition in the same deploy.

### TypeORM (Project B)

TypeORM uses `@Entity('table_name')` decorators. Renaming requires:

1. Update the decorator: `@Entity('playlist_content')` → `@Entity('playlist_media')`
2. Update repository injection: `getRepository(PlaylistContent)` → `getRepository(PlaylistMedia)` (if entity class is also renamed)
3. Update any `@RelationId`, `@JoinColumn` references

**Risk:** TypeORM's `synchronize: true` (if enabled) would drop the old table and create the new one, causing data loss. With `synchronize: false` (recommended), only explicit migrations affect the DB.

**Mitigation:** Rename via explicit migration SQL, update entity decorator, keep entity class name unchanged if desired.

### Cross-ORM Compatibility

| Concern | Impact | Mitigation |
|---|---|---|
| Drizzle creates table that TypeORM also manages | Schema drift | Only one ORM should own each table's schema |
| TypeORM `synchronize` drops renamed tables | Data loss | Ensure `synchronize: false` |
| Both ORMs auto-migrate on deploy | Race condition | Serialize migration execution |
| Naming convention mismatch (snake_case vs camelCase) | Query confusion | Standardize on snake_case for DB names |

---

## 8. Stage 7 — Database Analysis

### Storage Impact

| Rename Target | Est. Rows (current) | Row Size Impact | Storage Delta |
|---|---|---|---|
| `playlist_items` | <100 | Minimal (junction) | +0 KB |
| `playlist_media` | <100 | +200B per row (denormalized) | +20 KB |
| `user_stream_urls` | <50 | Minimal | +0 KB |
| `content_stream_defs` | <50 | +100B per row | +5 KB |
| `generic_upload_jobs` | <50 | Minimal | +0 KB |
| `youtube_upload_jobs` | <50 | +300B per row (retry fields) | +15 KB |

**Total storage delta: ~40 KB** — negligible for a ~49-user system.

### Index Impact

Renaming tables does **not** require rebuilding indexes in PostgreSQL. `ALTER TABLE ... RENAME TO` updates the system catalog entries; index definitions are preserved with internal OIDs.

| Operation | Index Rebuild Required | Downtime |
|---|---|---|
| `ALTER TABLE x RENAME TO y` | No | None |
| Add new indexes on renamed tables | Yes (for new indexes) | None (CREATE INDEX CONCURRENTLY) |
| Drop old indexes | No | None |

### Performance

- **VACUUM:** PostgreSQL auto-vacuum handles renamed tables identically to original names. No special considerations.
- **Query planner:** The query planner uses OIDs, not table names. Renames have zero impact on query plans.
- **Migration duration:** `ALTER TABLE RENAME` is metadata-only — executes in <1ms regardless of table size.

### Migration Duration Estimate

| Step | Estimated Duration |
|---|---|
| ALTER TABLE RENAME (3 tables) | <3ms total |
| Update sequences/serials | <1ms each |
| Drizzle schema update + migration | ~2-5 seconds (build time) |
| TypeORM entity update + migration | ~2-5 seconds (build time) |
| **Total deployment time** | **<15 seconds** |

---

## 9. Stage 8 — Shared Identity Compatibility

Doc 08 established that `public.user` (text PK via nanoid) is the canonical identity table. All other tables must reference it via foreign keys.

### Can renamed tables safely reference `public.user.id`?

| Renamed Table | Has FK to user? | FK Column | Compatibility |
|---|---|---|---|
| `playlist_items` (A) | No — junction table | N/A | ✅ No conflict |
| `playlist_media` (B) | Via `Playlist.owner` | FK→User | ✅ Compatible (UUID FK to text PK handled by Doc 08 pattern) |
| `user_stream_urls` (A) | Yes | `userId` → `user.id` | ✅ Already uses text PK pattern |
| `content_stream_defs` (B) | No | N/A | ✅ No user reference |
| `generic_upload_jobs` (A) | Yes | `userId` → `user.id` | ✅ Already uses text PK pattern |
| `youtube_upload_jobs` (B) | Via `videoId` → YoutubeVideo | Indirect user ref | ✅ No direct user FK |

**All 6 renamed tables are compatible with the `public.user` identity resolution from Doc 08.**

### Identity Column Patterns

Project A uses `userId` (text, matching `public.user.id`). Project B uses UUID-based `userId` columns. For renamed tables:

- **Project A tables:** Already reference `public.user.id` (text). No change needed.
- **Project B tables:** Reference user via UUID-based FKs. These must be updated to reference `public.user.id` (text) via the `uuid_id` bridge column pattern from Doc 08.

---

## 10. Stage 9 — Security Review

### Authorization

| Concern | Risk Level | Mitigation |
|---|---|---|
| Row-level security (RLS) policies reference old table names | **HIGH** | Update all RLS policies to reference renamed tables |
| API middleware checks table ownership by name | **MEDIUM** | Audit all authorization middleware for table name references |
| Project B's role-based access (Owner/Editor/Viewer) in playlist_members | **LOW** | Unaffected by renames in other tables |

### Role Conflicts

Renaming does not create new role conflicts. The existing dual-auth system (Better Auth for A, Custom JWT for B) operates at the application layer, not the table name layer.

### Permission Drift

| Risk | Description | Mitigation |
|---|---|---|
| GRANT/REVOKE on old table names | PostgreSQL grants are tied to table OIDs, not names. Renames preserve grants. | Verify with `\dp` after rename |
| Application connection strings | If any external tool references old names | Audit connection consumers |

### Audit Concerns

- Audit logs (if any reference table names) must be updated
- Database backup restore procedures should be tested with new table names
- Monitoring dashboards querying specific table names need updates

---

## 11. Stage 10 — Migration Strategy

### Option 1: ALTER TABLE RENAME (Recommended for renames)

```sql
-- Project A tables
ALTER TABLE playlist_content RENAME TO playlist_items;
ALTER TABLE content_streams RENAME TO user_stream_urls;
ALTER TABLE upload_jobs RENAME TO generic_upload_jobs;

-- Project B tables
ALTER TABLE playlist_content RENAME TO playlist_media;
ALTER TABLE content_streams RENAME TO content_stream_defs;
ALTER TABLE upload_jobs RENAME TO youtube_upload_jobs;
```

**Note:** Cannot rename both simultaneously since they share the same current name. Must rename one, then the other, or rename one and create the second fresh.

### Option 2: Create Fresh + Data Copy

For HARD conflicts where both schemas are fundamentally different:

1. Rename Project A's table to new name
2. Create Project B's table fresh with its intended name
3. No data copy needed (different tables, different data)

This is the **recommended approach** for the 3 HARD conflicts.

### Rollback Plan

| Step | Forward | Rollback |
|---|---|---|
| 1 | Rename A's table | Rename back to original |
| 2 | Create B's table | DROP the new table |
| 3 | Update ORM definitions | Revert ORM definitions |
| 4 | Deploy | Redeploy previous version |

**Rollback window:** Must be completed before Phase 6+ point of no return.

### Downtime

- `ALTER TABLE RENAME` is instant (<1ms) — **zero downtime**
- Schema definition updates require application restart — **~5-10 seconds** deployment window
- Both ORMs auto-migrating could cause a brief race — serialize migration execution

---

## 12. Stage 11 — Long-Term Architecture Comparison

### Strategy A: Merge Everything

Merge all conflicting tables into single unified schemas.

| Aspect | Assessment |
|---|---|
| Table count | Minimal (14 conflicts → 0 conflicts) |
| Query complexity | Simple (one table per concept) |
| Schema ownership | Ambiguous (both ORMs claim ownership) |
| Migration complexity | HIGH (column merges, type changes) |
| Risk | HIGH (forced schema compromises for HARD conflicts) |
| Maintenance | LOW (one schema per concept) |

### Strategy B: Rename Everything

Give every conflicting table a unique name.

| Aspect | Assessment |
|---|---|
| Table count | Doubled for conflicts (14 → 28 tables) |
| Query complexity | Higher (JOINs across renamed pairs needed) |
| Schema ownership | Clear (each ORM owns its tables) |
| Migration complexity | LOW (simple renames) |
| Risk | LOW (no schema changes, just names) |
| Maintenance | HIGH (must keep paired tables in sync conceptually) |

### Strategy C: Hybrid (Recommended)

Merge EASY/MODERATE tables, rename HARD tables only.

| Aspect | Assessment |
|---|---|
| Table count | Moderate (8 merged + 6 renamed from 3 HARD conflicts) |
| Query complexity | Moderate (simple for merged, JOINs for renamed) |
| Schema ownership | Clear for renamed, shared for merged |
| Migration complexity | MEDIUM |
| Risk | MEDIUM (merges are well-understood, renames are safe) |
| Maintenance | MODERATE |

---

## 13. Stage 12 — Decision Matrix

| Table | Merge | Rename | Keep Separate | Recommended | Confidence |
|---|---|---|---|---|---|
| `linked_accounts` | ✅ Easy superset merge | ❌ Unnecessary | ❌ Same concept | **MERGE** | 95% |
| `notification_events` | ✅ B is empty shell | ❌ Unnecessary | ❌ Same concept | **MERGE** | 98% |
| `notification_templates` | ✅ B only has name | ❌ Unnecessary | ❌ Same concept | **MERGE** | 98% |
| `newsletter_subscribers` | ✅ B only has email | ❌ Unnecessary | ❌ Same concept | **MERGE** | 98% |
| `youtube_accounts` | ✅ 7 shared cols, +1 diff | ❌ Unnecessary | ❌ Same concept | **MERGE** | 95% |
| `youtube_videos` | ✅ 8 shared cols, +5 diff | ❌ Unnecessary | ❌ Same concept | **MERGE** | 92% |
| `search_histories` | ✅ Minor model diff | ❌ Unnecessary | ❌ Same concept | **MERGE** | 90% |
| `premium_rollups` | ✅ Flexible→Structured | ❌ Unnecessary | ❌ Same concept | **MERGE** | 88% |
| `playlists` | ✅ B is superset | ⚠️ Alternative | ❌ Same concept | **MERGE** | 85% |
| `playlist_members` | ✅ B is superset | ⚠️ Alternative | ❌ Same concept | **MERGE** | 85% |
| `playlist_content` | ⚠️ Forced compromise | ✅ Clean separation | ✅ **Different designs** | **RENAME** | 92% |
| `content_streams` | ⚠️ Forced compromise | ✅ Clean separation | ✅ **Different designs** | **RENAME** | 94% |
| `upload_jobs` | ⚠️ Forced compromise | ✅ Clean separation | ✅ **Different designs** | **RENAME** | 94% |
| `user_topics` | ✅ Adopt B's FK model | ❌ Unnecessary | ⚠️ Could keep | **MERGE** | 88% |
| `profiles` / `manualProfiles` | ⚠️ Different entities | ⚠️ Could rename B | ✅ **Different entities** | **SKIP** | 90% |
| `notification` / `notifications` | ⚠️ Different models | ⚠️ Possible | ⚠️ Could merge | **INVESTIGATE** | 70% |
| `analytics_event` / `analyticsEvents` | ✅ Same concept | ❌ Unnecessary | ❌ Same concept | **MERGE** | 92% |
| `user_contents` / `userContents` | ✅ Nearly identical | ❌ Unnecessary | ❌ Same concept | **MERGE** | 95% |

### Summary Counts

| Decision | Count | Tables |
|---|---|---|
| **MERGE** | 12 | linked_accounts, notification_events, notification_templates, newsletter_subscribers, youtube_accounts, youtube_videos, search_histories, premium_rollups, playlists, playlist_members, user_topics, user_contents/analytics_events |
| **RENAME** | 3 | playlist_content (×2 names), content_streams (×2 names), upload_jobs (×2 names) |
| **SKIP** | 1 | profiles vs manualProfiles (different entities) |
| **INVESTIGATE** | 1 | notification vs notifications (defer to Doc 11) |

---

## 14. Stage 13 — Naming Standards

### Domain-Driven Naming Convention

All table names should follow: `{domain}_{entity}` in snake_case.

| Domain | Prefix | Examples |
|---|---|---|
| Identity | `user_` | `user_profiles`, `user_topics`, `user_contents` |
| Playlist | `playlist_` | `playlists`, `playlist_members`, `playlist_items`, `playlist_media` |
| YouTube | `youtube_` | `youtube_accounts`, `youtube_videos`, `youtube_upload_jobs` |
| Notification | `notification_` | `notification_events`, `notification_templates`, `notifications` |
| Upload | `upload_` | `upload_jobs` (generic), `youtube_upload_jobs` (specific) |
| Analytics | `analytics_` | `analytics_events` |
| Content | `content_` | `content_streams` (definitions), `user_stream_urls` (user-owned) |
| Subscription | `newsletter_` | `newsletter_subscribers` |
| Premium | `premium_` | `premium_rollups` |
| Search | `search_` | `search_histories` |

### Naming Rules

1. **snake_case** for all PostgreSQL table and column names
2. **Plural nouns** for entity tables: `playlists`, `users`, `notifications`
3. **Singular for junction tables** with role: `playlist_member` (preferred) or `playlist_members` (acceptable)
4. **Prefix with domain** when concept could be ambiguous: `youtube_upload_jobs` vs `upload_jobs`
5. **Avoid abbreviations** unless universally understood: `url` is OK, `yt` is not
6. **BaseEntity columns** use snake_case: `created_on` not `createdOn`

---

## 15. Stage 14 — Future Compatibility

### Microservices Extraction

| Renamed Table | Extraction Path | Impact |
|---|---|---|
| `playlist_items` / `playlist_media` | Playlist service | Clean separation makes extraction trivial |
| `user_stream_urls` | Stream service | Already user-scoped, easy to extract |
| `content_stream_defs` | Content service | No user dependency, clean extraction |
| `generic_upload_jobs` | Upload service | Generic, portable |
| `youtube_upload_jobs` | YouTube integration service | Platform-specific, clean extraction |

**Rename benefits for microservices:** Unique table names mean each service can own its tables without naming collisions when eventually split into separate databases.

### Service Extraction Readiness

| Pattern | Merged Tables | Renamed Tables |
|---|---|---|
| Database-per-service | Requires data migration | Tables already unique — just grant access |
| Shared database | Works but tight coupling | Loose coupling via table ownership |
| Event sourcing | Complex (shared event log) | Easy (independent event streams) |

### Analytics / Data Warehouse

Unique table names simplify:
- ETL pipeline configuration (no ambiguity in table references)
- Data warehouse schema mapping
- Analytics event routing (each table maps to one domain)

### Multi-Tenant

Renamed tables with domain prefixes (`playlist_media`, `youtube_upload_jobs`) are easier to namespace for multi-tenant:
- `tenant_1.playlist_media`
- `tenant_1.youtube_upload_jobs`

Merged tables would require tenant_id columns added retroactively.

---

## 16. Resource Analysis

### PostgreSQL Storage

| Metric | Merged Approach | Renamed Approach | Delta |
|---|---|---|---|
| Total tables | ~35 | ~41 | +6 tables |
| Total rows | ~500 | ~500 | 0 |
| Storage | ~2 MB | ~2.04 MB | +40 KB |
| Index count | ~50 | ~56 | +6 indexes |
| Index storage | ~500 KB | ~530 KB | +30 KB |

### CPU / RAM

| Metric | Merged | Renamed | Notes |
|---|---|---|---|
| Shared buffers | Same | Same | Tables too small to affect buffer pool |
| Query planning | Negligible difference | Negligible difference | Planner uses OIDs, not names |
| Connection pool | Same | Same | No impact |

### Migration Duration

| Phase | Merged | Renamed |
|---|---|---|
| Schema changes | 5-10 min (column additions) | <1 min (renames) |
| Data migration | 0-5 min (if needed) | 0 min |
| Application deploy | 1-2 min | 1-2 min |
| Verification | 5-10 min | 5-10 min |
| **Total** | **15-30 min** | **10-15 min** |

### Development Effort

| Task | Merged | Renamed |
|---|---|---|
| Schema design | 4-8 hours | 1-2 hours |
| Migration scripts | 8-16 hours | 2-4 hours |
| ORM updates | 4-8 hours | 3-6 hours |
| Query updates | 2-4 hours | 4-8 hours |
| Testing | 8-16 hours | 4-8 hours |
| **Total** | **26-52 hours** | **14-28 hours** |

### Maintenance Burden (Annual)

| Factor | Merged | Renamed |
|---|---|---|
| Schema evolution | Single schema to maintain | Paired schemas to keep aligned |
| Documentation | One table per concept | Two tables per concept (for renamed) |
| Onboarding | Simpler (fewer tables) | More complex (understand naming) |
| Bug surface | Smaller | Larger (sync issues) |

---

## 17. Risks and Mitigations

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Migration creates orphaned tables if deploy fails mid-way | HIGH | LOW | Atomic migration scripts with rollback; test in staging |
| Drizzle auto-migration re-creates old table names | HIGH | MEDIUM | Update schema definitions before deploy; verify `POSTGRES_MIGRATIONS_RUN` behavior |
| TypeORM synchronize drops renamed tables | CRITICAL | LOW | Ensure `synchronize: false` in production |
| RLS policies break on renamed tables | HIGH | MEDIUM | Audit all RLS policies; update in same migration |
| Application code references old table names in raw queries | MEDIUM | MEDIUM | Grep for table names across codebase before deploy |
| Dual-write to old and new names during rolling deploy | MEDIUM | LOW | Blue-green deploy; instant switchover |
| Rename triggers foreign key constraint errors | HIGH | LOW | Check all inbound FKs before rename; rename referencing tables first |
| Backup/restore procedures reference old names | LOW | LOW | Update runbooks; test restore after migration |

---

## 18. Final Recommendation

### Recommended Strategy: Hybrid (Strategy C)

**Merge 12 tables, Rename 3 HARD-conflict tables, Skip 1 pair.**

| Action | Tables | Rationale |
|---|---|---|
| **MERGE** | linked_accounts, notification_events, notification_templates, newsletter_subscribers, youtube_accounts, youtube_videos, search_histories, premium_rollups, playlists, playlist_members, user_topics, user_contents/analytics_events | Same business concept; one schema is superset; merge is straightforward |
| **RENAME** | playlist_content (→ `playlist_items` + `playlist_media`), content_streams (→ `user_stream_urls` + `content_stream_defs`), upload_jobs (→ `generic_upload_jobs` + `youtube_upload_jobs`) | Fundamentally different designs; renaming avoids forced compromises |
| **SKIP** | profiles vs manualProfiles | Different entities entirely; no conflict to resolve |

### Why Not Pure Rename?

Pure rename (Strategy B) is simpler in the short term but creates a maintenance burden: paired tables that represent the same domain concept but exist separately. Over time, these drift apart, creating inconsistency. Merging where possible is the architecturally cleaner path.

### Why Not Pure Merge?

Pure merge (Strategy A) forces schema compromises on HARD conflicts. `playlist_content` as a junction table cannot accommodate `PlaylistContent`'s denormalized model without breaking normalization or breaking self-containment. Renaming is the honest answer for genuinely different designs.

### Next Steps

1. Execute merges for 12 EASY/MODERATE tables (see Doc 09 recommendations)
2. Execute renames for 3 HARD-conflict table pairs (see Stage 10 migration strategy)
3. Skip profiles vs manualProfiles (different entities)
4. Defer notification vs notifications to Doc 11
5. Update all ORM definitions, query code, and RLS policies
6. Test in staging with `POSTGRES_MIGRATIONS_RUN=true`
7. Deploy with atomic migration + rollback plan
