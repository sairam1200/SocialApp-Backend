# 05 — Migration Strategy

**Scope**: Database schema evolution, ORM migration, and data integrity for gaddr-backend-api  
**Stack**: TypeORM 0.3.23 · PostgreSQL 18.4 (Neon serverless) · 4 schemas · 38 entities · 44 existing migrations  
**Deployment**: Google Cloud Run (production) · Render (staging) · Docker (local)  
**Critical constraint**: `POSTGRES_MIGRATIONS_RUN=true` — migrations execute automatically on every application startup

---

## Table of Contents

1. [Current State Assessment](#current-state-assessment)
2. [Phase 0 — Backups & Verification](#phase-0--backups--verification)
3. [Phase 1 — Additive Schema Only](#phase-1--additive-schema-only)
4. [Phase 2 — Data Migration](#phase-2--data-migration)
5. [Phase 3 — Dual Compatibility](#phase-3--dual-compatibility)
6. [Phase 4 — Validation](#phase-4--validation)
7. [Phase 5 — Application Migration](#phase-5--application-migration)
8. [Phase 6 — Monitoring](#phase-6--monitoring)
9. [Phase 7 — Cleanup](#phase-7--cleanup)
10. [Cross-Cutting Concerns](#cross-cutting-concerns)

---

## Current State Assessment

### Known Schema Conflicts (from RESTORE_REPORT.md)

| Table | Conflict | Severity |
|-------|----------|----------|
| `public.upload_jobs` | TypeORM uses UUID PK; Drizzle used serial PK. Column set differs entirely. | Critical |
| `public.youtube_accounts` | TypeORM uses camelCase + UUID PK; Drizzle used snake_case + text PK | Critical |
| `public.youtube_videos` | TypeORM uses UUID PK; Drizzle used integer PK | Critical |
| `public.newsletter_subscribers` | TypeORM uses text PK + snake_case; Drizzle used int PK + camelCase | High |
| `analytics.youtubeChannelAnalytics` | Production missing 10 columns that TypeORM entity defines | High |
| `analytics.youtubeVideoAnalytics` | Production missing 3 columns that TypeORM entity defines | Medium |
| `analytics.analyticsEvents` | Exists in backup, missing in production | Medium |
| `analytics.premiumRollups` | Exists in backup, missing in production | Low |

### Schema Inventory

| Schema | Tables | Purpose |
|--------|--------|---------|
| `identity` | 10 | User management, roles, claims, biometrics, preferences, follows |
| `notification` | 4 | Notifications, events, templates, newsletter subscribers |
| `analytics` | 7 | Facebook/YouTube analytics, events, premium rollups |
| `public` | 21 | Core application: linked accounts, content, playlists, jobs, search, rate limits |

### Infrastructure Dependencies

- **Redis**: BullMQ job queues (14 background processors), session caching, rate limiting
- **Cloudflare R2**: Media/file storage
- **Cloudinary**: Legacy media storage (still referenced in config)
- **Neon pooler**: Connection pooling with SSL (`rejectUnauthorized: false`)
- **Better Auth**: Session management with cross-subdomain cookie support

### Risk Factors

1. **Zero unit tests** — No `.spec.ts` files exist anywhere in `src/`. Regression detection relies entirely on manual testing and E2E smoke tests.
2. **Auto-migration on startup** — `POSTGRES_MIGRATIONS_RUN=true` means every deployment runs pending migrations. A broken migration blocks all instances.
3. **No backup automation** — Only a single manual dump file exists (`neondb_backup_20260717_223225.dump`). No cron, no CI/CD backup steps.
4. **Multi-schema foreign keys** — Queries frequently cross `identity`, `public`, and `analytics` schemas. Schema changes in one domain can break joins in another.
5. **14 BullMQ processors** — Background jobs reference database entities directly. Schema changes must be backward-compatible with in-flight jobs.

---

## Phase 0 — Backups & Verification

### Objective

Establish a recoverable baseline before any schema or data changes begin. Every subsequent phase assumes Phase 0 has been completed and verified.

### Actions

1. **Full database dump** using `pg_dump` in CUSTOM format (compressed, restore-capable)
   - Target: Neon production database (`ep-autumn-paper-ahdjud0j-pooler`)
   - Format: PostgreSQL CUSTOM (matches existing `neondb_backup_20260717_223225.dump`)
   - Include all 4 schemas: `identity`, `notification`, `analytics`, `public`
   - Include extensions: `pg_trgm`, `uuid-ossp`
   - Include sequences, indexes, and constraints

2. **Schema-only dump** for diffing
   - Separate `pg_dump --schema-only` to capture the exact current DDL
   - Store alongside the full dump for comparison after migration

3. **Row count snapshot** across all 42 tables
   - `pg_stat_user_tables` query for `n_live_tup` per table
   - Timestamp the snapshot for before/after comparison

4. **Restore verification**
   - Restore the dump into a temporary Docker PostgreSQL container (port 5433, matching `docker-compose.yml`)
   - Verify table counts match production
   - Verify extension presence (`pg_trgm`, `uuid-ossp`)
   - Verify sequence ownership

5. **Backup storage**
   - Store dumps in a location outside the repository (not committed to git)
   - Minimum retention: 30 days
   - Naming convention: `gaddr_backup_YYYYMMDD_HHMMSS.dump`

6. **Rollback script preparation**
   - Pre-write a rollback SQL script that can restore user emails to placeholder values (per `RESTORE_REPORT.md` pattern)
   - Pre-writeDELETE statements for any tables that will be modified in later phases (to be executed only if rollback is triggered)

### Rollback

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Restore from Phase 0 dump using `pg_restore` |
| **Command** | `pg_restore -d <database> --clean --if-exists <dump_file>` |
| **Duration estimate** | < 60 seconds for 1,226 rows / 42 tables |
| **Pre-condition** | Neon database must be accessible; no concurrent writes during restore |
| **Verification** | Row count snapshot comparison post-restore |

### Risk

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Low — dump and restore are well-understood PostgreSQL operations |
| **Impact** | None — this phase is read-only on production; backup is taken offline |
| **Mitigation** | Verify dump integrity by restoring to a throwaway container before proceeding |

### Downtime

**None.** `pg_dump` acquires a `SHARE LOCK` briefly at the start and end of the dump, but does not block reads or writes on Neon's connection pooler. The application remains fully operational.

### Data Loss Probability

**Zero.** This phase only reads data. No writes, deletes, or schema changes occur.

### Build Verification

- `npm run build` must pass before any migration work begins
- `npm run lint` must pass (ESLint flat config in `eslint.config.js`)
- Confirm `data.source.ts` compiles and DataSource connects to the target database

### ORM Compatibility

- TypeORM 0.3.23 `DataSource` must connect successfully
- Entity loader must resolve all 38 entities from `src/domain/entities/`
- Migration runner must report no pending migrations (all 44 already applied)

---

## Phase 1 — Additive Schema Only

### Objective

Expand the database schema without modifying or removing any existing columns, tables, or constraints. All changes in this phase are purely additive — new tables, new columns (nullable or with defaults), new indexes, new constraints that do not conflict with existing data.

### Actions

1. **Create new TypeORM entities** for any tables that exist in the database but are not yet mapped (e.g., `analytics.analyticsEvents`, `analytics.premiumRollups` if they need entity reconciliation)

2. **Add missing columns** to existing tables where the TypeORM entity defines columns that the database lacks:
   - `analytics.youtubeChannelAnalytics` — 10 missing columns
   - `analytics.youtubeVideoAnalytics` — 3 missing columns
   - All new columns must be nullable or have safe defaults

3. **Create new tables** for planned features (e.g., referral system tables referenced by `addReferralColumns` migration)

4. **Add indexes** for performance (GIN indexes for `pg_trgm` trigram search, B-tree indexes for foreign keys)

5. **Generate migrations** using `npm run migration:generate -- src/infrastructure/migrations/<name>`
   - Review generated SQL before committing
   - Verify `up()` and `down()` methods are both present

6. **Test migration against local Docker Postgres**
   - `docker-compose up -d` to start local PostgreSQL on port 5433
   - `npm run migration:run` to apply
   - `npm run migration:revert` to verify rollback
   - Repeat until both directions work cleanly

7. **Deploy to staging** (Render at `gaddr-backend-api.onrender.com`)
   - Verify migration runs on startup (`POSTGRES_MIGRATIONS_RUN=true`)
   - Verify application boots without errors
   - Verify no existing queries break

### Rollback

| Aspect | Detail |
|--------|--------|
| **Mechanism** | `npm run migration:revert` (TypeORM built-in) |
| **What it undoes** | Drops new tables, removes new columns, drops new indexes |
| **Safety** | Additive-only changes are inherently safe to revert — no data was written to new columns |
| **Duration** | < 5 seconds per migration |
| **Edge case** | If new columns had data written to them during Phase 1 staging testing, revert loses that data |

### Risk

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Low — additive changes cannot break existing queries |
| **Impact** | Low — worst case is a column or index exists that nothing uses |
| **Mitigation** | Nullable columns only; no `NOT NULL` without defaults; review every generated migration SQL |

### Downtime

**Zero.** `ALTER TABLE ADD COLUMN` in PostgreSQL 18.4 is a metadata-only operation for nullable columns (no table rewrite). Index creation uses `CREATE INDEX CONCURRENTLY` where possible.

### Data Loss Probability

**Zero.** No existing data is modified. New columns start empty or with defaults.

### Build Verification

- `npm run build` — TypeScript compilation must pass with new entities
- `npm run lint` — ESLint must pass
- `npm run test` — Jest must pass (currently zero tests, but the command must not error)
- `npm run migration:run` — must execute without errors on local Docker Postgres
- `npm run migration:revert` — must execute without errors on local Docker Postgres

### ORM Compatibility

- TypeORM entity metadata must match the new database schema exactly
- `migration:generate` must produce zero-diff after applying the migration (confirms entity-to-schema alignment)
- `synchronize: false` in production — schema is managed exclusively through migrations, never through TypeORM auto-sync
- Verify `entities` path resolution in `data.source.ts` picks up new entity files

---

## Phase 2 — Data Migration

### Objective

Transform existing data to match the target schema. This includes renaming columns, changing primary key types, migrating data between schemas, and resolving the Drizzle/TypeORM inconsistencies documented in `RESTORE_REPORT.md`.

### Actions

1. **Plan each data migration as a numbered script** stored in `src/infrastructure/migrations/` following the existing naming convention (`<timestamp>-<PascalCase-description>.ts`)

2. **Primary key type migrations** (highest risk — affects all foreign keys):
   - `public.upload_jobs`: Convert serial PK to UUID PK (generate UUIDs for existing rows, update all FK references)
   - `public.youtube_accounts`: Convert text PK to UUID PK
   - `public.youtube_videos`: Convert integer PK to UUID PK
   - `public.newsletter_subscribers`: Convert integer PK to text/UUID PK

3. **Column naming migrations**:
   - `public.youtube_accounts`: Rename snake_case columns to camelCase (TypeORM convention)
   - `public.youtube_videos`: Rename snake_case columns to camelCase

4. **Schema migration** (moving tables between PostgreSQL schemas):
   - `public.newsletter_subscribers` → `notification.newsletter_subscribers` (align with TypeORM entity which declares `schema: 'notification'`)
   - Verify all application queries are updated to use the new schema-qualified table name

5. **Data transformation scripts**:
   - Each migration must use `queryRunner.query()` with raw SQL
   - All INSERT/UPDATE operations must use transactions (`queryRunner.startTransaction()` / `commitTransaction()`)
   - All migrations must have complete `down()` methods for rollback

6. **Staging validation**:
   - Deploy each data migration to staging first
   - Verify row counts before and after
   - Verify foreign key integrity (`SELECT` queries checking for orphaned references)
   - Verify application functionality (auth, content display, analytics dashboards)

### Rollback

| Aspect | Detail |
|--------|--------|
| **Mechanism** | `npm run migration:revert` for schema rollback; restore from Phase 0 dump for data rollback |
| **Complexity** | High — data migrations are difficult to reverse perfectly |
| **Best practice** | Write every `down()` method as the exact inverse of `up()` |
| **Last resort** | Full restore from Phase 0 dump (loses all data written since Phase 0) |
| **Pre-condition** | Phase 0 dump must be verified and accessible |

### Risk

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Medium — PK type changes and schema moves are complex |
| **Impact** | High — broken FKs cause application errors; data loss during PK conversion |
| **Mitigation** | Transactions on every migration; staging-first deployment; row count verification; FK integrity checks |
| **Specific risks** | 14 BullMQ processors reference entity PKs — in-flight jobs may reference old PK types during rollout |

### Downtime

**Recommended: 5-15 minutes** for PK type migrations. While PostgreSQL supports online `ALTER TABLE`, PK type changes (serial → UUID, integer → UUID) require:
1. Adding a new UUID column
2. Populating it with generated UUIDs
3. Updating all FK columns in related tables
4. Dropping the old PK constraint
5. Adding a new PK constraint on the UUID column
6. Renaming columns

This sequence should be done in a maintenance window to prevent writes during the critical FK-update step.

**Zero downtime** is achievable for column renames and schema moves only, using `ALTER TABLE RENAME COLUMN` and `ALTER TABLE SET SCHEMA` respectively.

### Data Loss Probability

**Low to Medium.** PK type changes carry risk of orphaned rows if FK updates are incomplete. Probability is reduced by:
- Transactions wrapping every migration
- Staging validation before production
- Row count verification before and after
- Foreign key integrity checks as a post-migration gate

### Build Verification

- `npm run build` — must pass after every migration file is committed
- `npm run lint` — must pass
- Staging application must boot and pass smoke tests after each migration
- Manual verification of critical user flows: login, content upload, analytics import, newsletter subscription

### ORM Compatibility

- TypeORM entities must be updated to match the new schema BEFORE the data migration runs
- The entity update (Phase 1 additive columns) and the data migration (Phase 2) are separate steps — never combine them in a single migration file
- `migration:generate` diff must be zero after both Phase 1 and Phase 2 are applied
- TypeORM's `@PrimaryGeneratedColumn('uuid')` requires the database column to be `uuid` type with a default of `gen_random_uuid()` or `uuid_generate_v4()`

---

## Phase 3 — Dual Compatibility

### Objective

Ensure the application works correctly with both the old and new schema during the transition period. This phase is critical for zero-downtime deployments where old and new application versions may coexist briefly (e.g., during rolling deploys on Cloud Run).

### Actions

1. **Database views as compatibility layers**:
   - Create views that expose the old column names alongside new ones
   - Example: A view over `youtube_accounts` that presents both `channel_id` (old snake_case) and `channelId` (new camelCase)
   - Views are cheap to create and drop, and provide a read-compatible layer

2. **Dual-write pattern** for critical columns:
   - During the transition, writes go to both old and new columns
   - Application code writes to the new column; a trigger or application middleware also writes to the old column
   - After all application instances are updated, the old column writes are removed

3. **Feature flags**:
   - Use environment variables or a feature flag system to toggle between old and new query paths
   - This allows instant rollback at the application level without database changes

4. **Query compatibility**:
   - Repository implementations in `src/infrastructure/` must be updated to support both old and new column names
   - The 32 repository interfaces in `src/domain/repositories/` define the contract — implementations must honor both during transition
   - CQRS command/query handlers in `src/features/` must be updated to use the new repository interface

5. **BullMQ job compatibility**:
   - 14 background processors reference database entities
   - Job payloads that contain PK references must handle both old (serial/text) and new (UUID) formats
   - Job data stored in Redis must be checked for stale PK references

6. **Staging soak period**:
   - Deploy dual-compatible version to staging
   - Run for minimum 48 hours
   - Monitor for errors in application logs
   - Verify all 14 BullMQ processors complete jobs without errors

### Rollback

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Toggle feature flag to old query path; drop views; remove dual-write triggers |
| **Duration** | < 60 seconds for feature flag toggle; < 10 seconds for view drop |
| **Data** | No data loss — views are read-only; dual-writes are additive |
| **Edge case** | If old column was dropped before dual-compatibility was established, rollback requires Phase 0 restore |

### Risk

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Medium — dual-write adds complexity to every write path |
| **Impact** | Medium — stale reads from views; performance overhead from dual-writes |
| **Mitigation** | Feature flags for instant toggle; 48-hour soak on staging; automated error monitoring |

### Downtime

**Zero.** Rolling deploys on Cloud Run allow old and new versions to coexist. Database views and dual-writes ensure both versions can read and write correctly.

### Data Loss Probability

**Zero.** Dual-writes are additive. Views are read-only. No data is removed.

### Build Verification

- `npm run build` — must pass with dual-compatible code
- `npm run lint` — must pass
- Staging deployment must complete without migration errors
- All 14 BullMQ processors must process jobs without errors during the soak period
- Application logs must show zero database-related errors for 48 hours

### ORM Compatibility

- TypeORM entities must expose both old and new column mappings during this phase
- Use `@Column({ name: 'old_name' })` decorator override where column names differ
- Migration files must not drop old columns yet — that happens in Phase 7
- `synchronize: false` remains critical — never let TypeORM auto-sync alter the schema during dual compatibility

---

## Phase 4 — Validation

### Objective

Prove that the migrated schema is correct, complete, and performant before committing to the final application cutover.

### Actions

1. **Data integrity checks**:
   - Row count comparison: production vs. Phase 0 snapshot (must match for untouched tables)
   - Foreign key integrity: `SELECT` queries checking for orphaned references across all 4 schemas
   - Primary key uniqueness: verify no duplicate PKs exist after type conversions
   - NOT NULL constraint validation: verify required columns have no nulls

2. **Schema validation**:
   - Compare TypeORM entity definitions against actual database schema using `migration:generate` — the diff must be zero
   - Verify all 38 entities map correctly to their database tables
   - Verify all 4 schemas (`identity`, `notification`, `analytics`, `public`) are intact
   - Verify extensions (`pg_trgm`, `uuid-ossp`) are present and functional

3. **Application validation**:
   - Run full E2E test suite: `npm run test:e2e`
   - Manual smoke tests for critical flows:
     - User registration and login (Better Auth)
     - Content upload and publish (R2 storage + BullMQ jobs)
     - Analytics import (YouTube, Facebook processors)
     - Newsletter subscription
     - Playlist creation and management
     - Search functionality (pg_trgm trigram indexes)
     - Rate limiting
   - Verify all 14 BullMQ background processors complete jobs successfully

4. **Performance validation**:
   - Query execution plans for critical paths (EXPLAIN ANALYZE)
   - Index usage verification (`pg_stat_user_indexes`)
   - Connection pool behavior under load (Neon pooler limits)
   - Redis cache hit rates

5. **Security validation**:
   - Verify SSL connections work with `rejectUnauthorized: false`
   - Verify no credentials are logged or exposed
   - Verify encryption key/IV handling is intact (`ENCRYPTION_KEY`, `ENCRYPTION_IV`)
   - Verify JWT validation works (`JWT_SECRET`, `JWT_AUDIENCE`, `JWT_ISSUER`)

6. **Cross-schema join validation**:
   - Verify queries joining `identity.users` ↔ `public.linkedAccounts` work
   - Verify queries joining `analytics.*` ↔ `identity.users` work
   - Verify notification queries against `notification.*` tables work

### Rollback

| Aspect | Detail |
|--------|--------|
| **Mechanism** | If validation fails, revert to Phase 0 dump |
| **Trigger** | Any validation check that fails after 2 attempts |
| **Duration** | < 60 seconds for full restore |
| **Pre-condition** | Phase 0 dump must be verified |

### Risk

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Low — Phase 1-3 should have caught issues |
| **Impact** | High — discovering a data integrity issue here means reverting all work |
| **Mitigation** | Staging-first validation; automated integrity checks; manual smoke tests |

### Downtime

**None for validation itself.** If validation fails and triggers a Phase 0 restore, estimated downtime is < 60 seconds.

### Data Loss Probability

**Zero during validation.** If rollback is triggered, data written since Phase 0 is lost (same as Phase 2 rollback).

### Build Verification

- `npm run build` — must pass
- `npm run lint` — must pass
- `npm run test:e2e` — must pass
- All manual smoke tests must pass
- Zero errors in application logs during validation window

### ORM Compatibility

- TypeORM `migration:generate` diff must be zero
- All 38 entity decorators must match database columns exactly
- TypeORM query builder must produce valid SQL for all repository implementations
- Connection pool must handle concurrent requests without errors

---

## Phase 5 — Application Migration

### Objective

Update all application code to use the new schema exclusively. Remove dual-compatibility layers, old query paths, and feature flag guards.

### Actions

1. **Remove dual-compatibility code**:
   - Delete old query paths in repository implementations
   - Remove feature flag checks
   - Remove dual-write logic
   - Drop compatibility views from the database

2. **Update repository implementations** (28+ files in `src/infrastructure/`):
   - Each repository in `src/infrastructure/` that references migrated tables must be updated
   - Query column names must match the new schema
   - FK references must use UUID types

3. **Update CQRS handlers** (features in `src/features/`):
   - Command handlers that write to migrated tables
   - Query handlers that read from migrated tables
   - Event handlers that process migration-affected entities

4. **Update BullMQ processors** (14 files in `src/infrastructure/background/`):
   - Verify all job payload types match new PK types
   - Update any hardcoded column references
   - Test each processor with representative job data

5. **Update event listeners** (5 files in `src/infrastructure/`):
   - Domain event payloads may contain PK references
   - Ensure event serialization/deserialization handles UUID PKs

6. **Update DTOs and contracts** (33 model files in `src/domain/contracts/`):
   - DTOs that reference migrated columns must be updated
   - API response shapes may change if column names changed

7. **Update Swagger documentation**:
   - `@nestjs/swagger` decorators on controllers must reflect any API shape changes
   - Verify `/api/v1/...` endpoints document correct types

8. **Deploy to staging**:
   - Full staging deployment with new application code
   - Run for 24 hours minimum
   - Monitor all endpoints and background jobs

### Rollback

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Revert application code to previous version (git revert); re-enable feature flags |
| **Duration** | Cloud Run rolling deploy revert: < 60 seconds |
| **Database** | Database schema is NOT reverted — it remains in the new state |
| **Compatibility** | Old application code must still work with new schema (this is why Phase 3 existed) |
| **Last resort** | Full Phase 0 restore + code revert |

### Risk

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Low — Phase 3 ensured old code works with new schema |
| **Impact** | Medium — application errors on specific endpoints or background jobs |
| **Mitigation** | Staging soak; feature flags; Cloud Run instant rollback; comprehensive smoke tests |

### Downtime

**Zero.** Cloud Run supports rolling deploys with zero downtime. Old and new versions coexist during the transition.

### Data Loss Probability

**Zero.** Application code changes do not affect stored data.

### Build Verification

- `npm run build` — must pass
- `npm run lint` — must pass
- `npm run test:e2e` — must pass
- Staging deployment must complete without errors
- All 14 BullMQ processors must function correctly
- Zero database errors in logs for 24 hours

### ORM Compatibility

- TypeORM entities are now the single source of truth
- `migration:generate` diff is zero
- All repository implementations use TypeORM query builder or entity manager
- No raw SQL in application code that references old column names
- `synchronize: false` remains — all schema changes go through migrations

---

## Phase 6 — Monitoring

### Objective

Establish ongoing observability to detect regressions, performance degradation, or data integrity issues after migration completion.

### Actions

1. **Application monitoring**:
   - Enable `POSTGRES_LOGGING=true` temporarily (24-48 hours) to capture all SQL queries
   - Monitor for slow queries (> 500ms threshold)
   - Monitor for failed queries (connection errors, constraint violations)
   - Review Winston log output (`LOG_PATH` config)

2. **Database monitoring**:
   - Neon dashboard: connection count, query duration, storage usage
   - `pg_stat_activity` for active connections and long-running queries
   - `pg_stat_user_tables` for row count trends (unexpected growth or deletion)
   - `pg_stat_user_indexes` for index usage (unused indexes waste resources)

3. **Background job monitoring**:
   - BullMQ dashboard or Redis monitoring for job completion rates
   - Alert on failed jobs in any of the 14 processors
   - Monitor job queue depth (backlog detection)

4. **Error tracking**:
   - Application error rates (5xx responses)
   - Database connection pool exhaustion events
   - Redis connection failures
   - SSL/TLS handshake failures (Neon requires SSL)

5. **Performance baselines**:
   - Record response times for critical endpoints before and after migration
   - Compare p50, p95, p99 latencies
   - Monitor Cold Start times on Cloud Run (deployment-related, not migration-related)

6. **User-facing validation**:
   - Monitor user registration and login success rates
   - Monitor content upload success rates
   - Monitor analytics import completion rates
   - Monitor newsletter subscription success rates

### Rollback

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Monitoring itself has no rollback — it is read-only observation |
| **Action on alert** | If monitoring detects issues, trigger application rollback (Phase 5) or database restore (Phase 0) |
| **Escalation** | Define severity levels: P1 (data loss) → immediate restore; P2 (feature broken) → rollback; P3 (degraded) → investigate |

### Risk

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Low — monitoring is read-only |
| **Impact** | None — monitoring does not change system state |
| **Mitigation** | Ensure monitoring does not add significant overhead; disable verbose logging after baseline period |

### Downtime

**None.** Monitoring is passive observation.

### Data Loss Probability

**Zero.** Monitoring does not modify data.

### Build Verification

- Monitoring infrastructure must be in place before Phase 5 production deploy
- Log aggregation must be functional (Winston + LOG_PATH)
- Neon dashboard access must be verified
- Redis monitoring must be accessible

### ORM Compatibility

- TypeORM query logging must be toggleable via `POSTGRES_LOGGING` env var
- Connection pool settings must be validated under production load
- TypeORM entity metadata must remain consistent with database schema throughout monitoring period

---

## Phase 7 — Cleanup

### Objective

Remove all migration artifacts, temporary compatibility code, vestigial configurations, and deprecated dependencies. This phase runs only after Phase 6 monitoring confirms stability for a minimum of 14 days.

### Actions

1. **Drop deprecated database objects**:
   - Drop compatibility views created in Phase 3
   - Drop old columns that were superseded in Phase 2 (if dual-write is no longer needed)
   - Drop old indexes that are no longer referenced by any query
   - Reset sequences to correct values after PK type changes

2. **Remove vestigial code**:
   - Delete `prisma.config.ts` (vestigial from a previous ORM attempt; no `prisma/` directory exists)
   - Remove any Drizzle-related configuration or dependencies (if any remain)
   - Remove dead code in repository implementations (old query paths)
   - Remove feature flag infrastructure (if migration-specific)

3. **Clean up TypeORM configuration**:
   - Verify `data.source.ts` has no legacy connection options
   - Verify `configs.ts` Joi schema has no unused env vars
   - Remove any `POSTGRES_SYNCHRONIZE` references if it was only used during migration

4. **Remove temporary infrastructure**:
   - Docker containers and volumes used for migration testing
   - Temporary dump files (keep production backups, remove test restores)
   - Temporary SQL scripts

5. **Update documentation**:
   - Update `README.md` with current migration commands and conventions
   - Update `src/infrastructure/migrations/README.md` with any new conventions
   - Update `RESTORE_REPORT.md` with post-migration status
   - Archive this migration strategy document with completion date

6. **Dependency cleanup**:
   - Run `npm audit` and fix any vulnerabilities introduced during migration
   - Remove unused dependencies (if any were added temporarily)
   - Update `package.json` version to reflect migration completion

7. **Final verification**:
   - `npm run build` — must pass
   - `npm run lint` — must pass
   - `npm run test:e2e` — must pass
   - `npm run migration:generate` — diff must be zero (confirms no drift)
   - Row count snapshot — must match post-migration baseline

### Rollback

| Aspect | Detail |
|--------|--------|
| **Mechanism** | Dropping database objects is permanent — rollback requires Phase 0 restore |
| **Safety** | Only drop objects after 14+ days of monitoring with zero issues |
| **Pre-condition** | Phase 0 dump must be retained for at least 30 days after cleanup |
| **Edge case** | If old columns are dropped and a rollback is needed, all data in those columns is lost |

### Risk

| Factor | Assessment |
|--------|------------|
| **Likelihood** | Low — cleanup is mechanical and well-scoped |
| **Impact** | Medium — dropping the wrong column or view could break queries |
| **Mitigation** | 14-day monitoring gate; verify no queries reference objects before dropping; Phase 0 backup retained |

### Downtime

**Zero for code cleanup.** Database object drops (old columns, views) are metadata operations in PostgreSQL and complete instantly.

### Data Loss Probability

**Low.** Dropping old columns removes data that is no longer used by the application. If rollback is needed after cleanup, that data is permanently lost. Probability is mitigated by the 14-day monitoring gate.

### Build Verification

- `npm run build` — must pass after every cleanup change
- `npm run lint` — must pass
- `npm run test:e2e` — must pass
- `npm run migration:generate` — zero diff
- Application must boot and pass all smoke tests

### ORM Compatibility

- TypeORM entities are the sole source of truth
- No vestigial ORM configurations remain (Prisma, Drizzle)
- `migration:generate` produces zero diff
- All 38 entities map correctly to their database tables
- Migration runner reports no pending migrations

---

## Cross-Cutting Concerns

### Migration File Naming Convention

Follow the existing pattern: `<unix_epoch_ms>-<PascalCase-description>.ts`

Examples:
- `1785000000000-AddReferralTables.ts`
- `1785000000001-MigrateUploadJobsToUuid.ts`
- `1785000000002-AddMissingAnalyticsColumns.ts`

### Migration CLI Commands

```bash
npm run migration:generate -- src/infrastructure/migrations/<name>   # Generate from entity diff
npm run migration:run                                                 # Apply pending migrations
npm run migration:revert                                              # Revert last migration
```

All commands build first (`npm run build`) then invoke TypeORM CLI against `dist/infrastructure/persistence/data.source.js`.

### Auto-Migration Risk

`POSTGRES_MIGRATIONS_RUN=true` means every deployment auto-runs pending migrations. This is a significant risk during multi-instance deployments (Cloud Run can spin up multiple instances simultaneously).

**Mitigation**: Ensure all migrations are idempotent (`IF NOT EXISTS`, `IF EXISTS`) or use advisory locks to prevent concurrent execution.

### Environment-Specific Behavior

| Environment | Database | Migrations | synchronize |
|-------------|----------|------------|-------------|
| Development | Docker PostgreSQL (localhost:5433) | Auto-run | Configurable |
| Staging | Neon (ep-autumn-paper-ahdjud0j-pooler) | Auto-run | `false` |
| Production | Neon (ep-little-poetry-asypeffl-pooler) | Auto-run | `false` |

### Rollback Decision Matrix

| Issue Detected | Phase | Action | Downtime |
|----------------|-------|--------|----------|
| Migration syntax error | Any | `migration:revert` | < 5 seconds |
| Data corruption detected | Phase 2-4 | Phase 0 restore | < 60 seconds |
| Application errors post-deploy | Phase 5 | Cloud Run rollback + feature flag | < 60 seconds |
| Performance regression | Phase 6 | Investigate; revert specific migration if needed | Varies |
| Stale data in old columns | Phase 7 | Phase 0 restore (if within retention) | < 60 seconds |

### Success Criteria

The migration is considered complete when ALL of the following are true:

1. All 38 TypeORM entities match database schema with zero drift
2. `migration:generate` produces zero diff
3. All 14 BullMQ processors function correctly
4. All manual smoke tests pass
5. Application logs show zero database errors for 14 consecutive days
6. Performance baselines are met or improved
7. Phase 7 cleanup is complete
8. Documentation is updated

---

*Document version: 1.0*  
*Created: 2026-07-19*  
*Review cycle: After each phase completion*
