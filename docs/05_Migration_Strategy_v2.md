# 05 — Migration Strategy v2 (Shared Identity Architecture)

**Scope**: Dual-ORM to shared identity migration — Drizzle (Project A) + TypeORM (Project B) to unified `identity.users` canonical table
**Stack**: PostgreSQL 18.4 (Neon serverless) · 4 schemas · 86 Drizzle migrations + 44 TypeORM migrations
**Decision basis**: `12_Critical_Blocker_Decisions.md` (all 5 blockers resolved as Option A)
**Critical constraint**: `POSTGRES_MIGRATIONS_RUN=true` — migrations auto-execute on every startup of both projects
**Frontend constraint**: ZERO changes — 55+ API calls to Project B are immutable

---

## Table of Contents

1. [Document Metadata](#document-metadata)
2. [Executive Summary](#executive-summary)
3. [Current State](#current-state)
4. [Migration Principles](#migration-principles)
5. [Phase-by-Phase Migration Plan](#phase-by-phase-migration-plan)
6. [Rollback Strategy](#rollback-strategy)
7. [Data Integrity Checks](#data-integrity-checks)
8. [Testing Matrix](#testing-matrix)
9. [Deployment Checklist](#deployment-checklist)
10. [Monitoring Plan](#monitoring-plan)
11. [Risk Assessment](#risk-assessment)
12. [Timeline](#timeline)
13. [Architecture Decision Records](#architecture-decision-records)
14. [Open Questions](#open-questions)

---

## Document Metadata

| Field | Value |
|-------|-------|
| **Document** | 05_Migration_Strategy_v2.md |
| **Supersedes** | 05_Migration_Strategy.md (v1) |
| **Created** | 2026-07-19 |
| **Author** | opencode (automated from codebase analysis) |
| **Review cycle** | After each phase completion |
| **Status** | DRAFT — Pending stakeholder sign-off |
| **Decisions dependency** | `12_Critical_Blocker_Decisions.md` — all 5 resolved as Option A |

### What Changed from v1

| Aspect | v1 | v2 |
|--------|----|----|
| Scope | Single-project (Project B only) | Cross-project dual-ORM migration |
| Identity source | Assumed `identity.users` | Validated: `identity.users` (UUID PK) is canonical |
| Drizzle migrations | Not inventoried | 86 migrations catalogued, 2 numbering conflicts found |
| TypeORM migrations | Assumed 44 | Confirmed 44 (oldest: `1745256809081`, newest: `1784000000002`) |
| PK strategy | UUID PK only | UUID everywhere (Option A from Blocker Decision 3) |
| Auth ownership | Ambiguous | Project B owns auth endpoints (Option A from Blocker Decision 1) |
| Password hashing | Single hash | Dual-hash: bcrypt (B) + Argon2id (A), rehash-on-login (Option A from Blocker Decision 5) |

---

## Executive Summary

### Migration Readiness

| Metric | Status |
|--------|--------|
| **Database backups** | Manual dump exists (`neondb_backup_20260717_223225.dump`); no automation |
| **Unit tests** | 0 `.spec.ts` files in either project |
| **Build status** | Must verify `npm run build` passes in both projects |
| **Schema drift risk** | HIGH — 86 Drizzle + 44 TypeORM migrations with 2 numbering conflicts |
| **Data volume** | Low (~49 users, ~42 tables) — reduces migration risk |
| **Frontend impact** | ZERO — all changes are backend-only |

### Estimated Duration

| Phase | Duration | Risk |
|-------|----------|------|
| Phase 0: Backup & Baseline | 1 day | Low |
| Phase 1: Schema Additions | 2-3 days | Low |
| Phase 2: Data Migration | 3-5 days | HIGH |
| Phase 3: Dual Compatibility | 3-5 days | Medium |
| Phase 4: Validation | 2-3 days | Low |
| Phase 5: Application Cutover | 3-5 days | Medium |
| Phase 6: Monitoring | 14 days | Low |
| Phase 7: Cleanup | 2-3 days | Medium |
| Phase 8: Project A Auth Switch | 5-7 days | HIGH |
| Phase 9: Mapping Table Removal | 2-3 days | Medium |
| **Total** | **38-52 days** | — |

### Risk Level: MEDIUM-HIGH

Primary risks: zero unit tests, dual-hash password complexity, auto-migration on startup for both projects simultaneously, no backup automation.

---

## Current State

### Project A — gaddr-jobs (Drizzle ORM)

| Attribute | Value |
|-----------|-------|
| **ORM** | Drizzle ORM + `drizzle-kit` |
| **Schema files** | 61 files in `src/server/db/` |
| **Migration files** | 86 SQL files in `drizzle/` (0000–0085) |
| **DB config** | `drizzle.config.ts` → reads `DATABASE_URL` from `.env` |
| **User table** | `"user"` — **text PK**, Better Auth managed |
| **Auth system** | Better Auth (Argon2id password hashing) |
| **Key PK types** | `user.id` = text, `youtube_accounts.id` = SERIAL, `youtube_videos.id` = SERIAL, `upload_jobs.id` = SERIAL |
| **FK references** | All point to `"user"(id)` text PK |
| **Mapping table** | `user_id_mapping` bridges `jobs_text_id` (text PK) ↔ `gaddr_uuid` (UUID) |
| **Compat view** | `gaddr_users_compat` exposes `"user"` table as identity-compatible shape |

#### Migration Numbering Conflicts (Project A)

| Conflict | Files | Issue |
|----------|-------|-------|
| **0069** | `0069_ai_audit_log.sql` AND `0069_add_message_is_read.sql` | Two migrations with same prefix — both are raw SQL, first is JS-format, second is plain SQL |
| **0078** | `0078_priority2_features.sql` AND `0078_catchup_apply_all_missing.sql` | Two migrations with same prefix — catchup migration is a massive 977-line file applying all missing tables |

**Impact**: Drizzle's migration tracker may only record one of each pair. The catchup migration (`0078_catchup_apply_all_missing.sql`) explicitly notes "Migrations 0013-0077 were never applied to the database" — this suggests significant migration drift.

#### Project A Auth Schema (`src/server/db/auth-schema.ts`)

```sql
-- Core auth tables (text PK throughout)
"user"          — id TEXT PK, name, email, email_verified, image, created_at, updated_at,
                   first_name, last_name, role, two_factor_enabled, is_verified, is_admin,
                   stripe_*, subscription_*, wallet_address, google_id, phone_number, etc.
"user_id_mapping" — jobs_text_id TEXT PK, gaddr_uuid TEXT UNIQUE, migrated_at
"session"       — id TEXT PK, expires_at, token UNIQUE, user_id FK→user(id)
"account"       — id TEXT PK, account_id, provider_id, user_id FK→user(id)
"verification"  — id TEXT PK, identifier, value, expires_at
"passkey"       — id TEXT PK, name, publicKey, userId FK→user(id), credentialID
"used_free_limit" — email TEXT PK, consumed_at
```

### Project B — gaddr-backend-api (TypeORM)

| Attribute | Value |
|-----------|-------|
| **ORM** | TypeORM 0.3.23 |
| **Entity files** | 28 entities in `src/domain/entities/` |
| **Migration files** | 44 TypeScript migrations in `src/infrastructure/migrations/` |
| **DB config** | `src/infrastructure/persistence/data.source.ts` → reads `DATABASE_URL` |
| **Base entity** | `@PrimaryGeneratedColumn('uuid')` — **UUID PK everywhere** |
| **User table** | `identity.users` — UUID PK, 40+ columns |
| **Auth system** | Custom JWT (bcrypt cost 10 password hashing) |
| **Auto-migrate** | `POSTGRES_MIGRATIONS_RUN=true` |
| **Synchronize** | `POSTGRES_SYNCHRONIZE=false` (production safe) |

#### Project B Schema Inventory

| Schema | Tables | Entities |
|--------|--------|----------|
| `identity` | 10 | `User`, `UserRole`, `RoleClaim`, `UserClaim`, `UserBiometric`, `UserPreference`, `UserLogin`, `Role` |
| `notification` | 4 | `Notification`, `NotificationEvent`, `NotificationTemplate`, `NewsletterSubscriber` |
| `analytics` | 7 | `YoutubeChannelAnalytics`, `YoutubeVideoAnalytics`, `FacebookPageAnalytics`, `FacebookPostAnalytics`, `FacebookVideoAnalytics`, `AnalyticsEvent`, `PremiumRollup` |
| `public` | 21 | `LinkedAccount`, `UserContent`, `Playlist`, `PlaylistMember`, `PlaylistContent`, `UploadJob`, `PublishJob`, `YoutubeAccount`, `YoutubeVideo`, `ContentStream`, `RateLimit`, `RateLimitLog`, `SearchHistory`, `Topic`, `UserFollow`, `UserTopic`, `ManualProfile`, `DataProtectionKey` |

#### Project B Entity Details (Key Tables)

**`identity.users`** (UUID PK, canonical):
- Extends `BaseEntity`: `id` (UUID PK), `createdBy`, `createdOn`, `lastModifiedBy`, `lastModifiedOn`, `lastRefreshed`
- 40+ columns: `firstName`, `lastName`, `email`, `passwordHash` (bcrypt), `twoFactorEnabled`, `twoFactorSecret`, `securityStamp`, `concurrencyStamp`, `googleId`, `phoneNumber`, `referralCode`, `onboardingStep`, `profilePrivacy`, `type`, `bio`, `isActive`

**`public.youtube_accounts`** (UUID PK via BaseEntity):
- `userId`, `channelId` (unique), `channelTitle`, `accessToken`, `refreshToken`, `tokenExpiry`, `connected`, `disconnectedAt`

**`public.youtube_videos`** (UUID PK via BaseEntity):
- `accountId`, `youtubeVideoId`, `title`, `description`, `visibility`, `status`, `thumbnailUrl`, `videoUrl`, `r2Key`, `tags`

**`public.upload_jobs`** (UUID PK via BaseEntity):
- `videoId` (nullable), `status`, `attempts`, `progress`, `statusMessage`, `lastError`, `nextRetryAt`, `r2Key`, `fileSize`

**`notification.newsletter_subscribers`** (UUID PK via BaseEntity):
- `email` (unique)

### Known Schema Conflicts (Drizzle vs TypeORM)

| Table | Project A (Drizzle) | Project B (TypeORM) | Severity |
|-------|---------------------|---------------------|----------|
| `user` vs `identity.users` | text PK `"user"` table | UUID PK `identity.users` | **Critical** |
| `user_id_mapping` | Bridges text ↔ UUID | Not used by Project B | **Critical** |
| `youtube_accounts` | SERIAL PK, snake_case | UUID PK, camelCase | **Critical** |
| `youtube_videos` | SERIAL PK, snake_case | UUID PK, camelCase | **Critical** |
| `upload_jobs` | SERIAL PK, limited columns | UUID PK, many columns | **Critical** |
| `newsletter_subscribers` | SERIAL PK, `public` schema | UUID PK, `notification` schema | **High** |
| `linked_accounts` | SERIAL PK, snake_case | UUID PK, camelCase | **High** |
| `user_contents` | SERIAL PK, snake_case | UUID PK, camelCase | **High** |
| `youtubeChannelAnalytics` | Not present | 20 columns in analytics schema | **Medium** |
| `youtubeVideoAnalytics` | Not present | 12 columns in analytics schema | **Medium** |
| `analyticsEvents` | `analytics_event` (SERIAL PK) | `analyticsEvents` (UUID PK) | **Medium** |
| `premiumRollups` | `premium_rollups` (SERIAL PK) | `premiumRollups` (UUID PK) | **Low** |

### Infrastructure Dependencies

| System | Usage | Risk |
|--------|-------|------|
| **Neon PostgreSQL** | Serverless Postgres, connection pooler | Auto-scaling; zero-downtime schema changes |
| **Redis** | BullMQ (14 processors in A), session cache, rate limiting | Job payloads contain PK references |
| **Cloudflare R2** | Media/file storage | Referenced in upload_jobs, publish_jobs |
| **Cloudinary** | Legacy media storage | Still referenced in config |
| **Better Auth** | Session management (Project A) | Text PK user table |
| **JWT** | Token generation (Project B) | UUID-based identity |

---

## Migration Principles

### 1. Zero Downtime
Every phase must allow both Project A and Project B to remain operational. Rolling deploys on Cloud Run (Project B) and Vercel (Project A) mean old and new versions coexist during transitions.

### 2. Backward Compatible
At no point should an older version of either application fail to function against the database state. Dual-write patterns and compatibility views bridge the gap during transitions.

### 3. Frontend Immutable
55+ frontend API calls to Project B are **completely immutable**. No endpoint signatures, response shapes, or JWT claims may change. Project B's auth endpoints (login, register, OAuth, 2FA, password reset, profile) remain as-is.

### 4. Project B is Identity Provider
Project B serves all auth endpoints to the frontend. Project A's Better Auth is used only for Project A's internal Next.js app (if needed). The shared database means both projects read the same `identity.users` table.

### 5. UUID PKs Everywhere
`identity.users.id` (UUID) is the canonical primary key. Project A's `"user".id` (text) will be replaced by UUID. All tables with FK references to `user` must use UUID FKs.

### 6. Dual-Hash Passwords
Short-term: `identity.users` stores both `passwordHash` (bcrypt, Project B) and `argon2Hash` (Argon2id, Project A). Long-term: converge on Argon2id.

### 7. Backup Before Every Destructive Phase
Phase 0 establishes a verified baseline. Any phase that modifies data (Phase 2, 8, 9) requires a fresh backup immediately before execution.

### 8. Staging-First
Every migration runs on staging (Render/Neon staging) before production. Staging soak period: minimum 48 hours for schema changes, 7 days for data migrations.

---

## Phase-by-Phase Migration Plan

### Phase 0 — Backup & Baseline

**Objective**: Establish a recoverable baseline and inventory the exact current state of both projects' database schemas.

#### Actions

1. **Full database dump** (Neon production)
   ```bash
   pg_dump -Fc -v --no-owner --no-privileges \
     -d "ep-little-poetry-asypeffl" \
     -f "gaddr_full_$(date +%Y%m%d_%H%M%S).dump"
   ```
   - Include all 4 schemas: `identity`, `notification`, `analytics`, `public`
   - Include extensions: `pg_trgm`, `uuid-ossp`

2. **Schema-only dump** for diffing
   ```bash
   pg_dump --schema-only --no-owner --no-privileges \
     -d "ep-little-poetry-asypeffl" \
     -f "gaddr_schema_$(date +%Y%m%d_%H%M%S).sql"
   ```

3. **Row count snapshot** across all tables
   ```sql
   SELECT schemaname, relname, n_live_tup
   FROM pg_stat_user_tables
   ORDER BY schemaname, relname;
   ```

4. **Drizzle migration state** (Project A)
   ```bash
   cd E:\Github\gaddep\gaddr-jobs
   npx drizzle-kit introspect
   # Compare output against drizzle/ directory
   # Document which of the 86 migrations are actually applied
   ```

5. **TypeORM migration state** (Project B)
   ```sql
   -- Check TypeORM migrations table
   SELECT * FROM typeorm_migrations ORDER BY timestamp;
   -- Verify all 44 are recorded
   ```

6. **Restore verification**
   ```bash
   pg_restore -d gaddr_verify --clean --if-exists gaddr_full_YYYYMMDD_HHMMSS.dump
   # Verify table counts match
   # Verify extensions present
   ```

7. **Build verification**
   ```bash
   # Project A
   cd E:\Github\gaddep\gaddr-jobs && npm run build
   # Project B
   cd E:\gaddr-backend-api && npm run build
   ```

#### Rollback
This phase is read-only. No rollback needed.

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | Low |
| Impact | None (read-only) |
| Mitigation | Verify dump integrity via restore test |

---

### Phase 1 — Project A: Fix Migration Numbering Conflicts

**Objective**: Resolve the 0069 and 0078 duplicate migration prefixes in Project A's Drizzle migration history before any cross-project work begins.

#### Problem Analysis

| Conflict | Files | Resolution |
|----------|-------|------------|
| `0069` | `0069_ai_audit_log.sql` (JS-format, 29 lines) and `0069_add_message_is_read.sql` (plain SQL, 1 line) | Rename `0069_add_message_is_read.sql` → `0069b_add_message_is_read.sql` or merge into catchup |
| `0078` | `0078_priority2_features.sql` (JS-format, 185 lines) and `0078_catchup_apply_all_missing.sql` (plain SQL, 977 lines) | The catchup file is explicitly a "never applied" batch. Verify actual DB state and reconcile. |

#### Actions

1. **Audit actual Drizzle migration state**
   ```sql
   -- Drizzle tracks applied migrations in a internal table
   -- Check what's actually been applied to the DB
   SELECT * FROM __drizzle_migrations ORDER BY created_at;
   ```

2. **For the catchup migration** (`0078_catchup_apply_all_missing.sql`):
   - This 977-line file uses `IF NOT EXISTS` throughout
   - It was written because "Migrations 0013-0077 were never applied"
   - Verify whether the tables it creates already exist
   - If already applied: rename to prevent re-execution
   - If not applied: apply it, then rename both `0078` files

3. **For the dual `0069`**:
   - Check if `message.is_read` column exists in the DB
   - Check if `ai_audit_log` table exists in the DB
   - If both exist: both were applied despite the conflict
   - Rename the non-applied one to `0069b_` prefix

4. **Rename files** (Drizzle migration files are numbered by prefix, must be sequential and unique):
   ```
   0069_add_message_is_read.sql → 0069b_add_message_is_read.sql (if not yet applied)
   0078_catchup_apply_all_missing.sql → 0078b_catchup_apply_all_missing.sql (if already applied)
   ```

5. **Update Drizzle migration history** if needed:
   ```sql
   -- Only if a migration was applied but not tracked
   INSERT INTO __drizzle_migrations (hash, created_at)
   VALUES ('<hash>', NOW());
   ```

#### Rollback
Rename files back to original names. No database changes.

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | Low (renaming files only) |
| Impact | Low |
| Mitigation | Backup before any migration history manipulation |

---

### Phase 2 — Project B: Add Dual-Hash Columns to `identity.users`

**Objective**: Add `argon2Hash` column and `argon2Algorithm` metadata column to `identity.users` for Project A's Argon2id password compatibility. This is purely additive — no existing data changes.

#### Actions

1. **TypeORM migration** (Project B)
   ```typescript
   // src/infrastructure/migrations/1785000000000-AddArgon2HashColumn.ts
   import { MigrationInterface, QueryRunner } from 'typeorm';

   export class AddArgon2HashColumn1785000000000 implements MigrationInterface {
     name = 'AddArgon2HashColumn1785000000000';

     async up(queryRunner: QueryRunner): Promise<void> {
       await queryRunner.query(`
         ALTER TABLE "identity"."users"
         ADD COLUMN IF NOT EXISTS "argon2Hash" text,
         ADD COLUMN IF NOT EXISTS "argon2Algorithm" varchar(20) DEFAULT 'argon2id'
       `);
     }

     async down(queryRunner: QueryRunner): Promise<void> {
       await queryRunner.query(`
         ALTER TABLE "identity"."users"
         DROP COLUMN IF EXISTS "argon2Hash",
         DROP COLUMN IF EXISTS "argon2Algorithm"
       `);
     }
   }
   ```

2. **Update `identity/user.entity.ts`**:
   ```typescript
   @Column({ type: 'text', nullable: true })
   argon2Hash?: string;

   @Column({ type: 'varchar', length: 20, nullable: true, default: 'argon2id' })
   argon2Algorithm?: string;
   ```

3. **Deploy to staging** — verify migration runs, verify existing auth still works.

4. **Rehash-on-login logic** (in Project B's auth handler):
   ```typescript
   // After bcrypt verification succeeds:
   if (!user.argon2Hash) {
     const argon2 = await import('@node-rs/argon2');
     user.argon2Hash = await argon2.hash(plaintextPassword);
     await userRepository.save(user);
   }
   ```

#### Rollback
```sql
ALTER TABLE "identity"."users"
DROP COLUMN IF EXISTS "argon2Hash",
DROP COLUMN IF EXISTS "argon2Algorithm";
```

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | Low (additive only) |
| Impact | Low (nullable columns, no existing data touched) |
| Mitigation | Nullable columns with defaults |

---

### Phase 3 — Project A: Switch User PK from Text to UUID

**Objective**: Convert Project A's `"user".id` from text to UUID, update all Better Auth tables (`session`, `account`, `passkey`, `verification`) to use UUID FKs, and populate `identity.users` with merged data. This is the highest-risk phase.

#### Pre-conditions
- Phase 0 backup verified
- Phase 2 deployed (argon2Hash columns exist)
- Both projects backed up immediately before execution

#### Actions

1. **Create backup immediately before execution**:
   ```bash
   pg_dump -Fc -d "ep-little-poetry-asypeffl" -f "gaddr_pre_phase3_$(date +%Y%m%d_%H%M%S).dump"
   ```

2. **Data migration script** (run in maintenance window, 5-15 min downtime):
   ```sql
   BEGIN;

   -- Step 1: Add UUID column to "user" table
   ALTER TABLE "user" ADD COLUMN "uuid_id" uuid DEFAULT gen_random_uuid();

   -- Step 2: Generate UUIDs for all existing text-ID users
   UPDATE "user" SET "uuid_id" = gen_random_uuid() WHERE "uuid_id" IS NULL;

   -- Step 3: Populate identity.users from "user" (merge data)
   INSERT INTO "identity"."users" (
     "id", "firstName", "lastName", "email", "passwordHash",
     "twoFactorEnabled", "googleId", "phoneNumber", "gender",
     "referralCode", "referredBy", "onboardingStep", "profilePrivacy",
     "createdOn", "lastModifiedOn"
   )
   SELECT
     u."uuid_id",
     u."first_name",
     u."last_name",
     u."email",
     NULL,  -- bcrypt hash is in account.password, not user table
     u."two_factor_enabled",
     u."google_id",
     u."phone_number",
     u."gender",
     u."referral_code",
     u."referred_by",
     u."onboarding_step",
     u."profile_privacy",
     u."created_at",
     u."updated_at"
   FROM "user" u
   ON CONFLICT ("id") DO NOTHING;

   -- Step 4: Migrate password hashes (Argon2id from account table)
   UPDATE "identity"."users" iu
   SET "argon2Hash" = a."password"
   FROM "account" a
   WHERE a."user_id" = (SELECT "id"::text FROM "user" WHERE "uuid_id" = iu."id")
     AND a."password" IS NOT NULL
     AND a."provider_id" = 'credential';

   -- Step 5: Populate user_id_mapping (bidirectional)
   INSERT INTO "user_id_mapping" ("jobs_text_id", "gaddr_uuid", "migrated_at")
   SELECT "id", "uuid_id"::text, NOW()
   FROM "user"
   ON CONFLICT ("jobs_text_id") DO UPDATE SET "gaddr_uuid" = EXCLUDED."gaddr_uuid";

   -- Step 6: Update session.user_id to UUID
   ALTER TABLE "session" ADD COLUMN "user_uuid" uuid;
   UPDATE "session" s
   SET "user_uuid" = u."uuid_id"
   FROM "user" u
   WHERE s."user_id" = u."id";
   ALTER TABLE "session" ALTER COLUMN "user_uuid" SET NOT NULL;

   -- Step 7: Update account.user_id to UUID
   ALTER TABLE "account" ADD COLUMN "user_uuid" uuid;
   UPDATE "account" a
   SET "user_uuid" = u."uuid_id"
   FROM "user" u
   WHERE a."user_id" = u."id";
   ALTER TABLE "account" ALTER COLUMN "user_uuid" SET NOT NULL;

   -- Step 8: Update passkey.userId to UUID
   ALTER TABLE "passkey" ADD COLUMN "user_uuid" uuid;
   UPDATE "passkey" p
   SET "user_uuid" = u."uuid_id"
   FROM "user" u
   WHERE p."user_id" = u."id"::text;
   ALTER TABLE "passkey" ALTER COLUMN "user_uuid" SET NOT NULL;

   -- Step 9: Drop old FK constraints
   ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_user_id_user_id_fk";
   ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_user_id_user_id_fk";
   ALTER TABLE "passkey" DROP CONSTRAINT IF EXISTS "passkey_user_idx";

   -- Step 10: Swap columns
   ALTER TABLE "session" DROP COLUMN "user_id";
   ALTER TABLE "session" RENAME COLUMN "user_uuid" TO "user_id";
   ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fk"
     FOREIGN KEY ("user_id") REFERENCES "user"("uuid_id") ON DELETE CASCADE;

   ALTER TABLE "account" DROP COLUMN "user_id";
   ALTER TABLE "account" RENAME COLUMN "user_uuid" TO "user_id";
   ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fk"
     FOREIGN KEY ("user_id") REFERENCES "user"("uuid_id") ON DELETE CASCADE;

   ALTER TABLE "passkey" DROP COLUMN "userId";
   ALTER TABLE "passkey" RENAME COLUMN "user_uuid" TO "userId";
   ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_fk"
     FOREIGN KEY ("userId") REFERENCES "user"("uuid_id") ON DELETE CASCADE;

   -- Step 11: Drop old "user".id (text PK) and promote uuid_id to PK
   ALTER TABLE "user" DROP CONSTRAINT "user_pkey";
   ALTER TABLE "user" DROP COLUMN "id";
   ALTER TABLE "user" RENAME COLUMN "uuid_id" TO "id";
   ALTER TABLE "user" ADD PRIMARY KEY ("id");

   -- Step 12: Update all FK references to use new UUID PK
   -- (already done for session, account, passkey above)

   COMMIT;
   ```

3. **Update Better Auth config** (Project A):
   ```typescript
   // Change Better Auth to use UUID PK
   // Override the user schema to use uuid type
   ```

4. **Update all Drizzle FK references** to point to the new UUID PK.

#### Rollback
```bash
pg_restore -d "ep-little-poetry-asypeffl" --clean --if-exists gaddr_pre_phase3_YYYYMMDD_HHMMSS.dump
```

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | MEDIUM |
| Impact | **HIGH** — PK change cascades to all FK-dependent tables |
| Mitigation | Maintenance window (5-15 min), transactions wrapping every step, pre-backup, staging-first |
| Data loss probability | LOW (transactions ensure atomicity) |

---

### Phase 4 — Project A: Migrate Shared Tables from SERIAL to UUID PKs

**Objective**: Convert Project A's `youtube_accounts`, `youtube_videos`, `upload_jobs`, `newsletter_subscribers`, and `linked_accounts` from SERIAL/text PKs to UUID PKs (matching Project B's BaseEntity pattern).

#### Actions

1. **For each table** (execute in order due to FK dependencies):
   ```sql
   -- Example: youtube_accounts
   BEGIN;

   ALTER TABLE "youtube_accounts" ADD COLUMN "uuid_id" uuid DEFAULT gen_random_uuid();
   UPDATE "youtube_accounts" SET "uuid_id" = gen_random_uuid() WHERE "uuid_id" IS NULL;

   -- Update youtube_videos.account_id FK
   ALTER TABLE "youtube_videos" ADD COLUMN "account_uuid" uuid;
   UPDATE "youtube_videos" yv
   SET "account_uuid" = ya."uuid_id"
   FROM "youtube_accounts" ya
   WHERE yv."account_id" = ya."id";
   ALTER TABLE "youtube_videos" ALTER COLUMN "account_uuid" SET NOT NULL;

   -- Drop old FK, drop old PK, rename, add new PK
   ALTER TABLE "youtube_videos" DROP CONSTRAINT IF EXISTS "youtube_videos_account_id_youtube_accounts_id_fk";
   ALTER TABLE "youtube_accounts" DROP CONSTRAINT "youtube_accounts_pkey";
   ALTER TABLE "youtube_accounts" DROP COLUMN "id";
   ALTER TABLE "youtube_accounts" RENAME COLUMN "uuid_id" TO "id";
   ALTER TABLE "youtube_accounts" ADD PRIMARY KEY ("id");

   ALTER TABLE "youtube_videos" DROP COLUMN "account_id";
   ALTER TABLE "youtube_videos" RENAME COLUMN "account_uuid" TO "account_id";
   ALTER TABLE "youtube_videos" ADD CONSTRAINT "youtube_videos_account_fk"
     FOREIGN KEY ("account_id") REFERENCES "youtube_accounts"("id") ON DELETE CASCADE;

   -- Add additional columns from Project B's entity
   ALTER TABLE "youtube_accounts" ADD COLUMN IF NOT EXISTS "disconnectedAt" timestamp;

   COMMIT;
   ```

2. **Repeat for**: `youtube_videos`, `upload_jobs`, `newsletter_subscribers`, `linked_accounts`

3. **Rename snake_case columns to camelCase** (for TypeORM convention):
   ```sql
   ALTER TABLE "youtube_accounts" RENAME COLUMN "user_id" TO "userId";
   ALTER TABLE "youtube_accounts" RENAME COLUMN "channel_id" TO "channelId";
   ALTER TABLE "youtube_accounts" RENAME COLUMN "channel_title" TO "channelTitle";
   ALTER TABLE "youtube_accounts" RENAME COLUMN "access_token" TO "accessToken";
   ALTER TABLE "youtube_accounts" RENAME COLUMN "refresh_token" TO "refreshToken";
   ALTER TABLE "youtube_accounts" RENAME COLUMN "token_expiry" TO "tokenExpiry";
   -- etc.
   ```

4. **Move `newsletter_subscribers` to `notification` schema**:
   ```sql
   ALTER TABLE "newsletter_subscribers" SET SCHEMA "notification";
   ```

#### Rollback
Restore from Phase 3 backup or execute reverse migrations.

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | MEDIUM |
| Impact | HIGH (FK cascades) |
| Mitigation | Maintenance window, transactions, staging-first |

---

### Phase 5 — Dual Compatibility Layer

**Objective**: Ensure both Project A and Project B can read/write all shared tables during the transition period. Create compatibility views and dual-write patterns.

#### Actions

1. **Create compatibility views** for tables where column names differ:
   ```sql
   -- View for youtube_accounts (Project A reads old names, Project B writes new)
   CREATE OR REPLACE VIEW youtube_accounts_compat AS
   SELECT
     id,
     "userId" AS user_id,
     "channelId" AS channel_id,
     "channelTitle" AS channel_title,
     "accessToken" AS access_token,
     "refreshToken" AS refresh_token,
     "tokenExpiry" AS token_expiry,
     connected,
     "disconnectedAt" AS disconnected_at
   FROM "youtube_accounts";

   -- Reverse view for Project B
   CREATE OR REPLACE VIEW youtube_accounts_modern AS
   SELECT * FROM "youtube_accounts";
   ```

2. **Update Project A's Drizzle queries** to use the modern column names (camelCase, UUID PKs).

3. **Feature flag** in both projects:
   ```env
   USE_SHARED_IDENTITY=true   # Project A
   MIGRATION_PHASE=5          # Project B
   ```

4. **Update BullMQ job payloads** — any job data in Redis that contains old PK types must be cleared or re-serialized:
   ```bash
   # Flush stale job data
   redis-cli KEYS "bull:*:job:*" | head -20
   # Inspect for old PK references
   # Clear if needed
   ```

5. **Staging soak**: 48 hours minimum. Monitor:
   - Application logs for database errors
   - BullMQ job completion rates
   - API response times

#### Rollback
Toggle feature flags to old code paths. Drop compatibility views.

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | MEDIUM |
| Impact | MEDIUM (dual-write complexity) |
| Mitigation | Feature flags, 48-hour soak, automated error monitoring |

---

### Phase 6 — Validation

**Objective**: Prove the migrated schema is correct, complete, and performant before committing to the final cutover.

#### Actions

1. **Row count comparison**:
   ```sql
   SELECT schemaname, relname, n_live_tup
   FROM pg_stat_user_tables
   ORDER BY schemaname, relname;
   -- Compare against Phase 0 snapshot
   ```

2. **Foreign key integrity**:
   ```sql
   -- Check for orphaned FK references across all schemas
   SELECT conname, conrelid::regclass, confrelid::regclass
   FROM pg_constraint
   WHERE contype = 'f'
     AND connamespace IN ('identity'::regnamespace, 'public'::regnamespace, 'analytics'::regnamespace, 'notification'::regnamespace);
   ```

3. **TypeORM entity-to-schema diff**:
   ```bash
   cd E:\gaddr-backend-api
   npm run migration:generate -- src/infrastructure/migrations/ValidationDiff
   # Must produce ZERO diff
   ```

4. **Application validation**:
   ```bash
   # Project B
   npm run build && npm run lint
   # Manual smoke tests:
   # - Login/register (both bcrypt and Argon2id paths)
   # - Content upload
   # - YouTube analytics import
   # - Newsletter subscription
   # - Search (pg_trgm)
   # - Rate limiting
   ```

5. **Cross-project query validation**:
   ```sql
   -- Verify Project A can read identity.users
   SELECT u.id, u."firstName", u.email
   FROM "identity"."users" u
   WHERE u.id = '<known-uuid>';

   -- Verify Project B can read Better Auth tables
   SELECT s.id, s.token, s."userId"
   FROM "session" s
   WHERE s."userId" = '<known-uuid>';
   ```

6. **Performance validation**:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM "identity"."users" WHERE email = '<test>';
   EXPLAIN ANALYZE SELECT * FROM "youtube_accounts" WHERE "userId" = '<uuid>';
   -- Verify index usage
   ```

#### Rollback
If validation fails after 2 attempts: restore from Phase 0 backup.

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | Low |
| Impact | HIGH (discovering data issues here means reverting) |
| Mitigation | Staging-first, automated checks, manual smoke tests |

---

### Phase 7 — Project B: Application Cutover

**Objective**: Update all Project B application code to use the new schema exclusively. Remove compatibility layers.

#### Actions

1. **Update all 28 entities** to match the final database schema.

2. **Update repository implementations** (28+ files in `src/infrastructure/`).

3. **Update CQRS handlers** in `src/features/`.

4. **Update BullMQ processors** (14 files in `src/infrastructure/background/`).

5. **Update DTOs** (33 model files in `src/domain/contracts/`).

6. **Deploy to staging** — 24-hour soak.

7. **Deploy to production** (Cloud Run rolling deploy).

#### Rollback
Git revert + Cloud Run rollback (< 60 seconds). Database schema is NOT reverted.

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | Low |
| Impact | MEDIUM |
| Mitigation | Staging soak, feature flags, Cloud Run instant rollback |

---

### Phase 8 — Project A: Switch to Shared Identity

**Objective**: Project A stops using its local `"user"` table entirely and reads from `identity.users` via the `user_id_mapping` table. This requires updating Better Auth's data source.

#### Actions

1. **Update Better Auth configuration** to point at `identity.users`:
   ```typescript
   // Project A's auth config
   betterAuth({
     database: {
       type: 'postgres',
       // Point to identity.users schema
       schema: 'identity',
       table: 'users',
       // Use UUID PK
       primaryKey: 'id',
     },
   });
   ```

2. **Update all Drizzle schema references**:
   - `auth-schema.ts`: Change `user` table references to `identity.users`
   - All 61 schema files that reference `"user"` FK must be updated

3. **Add cross-schema FK constraints** (if not already present):
   ```sql
   ALTER TABLE "session" ADD CONSTRAINT "session_user_fk"
     FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE;
   ```

4. **Verify `gaddr_users_compat` view** is no longer needed — drop it.

5. **Staging soak**: 7 days minimum.

#### Rollback
Revert Project A code. Restore `"user"` table references.

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | MEDIUM |
| Impact | HIGH (auth is critical path) |
| Mitigation | 7-day staging soak, comprehensive auth testing |

---

### Phase 9 — Remove Mapping Table & Cleanup

**Objective**: Remove `user_id_mapping`, drop vestigial objects, and finalize the unified architecture.

#### Pre-conditions
- Phase 6 monitoring stable for 14+ days
- Phase 8 production deploy stable for 7+ days
- All cross-project queries verified

#### Actions

1. **Verify no queries reference `user_id_mapping`**:
   ```sql
   -- Search application logs for mapping table references
   -- Grep codebase for "user_id_mapping"
   ```

2. **Drop `user_id_mapping`**:
   ```sql
   DROP TABLE IF EXISTS "user_id_mapping";
   ```

3. **Drop `gaddr_users_compat` view** (if not already dropped):
   ```sql
   DROP VIEW IF EXISTS "gaddr_users_compat";
   ```

4. **Drop vestigial objects**:
   - Remove `prisma.config.ts` (if exists)
   - Remove any unused Drizzle config
   - Remove dead code in repository implementations

5. **Update documentation**:
   - README.md
   - Migration strategy archive
   - RESTORE_REPORT.md post-migration status

6. **Final verification**:
   ```bash
   # Both projects
   npm run build && npm run lint
   # TypeORM diff check
   npm run migration:generate -- src/infrastructure/migrations/FinalDiff
   # Must produce ZERO diff
   ```

#### Rollback
Phase 0 restore (if within 30-day retention). Data written since Phase 0 is lost.

#### Risk
| Factor | Assessment |
|--------|------------|
| Likelihood | Low |
| Impact | MEDIUM (dropping table is permanent) |
| Mitigation | 14-day monitoring gate, backup retained 30+ days |

---

## Rollback Strategy

### Per-Phase Rollback Matrix

| Phase | Rollback Mechanism | Duration | Data Loss |
|-------|-------------------|----------|-----------|
| **Phase 0** | N/A (read-only) | N/A | None |
| **Phase 1** | Rename files back | < 1 min | None |
| **Phase 2** | `ALTER TABLE DROP COLUMN` | < 5 sec | None (columns were nullable, no data) |
| **Phase 3** | `pg_restore` from pre-phase3 dump | < 60 sec | Data written during Phase 3 window |
| **Phase 4** | `pg_restore` from pre-phase3 dump | < 60 sec | Data written since Phase 3 |
| **Phase 5** | Feature flag toggle + view drop | < 60 sec | None (additive views) |
| **Phase 6** | N/A (read-only validation) | N/A | None |
| **Phase 7** | Git revert + Cloud Run rollback | < 60 sec | None (code only) |
| **Phase 8** | Git revert (Project A) | < 60 sec | None (code only) |
| **Phase 9** | `pg_restore` from Phase 0 dump (if within 30 days) | < 60 sec | All data since Phase 0 |

### Emergency Restore Procedure

```bash
# 1. Stop both applications
# 2. Restore from latest backup
pg_restore -d "ep-little-poetry-asypeffl" --clean --if-exists <latest_dump>.dump
# 3. Verify row counts match backup
# 4. Restart applications
# 5. Both projects auto-run migrations on startup — verify no pending migrations
```

---

## Data Integrity Checks

### Pre-Migration Validation

```sql
-- 1. Row counts (capture before any changes)
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY schemaname, relname;

-- 2. FK integrity baseline
SELECT
  tc.table_schema, tc.table_name, kcu.column_name,
  ccu.table_schema AS foreign_schema,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_schema, tc.table_name;

-- 3. PK uniqueness verification
SELECT 'identity.users' AS tbl, COUNT(*), COUNT(DISTINCT id) FROM "identity"."users"
UNION ALL
SELECT 'public.user', COUNT(*), COUNT(DISTINCT id) FROM "user"
UNION ALL
SELECT 'public.youtube_accounts', COUNT(*), COUNT(DISTINCT id) FROM "youtube_accounts"
-- ... repeat for all tables with PK type changes
```

### Post-Migration Validation

```sql
-- 1. Verify row counts match pre-migration snapshot
-- 2. Verify no orphaned FKs
-- 3. Verify UUID format in all PK/FK columns
SELECT id FROM "identity"."users" WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 4. Verify password hashes exist for active users
SELECT u.id, u.email,
  CASE WHEN u."argon2Hash" IS NOT NULL THEN 'argon2' ELSE 'none' END AS argon2_status,
  CASE WHEN a.password IS NOT NULL THEN 'bcrypt' ELSE 'none' END AS bcrypt_status
FROM "identity"."users" u
LEFT JOIN "account" a ON a."user_id" = u.id AND a."provider_id" = 'credential'
WHERE u.id IN (SELECT DISTINCT "user_id" FROM "session");

-- 5. Verify TypeORM migration table is current
SELECT * FROM "typeorm_migrations" ORDER BY "timestamp" DESC LIMIT 5;

-- 6. Verify Drizzle migration table is current
SELECT * FROM "__drizzle_migrations" ORDER BY "created_at" DESC LIMIT 5;
```

---

## Testing Matrix

### Manual Test Scenarios

| # | Scenario | Project | Priority | Phase |
|---|----------|---------|----------|-------|
| 1 | User registration (email/password) | B | P0 | 6, 8 |
| 2 | User login (email/password) | B | P0 | 6, 8 |
| 3 | OAuth login (Google) | B | P0 | 6, 8 |
| 4 | 2FA enable/disable | B | P0 | 6, 8 |
| 5 | Password reset | B | P0 | 6, 8 |
| 6 | Profile update | B | P1 | 6, 8 |
| 7 | YouTube account connect | B | P1 | 6 |
| 8 | YouTube video upload | B | P1 | 6 |
| 9 | YouTube analytics import | B | P1 | 6 |
| 10 | Facebook page connect | B | P1 | 6 |
| 11 | Content upload (R2) | B | P1 | 6 |
| 12 | Playlist create/edit | B | P2 | 6 |
| 13 | Search (pg_trgm) | B | P1 | 6 |
| 14 | Rate limiting | B | P2 | 6 |
| 15 | Newsletter subscribe | B | P2 | 6 |
| 16 | BullMQ job processing (14 processors) | A+B | P0 | 5, 6 |
| 17 | User registration (Project A internal) | A | P2 | 8 |
| 18 | Cross-project user lookup | A+B | P0 | 6, 8 |

### Automated Verification

| Check | Command | Phase |
|-------|---------|-------|
| Build passes | `npm run build` | All |
| Lint passes | `npm run lint` | All |
| TypeORM zero diff | `npm run migration:generate -- tmp` | 6, 9 |
| Row count match | SQL query against `pg_stat_user_tables` | 6, 9 |
| FK integrity | SQL query against `pg_constraint` | 6, 9 |
| Extension presence | `SELECT * FROM pg_extension` | 0, 9 |

---

## Deployment Checklist

### Per-Phase Deployment

- [ ] Phase 0 backup taken and verified
- [ ] Build passes (`npm run build`) in both projects
- [ ] Lint passes (`npm run lint`) in both projects
- [ ] Migration tested on local Docker Postgres
- [ ] Migration tested on staging
- [ ] Staging soak period completed (48h for schema, 7d for data)
- [ ] Row count snapshot matches pre/post
- [ ] Manual smoke tests pass
- [ ] Application logs show zero database errors
- [ ] Rollback script tested
- [ ] Rollback script committed to repo

### Production Deployment (Phase 3, 4, 8)

- [ ] Fresh backup taken immediately before execution
- [ ] Both Project A and Project B instances scaled down (maintenance window)
- [ ] Migration executed and verified
- [ ] Both projects restarted with new code
- [ ] Application health checks pass
- [ ] Row count verification passes
- [ ] FK integrity verification passes
- [ ] Both projects' auto-migration reports zero pending
- [ ] Monitoring alerts configured
- [ ] Rollback procedure documented and accessible

---

## Monitoring Plan

### During Migration Phases

| Signal | Tool | Threshold | Action |
|--------|------|-----------|--------|
| Database errors | Application logs (Winston) | > 0 in 5 min | Investigate; rollback if P0 |
| Slow queries | `POSTGRES_LOGGING=true` | > 500ms | Optimize or rollback |
| Connection pool exhaustion | Neon dashboard | > 80% utilized | Scale up or investigate |
| BullMQ job failures | Redis monitoring | > 0 in 10 min | Investigate processor code |
| API error rate | Cloud Run metrics | > 1% 5xx | Rollback to previous version |
| Migration execution time | TypeORM/Drizzle logs | > 5 min | Investigate; may indicate lock contention |

### Post-Migration Monitoring (Phase 6)

| Signal | Tool | Duration | Threshold |
|--------|------|----------|-----------|
| Database errors | Winston logs | 14 days | 0 errors |
| Query performance | Neon dashboard | 14 days | No regression vs baseline |
| User auth success rate | Application metrics | 14 days | > 99% |
| Content upload success | Application metrics | 14 days | > 99% |
| BullMQ completion rate | Redis monitoring | 14 days | > 99% |
| Cold start time | Cloud Run metrics | 7 days | No regression |

---

## Risk Assessment

### Risk Matrix

| Risk | Likelihood | Impact | Score | Mitigation |
|------|-----------|--------|-------|------------|
| Data loss during PK migration | Low | Critical | **High** | Transactions, pre-backup, staging-first |
| Breaking FK constraints | Medium | High | **High** | FK integrity checks after every step |
| BullMQ job failures (stale PKs) | Medium | Medium | **Medium** | Flush Redis job data, test all 14 processors |
| Auto-migration race condition | Low | High | **Medium** | Advisory locks, idempotent migrations |
| Password hash mismatch (dual-hash) | Low | High | **Medium** | Rehash-on-login, comprehensive auth testing |
| Cross-project query failures | Medium | Medium | **Medium** | Staging validation, 48h soak |
| Drizzle migration state corruption | Low | High | **Medium** | Manual `__drizzle_migrations` audit |
| Neon connection limit exhaustion | Low | Medium | **Low** | Connection pooler handles this |
| Performance regression | Low | Medium | **Low** | EXPLAIN ANALYZE, index verification |
| Mapping table premature removal | Low | High | **Medium** | 14-day monitoring gate before Phase 9 |

### Risk Escalation

| Severity | Criteria | Response |
|----------|----------|----------|
| **P1 (Critical)** | Data loss, auth completely broken, all users affected | Immediate rollback + incident response |
| **P2 (High)** | Feature broken for subset of users, data corruption detected | Rollback within 15 minutes |
| **P3 (Medium)** | Performance degraded, non-critical feature broken | Investigate, fix forward if possible |
| **P4 (Low)** | Cosmetic issue, minor inconvenience | Schedule fix for next sprint |

---

## Timeline

### Gantt-Style Overview

```
Week 1  ███ Phase 0: Backup & Baseline
Week 1  ███ Phase 1: Fix Drizzle Numbering
Week 1-2  ███ Phase 2: Add Argon2Hash Columns
Week 2-3  ███████ Phase 3: Project A PK Migration (maintenance window)
Week 3-4  ███████ Phase 4: Shared Table PK Migration
Week 4-5  █████ Phase 5: Dual Compatibility Layer
Week 5-6  ███ Phase 6: Validation (starts after Phase 5)
Week 5-6  █████ Phase 7: Project B Application Cutover
Week 6-8  ███████ Phase 8: Project A Auth Switch (7-day soak)
Week 8-9  ███ Phase 9: Cleanup & Mapping Table Removal
         Week 9+  ██████████████ 14-day monitoring period
```

### Critical Path

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
                                                          ↓
                                                    Phase 7
                                                          ↓
                                                    Phase 8
                                                          ↓
                                                    Phase 9
```

### Dependencies

| Phase | Depends On | Blocked By |
|-------|-----------|------------|
| Phase 1 | Phase 0 | — |
| Phase 2 | Phase 0 | — |
| Phase 3 | Phase 0, 1, 2 | — |
| Phase 4 | Phase 3 | — |
| Phase 5 | Phase 4 | — |
| Phase 6 | Phase 5 | — |
| Phase 7 | Phase 5 | Phase 6 validation pass |
| Phase 8 | Phase 7 | Phase 6 validation pass |
| Phase 9 | Phase 8 | 14-day monitoring stable |

---

## Architecture Decision Records

### ADR-001: Auth Ownership — Project B Retains All Auth Endpoints

**Status**: Accepted (Option A from `12_Critical_Blocker_Decisions.md`)

**Context**: The frontend makes 22 auth API calls exclusively to Project B. Removing or moving these endpoints violates the hard constraint of zero frontend changes.

**Decision**: Project B keeps all auth endpoints (login, register, OAuth, 2FA, password reset, profile). Project A reads from the same `identity.users` table but does NOT serve auth to the frontend. Better Auth in Project A is used only for Project A's internal Next.js app.

**Consequences**:
- Two auth systems coexist (Better Auth in A, JWT in B)
- Password hashing differs (Argon2id in A, bcrypt in B) — resolved via dual-hash
- Project B carries all auth complexity

### ADR-002: Canonical User Table — `identity.users`

**Status**: Accepted (Option A from `12_Critical_Blocker_Decisions.md`)

**Context**: Two user tables exist (`public.user` text PK vs `identity.users` UUID PK). 18+ tables have FK dependencies on `identity.users`.

**Decision**: `identity.users` stays as the single source of truth. Project A's `"user"` table is absorbed into `identity.users`. Missing columns from `public.user` (stripeCustomerId, subscriptionStatus, etc.) are added to `identity.users`. 49 rows migrate from `public.user` to `identity.users`.

**Consequences**:
- 18+ FK constraints remain intact
- Project A must change from text PK to UUID PK
- `user_id_mapping` table is temporarily used, then removed in Phase 9

### ADR-003: PK Type — UUID Everywhere

**Status**: Accepted (Option A from `12_Critical_Blocker_Decisions.md`)

**Context**: Project A uses text PKs, Project B uses UUID PKs. FK constraints cannot span both.

**Decision**: Project A's `user.id` changes from text to UUID. Better Auth config updated to generate UUIDs. All of Project A's internal FKs (session, account, passkey) updated to UUID. `user_id_mapping` table eliminated.

**Consequences**:
- Single PK type across both projects
- Data migration required for existing text IDs
- Better Auth schema must be customized for UUID PKs

### ADR-004: JWT Claims — Keep securityStamp/concurrencyStamp

**Status**: Accepted (Option A from `12_Critical_Blocker_Decisions.md`)

**Context**: Frontend reads `securityStamp` and `concurrencyStamp` from JWT. Removing them breaks TypeScript compilation.

**Decision**: `securityStamp` and `concurrencyStamp` remain in the JWT payload. Frontend code unchanged. These values are already generated by Project B on every user update and are already exposed to the client.

**Consequences**:
- Zero frontend changes
- Minor JWT bloat (two additional string claims)
- Security stamps exposed to client (existing behavior, no regression)

### ADR-005: Password Hashing — Dual-Hash with Rehash-on-Login

**Status**: Accepted (Option A from `12_Critical_Blocker_Decisions.md`)

**Context**: Project A uses Argon2id, Project B uses bcrypt. Passwords created in one project cannot be verified by the other.

**Decision**: User table stores `passwordHash` (bcrypt, Project B) and `argon2Hash` (Project A). On login, if the "other" hash is missing, compute it and store it. New passwords are stored in both formats. Long-term plan: converge on Argon2id (OWASP recommended).

**Consequences**:
- Two hash columns (minor storage overhead)
- Two verification paths (both well-established libraries)
- No password resets required
- Gradual convergence to single algorithm

### ADR-006: Migration Management — Dual-ORM Transition

**Status**: Accepted

**Context**: Project A uses Drizzle migrations (86 files), Project B uses TypeORM migrations (44 files). Both auto-run on startup.

**Decision**: Phase 1 resolves Drizzle numbering conflicts. Phase 2-4 are managed as TypeORM migrations in Project B (since Project B is the identity provider). Project A's Drizzle migrations are frozen after Phase 1 — no new Drizzle migrations will be created. Future schema changes go through TypeORM only.

**Consequences**:
- Single migration authority (TypeORM) after Phase 4
- Drizzle migration history preserved but no longer active
- `drizzle.config.ts` retained for introspection but not for new migrations

---

## Open Questions

| # | Question | Impact | Status | Owner |
|---|----------|--------|--------|-------|
| 1 | How many of the 86 Drizzle migrations are actually applied to production? The catchup migration (`0078_catchup_apply_all_missing.sql`) suggests many were never applied. | HIGH | **Needs investigation** — Phase 0 audit | Engineering |
| 2 | What is the exact count of users in `"user"` (Project A) vs `identity.users` (Project B)? Are there overlaps (same email in both tables)? | HIGH | **Needs investigation** — Phase 0 query | Engineering |
| 3 | Does Project A's Better Auth support UUID PKs out of the box, or does it require a custom adapter? | HIGH | **Needs investigation** — Phase 3 dependency | Engineering |
| 4 | What is the exact set of 14 BullMQ processors in Project A, and which ones reference user PKs in job payloads? | MEDIUM | **Needs inventory** — Phase 5 dependency | Engineering |
| 5 | Should `POSTGRES_MIGRATIONS_RUN=true` be disabled for Phase 3 (the PK migration) to prevent auto-migration during the maintenance window? | MEDIUM | **Decision needed** — affects deployment safety | Engineering |
| 6 | What is the Redis TTL for BullMQ job data? Can stale job references survive past Phase 4? | LOW | **Needs verification** — Phase 5 dependency | Engineering |
| 7 | Is Cloudinary still actively used, or can it be decommissioned during cleanup? | LOW | **Needs investigation** — Phase 9 | Engineering |
| 8 | Should the `gaddr_users_compat` view be dropped in Phase 5 or Phase 9? | LOW | **Decision needed** | Engineering |

---

*Document version: 2.0*
*Created: 2026-07-19*
*Supersedes: 05_Migration_Strategy.md (v1)*
*Review cycle: After each phase completion*
