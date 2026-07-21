# 11 — Domain-Specific Table Rename Analysis: 12-Stage Comprehensive Report

> **Date:** 2026-07-20
> **Status:** Final
> **Depends on:** Doc 08 (Identity Resolution), Doc 09 (Table Comparison), Doc 10 (Rename Strategy Investigation)
> **Scope:** Whether completely renaming business-specific tables (instead of merging) is the safest, lowest-risk approach for allowing Project A and Project B to coexist on a single PostgreSQL database
> **Type:** Read-only analysis — no code or migrations

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Stage 1 — Complete Conflict Discovery](#2-stage-1--complete-conflict-discovery)
3. [Stage 2 — Safe Tables (No Rename Needed)](#3-stage-2--safe-tables-no-rename-needed)
4. [Stage 3 — Rename Candidates with Domain-Driven Names](#4-stage-3--rename-candidates-with-domain-driven-names)
5. [Stage 4 — Dependency Analysis for Every Candidate](#5-stage-4--dependency-analysis-for-every-candidate)
6. [Stage 5 — Shared User Compatibility](#6-stage-5--shared-user-compatibility)
7. [Stage 6 — Minimal Change Analysis](#7-stage-6--minimal-change-analysis)
8. [Stage 7 — Build and Runtime Risk](#8-stage-7--build-and-runtime-risk)
9. [Stage 8 — Naming Strategy](#9-stage-8--naming-strategy)
10. [Stage 9 — Never-Rename Tables](#10-stage-9--never-rename-tables)
11. [Stage 10 — Resource Analysis](#11-stage-10--resource-analysis)
12. [Stage 11 — Rename vs Merge vs Hybrid Decision Matrix](#12-stage-11--rename-vs-merge-vs-hybrid-decision-matrix)
13. [Stage 12 — Final Recommendation](#13-stage-12--final-recommendation)

---

## 1. Executive Summary

### 1.1 Purpose

This analysis answers a single question: **For every DB-level table name conflict between Project A and Project B, is it safer and simpler to rename the tables (give each a unique name) rather than merge them into a single unified schema?**

### 1.2 Key Findings

| Finding | Detail |
|---------|--------|
| **DB-level conflicts** | 14 tables share identical PostgreSQL names between the two projects |
| **Project A application code** | **ZERO** references to any of the 18 merger-schema tables. They are defined in Drizzle schema and migrated, but no service/router/handler queries them. |
| **Project B application code** | Active usage of most TypeORM entities — repositories, services, controllers, background processors, raw SQL |
| **Raw SQL risk** | Only 3 tables have raw SQL in Project B: `linkedAccounts`, `userContents`, `contentStreams` (in `general.repository.ts` and `user.repository.ts`) |
| **Rename effort (Project A)** | **Trivial** — change `pgTable("name")` string + migration SQL. No query code to update. |
| **Rename effort (Project B)** | **Low to moderate** — update `@Entity({ name: })` decorator + raw SQL strings. Repository/service code uses TypeORM abstractions, not table names. |

### 1.3 Recommendation

**Hybrid strategy is optimal.** Pure rename for HARD conflicts, merge for EASY/MODERATE conflicts. Renaming all 14 conflicts would add unnecessary complexity; merging the 3 fundamentally different pairs is the right surgical approach.

| Strategy | Total Files Changed | Total Lines Changed | Risk |
|----------|-------------------|-------------------|------|
| Pure Rename (all 14) | ~15-20 files | ~80-120 lines | LOW |
| Pure Merge (all 14) | ~30-50 files | ~300-500 lines | MEDIUM-HIGH |
| **Hybrid (recommended)** | **~20-30 files** | **~150-250 lines** | **LOW-MEDIUM** |

---

## 2. Stage 1 — Complete Conflict Discovery

### 2.1 Methodology

We identify conflicts at the **PostgreSQL table name** level, not the ORM entity name level. Drizzle and TypeORM use different naming conventions — the database is the source of truth.

### 2.2 All DB-Level Name Conflicts (14 tables)

| # | PostgreSQL Table Name | Project A Source | Project B Source | PK Type Conflict |
|---|----------------------|------------------|------------------|-----------------|
| 1 | `linked_accounts` | merger-schema.ts (serial) | LinkedAccount (UUID via BaseEntity) | serial vs UUID |
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
| 14 | `notification` | notification-schema.ts (serial) | Notification (UUID, `notification` schema) | serial vs UUID |

> Note: `user`/`users` excluded — resolved by Doc 08. `analytics_event` excluded — A uses `"analytics_event"`, B uses `"analyticsEvents"` — different DB names, no collision.

### 2.3 Same Business Concept, Different DB Names (no collision, ORM confusion only)

| # | Project A Name | Project B Name | Business Concept |
|---|---------------|---------------|-----------------|
| 15 | `user_topics` | `userTopics` (TypeORM default) | User topic interests |
| 16 | `profiles` | `manualProfiles` | User profile / platform links |
| 17 | `user_contents` | `userContents` (TypeORM default) | User's content items |
| 18 | `analytics_event` | `analyticsEvents` | Analytics tracking |
| 19 | `notification_preference` | (no B equivalent) | Notification channel toggles |

### 2.4 Classification Summary

| Category | Count | Tables | Recommended Path |
|----------|-------|--------|-----------------|
| DB conflict — EASY merge | 8 | linked_accounts, notification_events, notification_templates, newsletter_subscribers, youtube_accounts, youtube_videos, search_histories, premium_rollups | MERGE |
| DB conflict — MODERATE merge | 3 | playlists, playlist_members, playlist_content (partially) | MERGE |
| DB conflict — HARD (different designs) | 3 | playlist_content, content_streams, upload_jobs | RENAME |
| DB conflict — HARD (active both sides) | 1 | notification | INVESTIGATE |
| No DB conflict | 5 | user_topics, profiles, user_contents, analytics_event, notification_preference | MERGE or SKIP |

---

## 3. Stage 2 — Safe Tables (No Rename Needed)

These tables have **no DB-level name conflict** and need no action:

### 3.1 Project A Only (No B Equivalent) — Zero Risk

All 55+ Project A domain tables (jobs, projects, contracts, bounties, community, career memory, etc.) exist only in the `public` schema with Drizzle definitions. Project B has no equivalent entities. **No conflict, no action.**

Key categories:
- Auth tables: `user`, `session`, `account`, `verification`, `passkey`, `user_id_mapping`
- Job tables: `job_seeker_profile`, `freelancer_profile`, `business_profile`, `opportunity`, `application`
- Project tables: `project`, `proposal`, `dispute`, `milestone`, `time_entry`
- Contract tables: `contract`
- Notification tables: `notification_preference`, `conversation`, `conversation_participant`, `message`, `outreach_unsubscribe`
- Community tables: `community`, `community_member`, `community_post`, `community_event`, etc.
- All other domain tables: `activity_feed`, `audit_log`, `bounty`, `journal_entry`, `cofounder_listing`, etc.

### 3.2 Project B Only (No A Equivalent) — Zero Risk

All 18 Project B-only entities exist only in TypeORM with no Drizzle counterpart:
- RBAC: `UserClaim`, `Role`, `UserRole`, `RoleClaim`
- Infrastructure: `RateLimit`, `RateLimitLog`, `DataProtectionKey`
- YouTube Analytics: `YoutubeAnalytic`, `YoutubeChannelAnalytics`, `YoutubeVideoAnalytics`
- Facebook Analytics: `FacebookPageAnalytics`, `FacebookPostAnalytics`, `FacebookVideoAnalytics`
- Identity: `UserBiometric`, `UserFollow`, `UserPreference`
- Other: `Topic`, `PublishJob`, `ManualProfile`

### 3.3 Same Concept, Different DB Names (Merge, Not Rename)

These have no DB collision — they coexist peacefully today. Merging eliminates conceptual confusion:

| Pair | Recommendation | Rationale |
|------|---------------|-----------|
| `user_topics` (A) / `userTopics` (B) | MERGE to `user_topics` | A is canonical (text PK, FK→user). B adds FK→Topic. Adopt A's table, B adapts. |
| `user_contents` (A) / `userContents` (B) | MERGE to `user_contents` | ~10 shared columns. B adds `tags`, `metaData`. Add B's extras to A. |
| `analytics_event` (A) / `analyticsEvents` (B) | MERGE to `analytics_event` | Same concept. Rename B's `eventName`→`event`. Add A's indexes to B. |
| `profiles` (A) / `manualProfiles` (B) | SKIP | Completely different entities. `profiles` = user profile card. `manualProfiles` = platform link list. No merge needed. |

---

## 4. Stage 3 — Rename Candidates with Domain-Driven Names

### 4.1 Tables Recommended for Rename (3 HARD-conflict pairs)

These tables represent **fundamentally different data models** despite sharing the same PostgreSQL table name. Merging would force schema compromises.

#### `playlist_content` — Junction Table vs Denormalized Content

| Aspect | Project A | Project B |
|--------|-----------|-----------|
| **Design** | Pure junction: `playlistId + contentId + position` | Denormalized: stores `type`, `platform`, `contentUrl`, `title`, `description`, `thumbnailUrl`, `metadata` |
| **FK** | `contentId` → `user_contents.id` (FK reference) | No FK to `user_contents` |
| **Purpose** | Links existing content to playlists | Stores content inline within playlist |

**Proposed names:**

| Project | Current Name | New Name | Domain Reasoning |
|---------|-------------|----------|-----------------|
| A | `playlist_content` | `playlist_items` | A is a junction/linking table — "items" reflects the linking role |
| B | `playlist_content` | `playlist_media` | B stores actual media/content data — "media" reflects the content type |

#### `content_streams` — User URLs vs Content Definitions

| Aspect | Project A | Project B |
|--------|-----------|-----------|
| **Design** | User-owned stream URLs: `userId`, `streamUrl`, `name`, `isActive` | Categorized stream definitions: `type` (Profile/Content/Community), `subType`, `externalId`, `title`, `platform`, `metaData` |
| **FK** | `userId` → `user.id` | No user FK |
| **Purpose** | User's streaming endpoint URLs | Content classification/categorization system |

**Proposed names:**

| Project | Current Name | New Name | Domain Reasoning |
|---------|-------------|----------|-----------------|
| A | `content_streams` | `user_stream_urls` | A stores user-owned URL endpoints — name is explicit |
| B | `content_streams` | `content_stream_defs` | B defines content stream categories — "defs" reflects definition vs instance |

#### `upload_jobs` — Generic Upload vs YouTube-Specific with Retry

| Aspect | Project A | Project B |
|--------|-----------|-----------|
| **Design** | Generic upload: `type`, `status`, `sourceUrl`, `result` (jsonb). User-owned. | YouTube-specific with retry: `videoId`, `attempts`, `progress`, `statusMessage`, `lastError`, `nextRetryAt`, `r2Key`, `fileSize`. Not user-owned. |
| **FK** | `userId` → `user.id` | `videoId` → YoutubeVideo |
| **Purpose** | Generic upload tracking | YouTube upload pipeline with retry logic |

**Proposed names:**

| Project | Current Name | New Name | Domain Reasoning |
|---------|-------------|----------|-----------------|
| A | `upload_jobs` | `user_upload_jobs` | A is user-owned generic uploads — "user_" prefix clarifies ownership |
| B | `upload_jobs` | `youtube_upload_jobs` | B is YouTube-specific — platform prefix clarifies scope |

### 4.2 The `notification` Table — Special Case

| Aspect | Project A | Project B |
|--------|-----------|-----------|
| **Table name** | `notification` | `notification` (in `notification` schema) |
| **PK** | serial | UUID |
| **Columns** | id, userId, type (text), title, message, link, isRead (boolean), createdAt | id (UUID), metaData (json), type (NotificationType enum), title, body, notifyId (uuid), isLive, sound, readAt (timestamp), + BaseEntity cols |
| **Active usage** | YES — `createNotification()` called by 5+ tRPC routers | YES — 40+ files via service, repository, gateway, processors |

**This is the only table where both projects have active application code referencing it.** Renaming requires coordinated changes across both codebases.

**Recommended approach:** Investigate deeper — see Stage 4 dependency analysis.

### 4.3 Proposed Domain-Driven Name Map

| Current Name | Project | Proposed Name | Naming Convention |
|-------------|---------|--------------|-------------------|
| `playlist_content` | A | `playlist_items` | `{domain}_{entity}` — junction table |
| `playlist_content` | B | `playlist_media` | `{domain}_{entity}` — content storage |
| `content_streams` | A | `user_stream_urls` | `{scope}_{entity}` — user-owned |
| `content_streams` | B | `content_stream_defs` | `{domain}_{entity}_defs` — definitions |
| `upload_jobs` | A | `user_upload_jobs` | `{scope}_{entity}` — user-owned |
| `upload_jobs` | B | `youtube_upload_jobs` | `{platform}_{entity}` — platform-specific |
| `notification` | A | `notifications` | Pluralize (standard) |
| `notification` | B | `user_notifications` | `{scope}_{entity}` — user-specific |

---

## 5. Stage 4 — Dependency Analysis for Every Candidate

### 5.1 Critical Discovery: Project A Merger-Schema Tables Are DEAD CODE

**None of the 18 merger-schema tables in Project A (gaddr-jobs) have any application code references.**

Every table follows the same pattern:
1. **Schema definition** in `merger-schema.ts`
2. **Re-export** in `schema.ts` (line 37: `export * from "./merger-schema"`)
3. **Indirect availability** via the `db` client in `db/index.ts`
4. **SQL migrations** that create the tables

**No files perform any of the following:**
- Named imports of individual tables
- `db.select().from(tableName)` queries
- `db.insert(tableName)` inserts
- Raw SQL referencing these table names
- Type-only usage (`typeof tableName`)

**Impact:** Renaming any merger-schema table in Project A requires changing only:
1. The `pgTable("name")` string in `merger-schema.ts` (1 line per table)
2. The migration SQL (1 `ALTER TABLE RENAME` per table)
3. **Zero query code changes**

### 5.2 Per-Table Dependency Map — Project A (Drizzle)

| Table | Schema File | Query Code | Raw SQL | Total Files to Change |
|-------|------------|------------|---------|----------------------|
| `linked_accounts` | merger-schema.ts:66 | NONE | NONE | 1 (schema only) |
| `notification_events` | merger-schema.ts:94 | NONE | NONE | 1 |
| `notification_templates` | merger-schema.ts:102 | NONE | NONE | 1 |
| `newsletter_subscribers` | merger-schema.ts:110 | NONE | NONE | 1 |
| `playlists` | merger-schema.ts:140 | NONE | NONE | 1 |
| `playlist_members` | merger-schema.ts:150 | NONE | NONE | 1 |
| `playlist_content` | merger-schema.ts:163 | NONE | NONE | 1 |
| `youtube_accounts` | merger-schema.ts:198 | NONE | NONE | 1 |
| `youtube_videos` | merger-schema.ts:209 | NONE | NONE | 1 |
| `content_streams` | merger-schema.ts:224 | NONE | NONE | 1 |
| `upload_jobs` | merger-schema.ts:236 | NONE | NONE | 1 |
| `search_histories` | merger-schema.ts:246 | NONE | NONE | 1 |
| `premium_rollups` | merger-schema.ts:254 | NONE | NONE | 1 |
| `notification` | notification-schema.ts:51 | **YES** — 6 files import/use | **YES** — raw SQL in notifications.ts | **~8 files** |

**The `notification` table is the ONLY Project A table with active application code.** All others are schema-only definitions.

### 5.3 Per-Table Dependency Map — Project B (TypeORM)

#### Tables with HEAVY active usage

| Table | Entity Files | Repository | Services | Handlers | Processors | Modules | Raw SQL |
|-------|-------------|------------|----------|----------|------------|---------|---------|
| `linkedAccounts` | linkedAccount.entity.ts | ILinkedAccountRepository (GeneralRepository) | search, youtubeAnalytics, youtubeImports, twitter-import, queue | — | 12 import processors + rollback listener | 5 modules | **YES** (2 queries in general.repository.ts, user.repository.ts) |
| `userContents` | userContent.entity.ts | IUserContentRepository (GeneralRepository) | facebookAnalytics, youtubeAnalytics, platform-disconnect, pinterest-import, facebook-import, search | — | 8 import processors + rollback + content-import listeners | 3 modules | **YES** (2 queries in general.repository.ts, user.repository.ts) |
| `contentStreams` | contentStream.entity.ts | IContentStreamRepository (GeneralRepository) | search, platform-disconnect, youtube-imports | — | 8 import processors + rollback listener | 2 modules | **YES** (3 queries in general.repository.ts: check + bulk insert) |
| `notifications` | notification.entity.ts | INotificationRepository | NotificationService, NotificationGateway | 11 cancel-import handlers, profile-image handler | 10 import processors | notification.module + 5 importing modules | NO |
| `analyticsEvents` | analyticsEvent.entity.ts | IAnalyticsRepository | AnalyticsService | get-weekly-stats, search, login, register, update-profile-image | premiumRollup cron | analytics.module | NO |

#### Tables with MODERATE active usage

| Table | Entity | Repository | Services/Handlers | Raw SQL |
|-------|--------|------------|-------------------|---------|
| `youtube_accounts` | YoutubeAccount | IYoutubeAccountRepository | youtubeAnalytics, youtube-publishing, oauth, disconnect, connect, analytics handlers, youtube-upload processor | NO |
| `youtube_videos` | YoutubeVideo | IYoutubeVideoRepository | youtube-publishing, upload-status, disconnect, analytics handlers, youtube-upload processor | NO |
| `searchHistories` | SearchHistory | ISearchHistoryRepository | search handler + 12 platform-specific search handlers | NO |
| `premiumRollups` | PremiumRollup | IPremiumRollupRepository | premiumRollup cron, get-weekly-stats handler | NO |
| `playlists` | Playlist | IPlaylistRepository | create, get, delete playlist handlers, discover-creators | NO |
| `playlistMembers` | PlaylistMember | IPlaylistRepository | add-member, remove-member handlers, discover-creators | NO |
| `playlistContent` | PlaylistContent | IPlaylistRepository | add-content, remove-content, bookmark handlers | NO |
| `upload_jobs` | UploadJob | IUploadJobRepository | youtube-upload processor, upload-status, youtube-upload, chunk-upload, retry-upload, disconnect, upload-video, publish-content handlers | NO |

#### Tables with LIGHT/NO active usage

| Table | Entity | Actual Usage | Raw SQL |
|-------|--------|-------------|---------|
| `newsletter_subscribers` | NewsletterSubscriber | subscribe handler only | NO |
| `userTopics` | UserTopic | onboarding step2/step4 handlers only | NO |
| `notificationEvents` | NotificationEvent | **STUB** — entity registered in module but NO repository implementation, NO service, NO handler uses it | NO |
| `notificationTemplates` | NotificationTemplate | **STUB** — entity registered in module but NO repository, NO service, NO handler uses it | NO |

### 5.4 Raw SQL Risk Assessment

Only 3 tables have raw SQL queries in application code:

| Table | File | SQL Pattern | Rename Impact |
|-------|------|------------|---------------|
| `linkedAccounts` | general.repository.ts:32 | `SELECT "externalId", "platform" FROM "linkedAccounts"` | Update table name string (1 line) |
| `linkedAccounts` | user.repository.ts:389-390 | `FROM "linkedAccounts" la WHERE la."userId" = ...` (2 subqueries) | Update table name string (2 lines) |
| `userContents` | general.repository.ts:34 | `SELECT "externalId", "platform" FROM "userContents"` | Update table name string (1 line) |
| `userContents` | user.repository.ts:391 | `SELECT COUNT(*) FROM "userContents" uc WHERE uc."userId" = ...` | Update table name string (1 line) |
| `contentStreams` | general.repository.ts:30,53,55 | `FROM "contentStreams"` (check) + `INSERT INTO "contentStreams"` (bulk) | Update table name string (3 lines) |

**Total raw SQL lines requiring changes: 8 lines across 2 files.**

---

## 6. Stage 5 — Shared User Compatibility

### 6.1 The User Table Resolution (Doc 08)

Doc 08 established:
- `public.user` (text PK via nanoid) is the canonical identity table
- Both projects read from `public.user`
- Project B adds `uuid_id UUID` column for FK resolution
- Both auth systems stay independent (Better Auth + Custom JWT)

### 6.2 FK Compatibility for Rename Candidates

| Renamed Table | Has FK to user? | FK Column | PK Type | Compatible? |
|--------------|----------------|-----------|---------|-------------|
| `playlist_items` (A) | No — junction table | N/A | serial | ✅ No user FK |
| `playlist_media` (B) | Via Playlist.owner | FK→User | UUID | ✅ Via `uuid_id` bridge |
| `user_stream_urls` (A) | Yes | `userId` → `user.id` | serial | ✅ Already text FK |
| `content_stream_defs` (B) | No | N/A | UUID | ✅ No user FK |
| `user_upload_jobs` (A) | Yes | `userId` → `user.id` | serial | ✅ Already text FK |
| `youtube_upload_jobs` (B) | Via videoId → YoutubeVideo | Indirect | UUID | ✅ No direct user FK |

**All rename candidates are compatible with the `public.user` identity resolution.**

### 6.3 Schema Location Considerations

| Project | Current Schema | Rename Impact |
|---------|---------------|---------------|
| A (all merger tables) | `public` | None — stays in `public` |
| B (notification entities) | `notification` | If renaming `notification` → `user_notifications`, update `@Entity({ schema: 'notification', name: 'user_notifications' })` |

---

## 7. Stage 6 — Minimal Change Analysis

### 7.1 If We Rename All 14 Conflicts

| Component | Project A Changes | Project B Changes |
|-----------|------------------|------------------|
| Schema definitions | 14 pgTable name strings in merger-schema.ts | 14 @Entity decorator name strings |
| Migration SQL | 14 ALTER TABLE RENAME statements | 0 (TypeORM entity change is sufficient with synchronize:false) |
| Query code | **0** (no queries exist) | **0** (TypeORM uses abstractions, not table names) |
| Raw SQL | **0** | **8 lines** across 2 files (linkedAccounts, userContents, contentStreams) |
| Module registrations | **0** | **0** (TypeORM modules reference entity classes, not table names) |
| **Total** | **~15 lines** (14 schema + 1 migration) | **~22 lines** (14 entity decorators + 8 raw SQL) |

**Total: ~37 lines of changes across ~16 files.**

### 7.2 If We Merge All 14 Conflicts

| Component | Project A Changes | Project B Changes |
|-----------|------------------|------------------|
| Schema definitions | Add missing columns to 14 pgTable definitions | Adapt 14 TypeORM entities to match merged schema |
| Migration SQL | 14 ALTER TABLE ADD COLUMN statements (varies 2-6 cols each) | 0 |
| Query code | **0** | May need updates if column names change |
| Raw SQL | **0** | May need updates if column types change |
| Entity alignment | N/A | 14 entity files may need column additions/removals |
| **Total** | **~50-100 lines** | **~30-80 lines** |

**Total: ~80-180 lines across ~30-50 files.**

### 7.3 Hybrid Approach (Recommended)

| Action | Tables | Project A | Project B | Total |
|--------|--------|-----------|-----------|-------|
| **MERGE** (8 EASY) | linked_accounts, notification_events, notification_templates, newsletter_subscribers, youtube_accounts, youtube_videos, search_histories, premium_rollups | 0 (dead code) | ~20 lines (add missing columns to entities) | ~20 lines |
| **MERGE** (3 MODERATE) | playlists, playlist_members, user_topics | 0 (dead code) | ~15 lines (reconcile schemas) | ~15 lines |
| **RENAME** (3 HARD) | playlist_content, content_streams, upload_jobs | ~4 lines (3 schema + 1 migration) | ~14 lines (3 entity decorators + 8 raw SQL + 3 migration) | ~18 lines |
| **INVESTIGATE** (1) | notification | ~8 lines (6 schema + 2 migration) | ~10 lines (1 entity decorator + 8 raw SQL + 1 migration) | ~18 lines |
| **Total** | **15 tables** | **~12 lines** | **~59 lines** | **~71 lines across ~25 files** |

---

## 8. Stage 7 — Build and Runtime Risk

### 8.1 Build Risk

| Risk | Rename | Merge | Mitigation |
|------|--------|-------|------------|
| TypeScript compilation failure | LOW — simple string changes | MEDIUM — column additions may break types | For rename: test build after each change |
| Drizzle migration runner conflict | MEDIUM — `POSTGRES_MIGRATIONS_RUN=true` may re-create old names | LOW — additive migrations are safe | For rename: use raw SQL migration, update schema definition in same deploy |
| TypeORM synchronize dropping data | LOW — `synchronize: false` in production | LOW | Verify `synchronize: false` is set |
| Module resolution failure | LOW — entity class names don't change | LOW | No import path changes needed |

### 8.2 Runtime Risk

| Risk | Rename | Merge | Mitigation |
|------|--------|-------|------------|
| Table not found at runtime | LOW — schema change + migration are atomic | LOW | Test with `POSTGRES_MIGRATIONS_RUN=true` in staging |
| FK constraint violation | LOW — renames preserve FKs (PostgreSQL updates OID references) | MEDIUM — new FKs may reference non-existent data | For merge: validate data before adding NOT NULL constraints |
| Query returns empty results | LOW — same data, different table name | LOW | No data migration needed for renames |
| Raw SQL table name mismatch | **MEDIUM** — 8 raw SQL lines must be updated | LOW — no table name changes | For rename: grep entire codebase for table name strings |
| WebSocket/notification delivery failure | LOW — entity class name unchanged | LOW | Test notification pipeline end-to-end |

### 8.3 Deployment Risk

| Phase | Rename | Merge |
|-------|--------|-------|
| Migration execution | <3ms (ALTER TABLE RENAME is metadata-only) | 5-30s (ALTER TABLE ADD COLUMN per column) |
| Application restart | Required (schema change) | Required (column change) |
| Rollback window | Instant (rename back) | Requires DROP COLUMN |
| Downtime | ~5-10 seconds (restart) | ~5-10 seconds (restart) |
| **Total deployment time** | **<15 seconds** | **<30 seconds** |

---

## 9. Stage 8 — Naming Strategy

### 9.1 Domain-Driven Naming Convention

All table names follow `{domain}_{entity}` in snake_case:

| Domain | Prefix | Convention |
|--------|--------|-----------|
| Playlist | `playlist_` | `playlists`, `playlist_members`, `playlist_items`, `playlist_media` |
| YouTube | `youtube_` | `youtube_accounts`, `youtube_videos`, `youtube_upload_jobs` |
| Content | `content_` / `user_` | `content_stream_defs` (definitions), `user_stream_urls` (user-owned) |
| Upload | `upload_` / `user_` / `youtube_` | `user_upload_jobs` (generic), `youtube_upload_jobs` (platform-specific) |
| Notification | `notification_` / `user_` | `notifications` (A), `user_notifications` (B) |
| Search | `search_` | `search_histories` |
| Analytics | `analytics_` | `analytics_events` |
| Premium | `premium_` | `premium_rollups` |
| Newsletter | `newsletter_` | `newsletter_subscribers` |

### 9.2 Naming Rules

1. **snake_case** for all PostgreSQL table and column names
2. **Plural nouns** for entity tables: `playlists`, `users`, `notifications`
3. **Prefix with domain** when concept could be ambiguous: `youtube_upload_jobs` vs `user_upload_jobs`
4. **Prefix with scope** when ownership matters: `user_stream_urls` (user-owned) vs `content_stream_defs` (system-defined)
5. **Avoid abbreviations** unless universally understood: `url` is OK, `yt` is not
6. **`_defs` suffix** for definition/schema tables: `content_stream_defs`
7. **`_items` suffix** for junction/linking tables: `playlist_items`

### 9.3 Consistency Verification

| Existing Pattern | New Pattern | Consistent? |
|-----------------|-------------|-------------|
| `youtube_accounts` (plural) | `youtube_upload_jobs` (plural) | ✅ |
| `user_contents` (plural) | `user_stream_urls` (plural) | ✅ |
| `playlist_members` (plural) | `playlist_items` (plural) | ✅ |
| `content_streams` (plural) | `content_stream_defs` (plural) | ✅ |
| `upload_jobs` (plural) | `user_upload_jobs` (plural) | ✅ |

---

## 10. Stage 9 — Never-Rename Tables

These tables must NEVER be renamed regardless of conflicts:

| Table | Reason |
|-------|--------|
| `public.user` | Canonical identity table. 113+ FKs reference it. Doc 08 resolution. |
| `session` | Better Auth internal. Framework expects exact name. |
| `account` | Better Auth internal. Framework expects exact name. |
| `verification` | Better Auth internal. Framework expects exact name. |
| `passkey` | Better Auth internal. Framework expects exact name. |
| `roles` | Better Auth RBAC. Framework expects exact name. |
| `user_roles` | Better Auth RBAC. Framework expects exact name. |
| `user_claims` | Better Auth RBAC. Framework expects exact name. |
| `role_claims` | Better Auth RBAC. Framework expects exact name |
| `identity.users` | Project B auth table. Custom JWT reads from it. |
| `identity.roles` | Project B RBAC. Custom JWT authorization depends on it. |
| `identity.userRoles` | Project B RBAC join table. |
| `identity.userClaims` | Project B claims. |
| `identity.roleClaims` | Project B role claims. |

**Rule:** Any table used by an auth framework (Better Auth or Custom JWT) is untouchable.

---

## 11. Stage 10 — Resource Analysis

### 11.1 Development Effort

| Approach | Schema Changes | Migration SQL | Query Code | Raw SQL | Total Files | Total Lines | Estimated Hours |
|----------|---------------|--------------|------------|---------|-------------|-------------|-----------------|
| **Pure Rename (14 tables)** | 14 schema defs (A) + 14 entity decorators (B) | 14 ALTER TABLE RENAME | 0 | 8 lines (B) | ~16 | ~37 | 2-3 hours |
| **Pure Merge (14 tables)** | 14 schema defs (A) + 14 entity defs (B) | 14 ALTER TABLE ADD COLUMN | 0-10 files | 0-5 lines | ~30-50 | ~80-180 | 8-16 hours |
| **Hybrid (recommended)** | 11 schema defs (A) + 17 entity defs (B) | 11 ALTER TABLE + 4 ADD COLUMN | 0 | 8 lines | ~25 | ~71 | 4-8 hours |

### 11.2 PostgreSQL Storage Impact

| Approach | New Tables | Dropped Tables | Net Change | Storage Delta |
|----------|-----------|---------------|------------|---------------|
| Pure Rename | 0 (same tables, new names) | 0 | 0 | 0 KB |
| Pure Merge | 0 | 0 (absorbed) | -7 tables | -100 KB |
| Hybrid | 0 | 0 | 0 | 0 KB |

### 11.3 Migration Duration

| Operation | Duration |
|-----------|----------|
| ALTER TABLE RENAME (14 tables) | <14ms total |
| ALTER TABLE ADD COLUMN (merge) | 5-30 seconds |
| Drizzle schema rebuild | 2-5 seconds |
| Application restart | 5-10 seconds |
| **Total (rename)** | **<15 seconds** |
| **Total (merge)** | **<30 seconds** |
| **Total (hybrid)** | **<20 seconds** |

### 11.4 Testing Effort

| Approach | Unit Tests | Integration Tests | Manual Testing |
|----------|-----------|------------------|----------------|
| Pure Rename | Verify schema builds (automated) | Verify all endpoints work | Test notification pipeline, YouTube upload, playlist CRUD |
| Pure Merge | Verify column additions (automated) | Verify data integrity | Test all merged entity operations |
| Hybrid | Both | Both | Focus on renamed + merged tables |

---

## 12. Stage 11 — Rename vs Merge vs Hybrid Decision Matrix

### 12.1 Per-Table Decision Matrix

| Table | Merge | Rename | Keep Separate | Recommended | Confidence |
|-------|-------|--------|---------------|-------------|------------|
| `linked_accounts` | ✅ EASY superset (B adds 5 cols) | ❌ Unnecessary | ❌ Same concept | **MERGE** | 95% |
| `notification_events` | ✅ B is empty shell | ❌ Unnecessary | ❌ Same concept | **MERGE** | 98% |
| `notification_templates` | ✅ B only has name | ❌ Unnecessary | ❌ Same concept | **MERGE** | 98% |
| `newsletter_subscribers` | ✅ B only has email | ❌ Unnecessary | ❌ Same concept | **MERGE** | 98% |
| `youtube_accounts` | ✅ 7 shared cols, +1 diff | ❌ Unnecessary | ❌ Same concept | **MERGE** | 95% |
| `youtube_videos` | ✅ 8 shared cols, +5 diff | ❌ Unnecessary | ❌ Same concept | **MERGE** | 92% |
| `search_histories` | ✅ Minor model diff | ❌ Unnecessary | ❌ Same concept | **MERGE** | 90% |
| `premium_rollups` | ✅ Flexible→Structured | ❌ Unnecessary | ❌ Same concept | **MERGE** | 88% |
| `playlists` | ✅ B is superset | ⚠️ Alternative | ❌ Same concept | **MERGE** | 85% |
| `playlist_members` | ✅ B is superset | ⚠️ Alternative | ❌ Same concept | **MERGE** | 85% |
| `user_topics` | ✅ Adopt B's FK model | ❌ Unnecessary | ⚠️ Could keep | **MERGE** | 88% |
| `playlist_content` | ⚠️ Forced compromise | ✅ Clean separation | ✅ **Different designs** | **RENAME** | 92% |
| `content_streams` | ⚠️ Forced compromise | ✅ Clean separation | ✅ **Different designs** | **RENAME** | 94% |
| `upload_jobs` | ⚠️ Forced compromise | ✅ Clean separation | ✅ **Different designs** | **RENAME** | 94% |
| `notification` | ⚠️ Different models | ✅ Possible | ⚠️ Could merge | **INVESTIGATE** | 70% |

### 12.2 Summary Counts

| Decision | Count | Tables |
|----------|-------|--------|
| **MERGE** | 11 | linked_accounts, notification_events, notification_templates, newsletter_subscribers, youtube_accounts, youtube_videos, search_histories, premium_rollups, playlists, playlist_members, user_topics |
| **RENAME** | 3 | playlist_content (×2), content_streams (×2), upload_jobs (×2) |
| **INVESTIGATE** | 1 | notification (both projects active) |
| **SKIP** | 1 | profiles vs manualProfiles (different entities) |

### 12.3 Why Not Pure Rename?

Renaming all 14 conflicts would:
- Double the table count for those concepts (14 → 28 tables)
- Create paired tables that must be kept conceptually in sync
- Require JOINs across renamed pairs for any cross-project queries
- Increase long-term maintenance burden
- Be unnecessary for 11 tables where one schema is clearly a superset

**Pure rename is only optimal for the 3 HARD-conflict tables where the designs are fundamentally different.**

### 12.4 Why Not Pure Merge?

Merging all 14 conflicts would:
- Force schema compromises on `playlist_content` (junction vs denormalized)
- Force schema compromises on `content_streams` (user URLs vs definitions)
- Force schema compromises on `upload_jobs` (generic vs YouTube-specific)
- Require 80-180 lines of changes across 30-50 files
- Create risk of data integrity issues during column additions

**Pure merge is only optimal for the 11 EASY/MODERATE tables where one schema is a superset.**

### 12.5 Why Hybrid Wins

| Metric | Pure Rename | Pure Merge | **Hybrid** |
|--------|------------|------------|-----------|
| Tables affected | 14 | 14 | 15 (11 merge + 3 rename + 1 investigate) |
| Files changed | ~16 | ~30-50 | **~25** |
| Lines changed | ~37 | ~80-180 | **~71** |
| Risk level | LOW | MEDIUM-HIGH | **LOW-MEDIUM** |
| Maintenance burden | HIGH (paired tables) | LOW | **MODERATE** |
| Schema compromises | 0 | 3 forced | **0** |
| Deployment time | <15s | <30s | **<20s** |

---

## 13. Stage 12 — Final Recommendation

### 13.1 Recommended Strategy: Hybrid

**MERGE 11 tables, RENAME 3 HARD-conflict tables, INVESTIGATE 1 special case.**

### 13.2 Implementation Priority

#### Phase 1: EASY Merges (8 tables, ~1-2 hours)

| Table | Action | Project A | Project B |
|-------|--------|-----------|-----------|
| `linked_accounts` | Absorb B's 5 extra columns into A's schema | No code changes (dead code) | Add `email`, `externalUrl`, `metaData`, `isVisible`, `allowImport` to LinkedAccount entity |
| `notification_events` | Populate B's empty shell with A's columns | No code changes | Add `notificationId`, `event`, `metadata` to NotificationEvent entity |
| `notification_templates` | Add missing columns to B | No code changes | Add `subjectTemplate`, `bodyTemplate`, `isActive` to NotificationTemplate entity |
| `newsletter_subscribers` | Add missing columns to B | No code changes | Add `userId`, `subscribedAt`, `unsubscribedAt` to NewsletterSubscriber entity |
| `youtube_accounts` | Add `disconnectedAt` to A | No code changes | Add `disconnectedAt` to YoutubeAccount entity |
| `youtube_videos` | Add 5 B-only columns to A | No code changes | Add `publishAt`, `publishedAt`, `youtubeUrl`, `r2Key`, `tags` to YoutubeVideo entity |
| `search_histories` | Adopt B's split query model | No code changes | Add `originalQuery`, `normalizedQuery` to SearchHistory entity |
| `premium_rollups` | Adopt B's structured model | No code changes | Add `weekStartDate`, `totalInteractions`, `topFeatureUsed`, `interactionBreakdown` to PremiumRollup entity |

#### Phase 2: MODERATE Merges (3 tables, ~2-3 hours)

| Table | Action | Project A | Project B |
|-------|--------|-----------|-----------|
| `playlists` | Add `isPublic` and `userId` FK to B's schema | No code changes | Add `isPublic`, `userId` to Playlist entity |
| `playlist_members` | Map role varchar → enum, add timestamps | No code changes | Align role enum values, add `joinedAt`, `removedAt` |
| `user_topics` | Adopt B's FK→Topic model | No code changes | Already has proper FK model |

#### Phase 3: HARD Renames (3 table pairs, ~2-3 hours)

| Table | Action | Project A | Project B |
|-------|--------|-----------|-----------|
| `playlist_content` | A → `playlist_items`, B → `playlist_media` | Change `pgTable("playlist_items")` in merger-schema.ts + migration SQL | Change `@Entity({ name: 'playlist_media' })` + update raw SQL if any |
| `content_streams` | A → `user_stream_urls`, B → `content_stream_defs` | Change `pgTable("user_stream_urls")` + migration SQL | Change `@Entity({ name: 'content_stream_defs' })` + update 3 raw SQL lines in general.repository.ts |
| `upload_jobs` | A → `user_upload_jobs`, B → `youtube_upload_jobs` | Change `pgTable("user_upload_jobs")` + migration SQL | Change `@Entity({ name: 'youtube_upload_jobs' })` |

#### Phase 4: Notification Investigation (~2-4 hours)

| Table | Action |
|-------|--------|
| `notification` | Deep-dive: compare A's 7 columns vs B's 10 columns. Determine if merge is feasible (both projects actively use this table). If merge: unify to single schema with B's richer model. If rename: A → `notifications`, B → `user_notifications`. |

### 13.3 Rollback Plan

| Phase | Forward | Rollback |
|-------|---------|----------|
| Phase 1-2 (merge) | Add columns via ALTER TABLE | DROP COLUMN (if no data) or restore from backup |
| Phase 3 (rename) | ALTER TABLE RENAME + update ORM | ALTER TABLE RENAME back + revert ORM |
| Phase 4 (investigate) | Depends on decision | Revert ORM changes |

**All phases are reversible before Phase 6+ (point of no return from Doc 08).**

### 13.4 Testing Checklist

- [ ] Build succeeds (both projects compile)
- [ ] All existing endpoints return same responses
- [ ] Notification pipeline works end-to-end (create → deliver → mark read)
- [ ] YouTube upload flow works (connect → upload → track status)
- [ ] Playlist CRUD works (create → add members → add content → delete)
- [ ] Content import processors work (all 12 platforms)
- [ ] Search handlers work (all 13 platforms)
- [ ] Analytics tracking works (event creation → weekly rollup)
- [ ] Raw SQL queries in general.repository.ts return correct results
- [ ] User profile stats query in user.repository.ts returns correct counts
- [ ] `POSTGRES_MIGRATIONS_RUN=true` doesn't re-create old table names

---

## Appendix: Quick Reference — Name Change Map

```
CURRENT (DB)          → NEW (A)              → NEW (B)
─────────────────────────────────────────────────────────
playlist_content      → playlist_items       → playlist_media
content_streams       → user_stream_urls     → content_stream_defs
upload_jobs           → user_upload_jobs     → youtube_upload_jobs
notification          → (INVESTIGATE)        → (INVESTIGATE)
linked_accounts       → [MERGE - keep name]  → [MERGE - keep name]
notification_events   → [MERGE - keep name]  → [MERGE - keep name]
notification_templates→ [MERGE - keep name]  → [MERGE - keep name]
newsletter_subscribers→ [MERGE - keep name]  → [MERGE - keep name]
youtube_accounts      → [MERGE - keep name]  → [MERGE - keep name]
youtube_videos        → [MERGE - keep name]  → [MERGE - keep name]
search_histories      → [MERGE - keep name]  → [MERGE - keep name]
premium_rollups       → [MERGE - keep name]  → [MERGE - keep name]
playlists             → [MERGE - keep name]  → [MERGE - keep name]
playlist_members      → [MERGE - keep name]  → [MERGE - keep name]
user_topics           → [MERGE - keep name]  → [MERGE - keep name]
```
