# 10 — Risk Register (Session 8)

**Date:** 2026-07-19
**Total Risks:** 18
**Critical:** 1 | **High:** 6 | **Medium:** 8 | **Low:** 3

---

## Risk Scoring

- **Likelihood:** 1 (Rare) → 5 (Almost Certain)
- **Impact:** 1 (Negligible) → 5 (Catastrophic)
- **Score:** Likelihood × Impact
- **Threshold:** ≥15 Critical, ≥10 High, ≥5 Medium, <5 Low

---

## Critical Risks (Score ≥ 15)

### R01 — Cross-System User Identity Fragmentation

| Field | Value |
|-------|-------|
| **Score** | 20 (L:4 × I:5) |
| **Category** | Authentication / Architecture |
| **Description** | Project A (Better Auth / `auth.user`) and Project B (TypeORM / `identity.users`) maintain completely separate user tables with different PK types (text vs UUID). Users registered in one system cannot authenticate in the other. Four users were found with matching emails but different IDs during the RESTORE_REPORT merge. |
| **Impact** | Users must maintain separate accounts for each app. No shared profile, preferences, or billing. Data migration becomes exponentially harder as both systems accumulate users. |
| **Mitigation** | Implement `UserIdMapping` table immediately (documented in `01_ProjectA_Architecture.md`). Use email as the initial bridge key. Designate one system as the identity authority. |
| **Owner** | Both projects |
| **Status** | Open |
| **Deadline** | Before any shared functionality is built |

---

## High Risks (Score 10–14)

### R02 — Password Hashing Incompatibility

| Field | Value |
|-------|-------|
| **Score** | 16 (L:4 × I:4) |
| **Category** | Authentication / Security |
| **Description** | Project B uses bcrypt (cost 10). Project A uses Argon2id. Passwords hashed by one system cannot be verified by the other. |
| **Impact** | If shared login is ever implemented, users would need to re-register or re-set passwords. Dual-hash migration is complex and must be done carefully to avoid lockouts. |
| **Mitigation** | Standardize on Argon2id for new hashes. On cross-system login attempt, verify with legacy hash, then re-hash with target algorithm. Never store both hashes permanently without migration completion. |
| **Owner** | Both projects |
| **Status** | Open |

### R03 — 18+ Tables Without FK Constraints

| Field | Value |
|-------|-------|
| **Score** | 15 (L:5 × I:3) |
| **Category** | Database / Data Integrity |
| **Description** | `userRoles`, `userClaims`, `userLogins`, `roleClaims`, `linkedAccounts`, `publish_jobs`, `notifications`, `youtube_accounts`, `youtube_videos`, `upload_jobs` all lack FK constraints to their parent tables. |
| **Impact** | Any user deletion leaves orphaned rows. Over time, orphan accumulation degrades query performance and causes inconsistent state. |
| **Mitigation** | Add FK constraints in Phase 1 of migration strategy. Use RESTRICT for feature→identity references (prevents accidental cascades). CASCADE only within identity aggregate. |
| **Owner** | Project B |
| **Status** | Open |
| **Reference** | `04_Shared_Identity_Architecture.md` |

### R04 — OAuth Account Linking Divergence

| Field | Value |
|-------|-------|
| **Score** | 12 (L:3 × I:4) |
| **Category** | Authentication / Architecture |
| **Description** | Project B stores Google ID in `users.googleId` column and Facebook data in `linkedAccounts`. Project A stores OAuth data in `account` table (Better Auth pattern). Different storage patterns, different queries. |
| **Impact** | A user who authenticates with Google in Project B and then tries to log in via Google in Project A will get a separate account. |
| **Mitigation** | Create `identity.user_oauth_providers` table (proposed in `04_Shared_Identity_Architecture.md`) with `(provider, provider_uid)` unique constraint. Both projects write to this table on OAuth login. |
| **Owner** | Both projects |
| **Status** | Open |

### R05 — Refresh Token Incompatibility

| Field | Value |
|-------|-------|
| **Score** | 10 (L:2 × I:5) |
| **Category** | Authentication / Security |
| **Description** | Project B uses opaque random hex tokens in `userLogins`. Project A uses Better Auth opaque tokens in `session` table. Different formats, different validation, different rotation strategies. |
| **Impact** | Refresh tokens from one system cannot be used in the other. Users must re-authenticate when switching between apps. |
| **Mitigation** | For shared identity: implement `identity.sessions` table that both projects reference. Until then, accept the limitation and document it clearly. |
| **Owner** | Both projects |
| **Status** | Open |

### R06 — Redis Connection Pool Saturation

| Field | Value |
|-------|-------|
| **Score** | 12 (L:3 × I:4) |
| **Category** | Infrastructure / Reliability |
| **Description** | Current Redis connection count is ~23-25, approaching the 30-connection typical limit. 10 BullMQ workers each use a blocking connection. |
| **Impact** | Connection exhaustion causes BullMQ job failures, cache misses, and session validation errors. Recovery requires Redis restart. |
| **Mitigation** | Reduce queue workers from 10 to 5 (YouTube, Facebook, Instagram, TikTok, LinkedIn — the active platforms). Use shared Redis connection for non-critical services. Add `skipVersionCheck: true` to Redis options. |
| **Owner** | Project B |
| **Status** | Open |
| **Reference** | `analysis-youtube-analytics-import.md` Issue 4 |

### R07 — YouTube Import Error Handling Gap

| Field | Value |
|-------|-------|
| **Score** | 10 (L:3 × I:3.3) |
| **Category** | Reliability / Data Integrity |
| **Description** | `importUploadsAsync` has no error handling. Any single API call or DB save failure aborts the entire import. Videos saved before failure persist, causing partial imports (the "exactly 1 video" symptom). |
| **Impact** | Users see incomplete imports. On Render (0.1 vCPU, 512 MB), network timeouts cause frequent failures. No retry mechanism exists. |
| **Mitigation** | Wrap each video save in try-catch. Add progress tracking in DB. Implement BullMQ queue-based import (already partially exists but is disabled). |
| **Owner** | Project B |
| **Status** | Open |
| **Reference** | `analysis-youtube-analytics-import.md` Issue 2 |

---

## Medium Risks (Score 5–9)

### R08 — Vestigial Prisma Configuration

| Field | Value |
|-------|-------|
| **Score** | 6 (L:3 × I:2) |
| **Category** | Build / Maintenance |
| **Description** | `prisma.config.ts` exists but Prisma is a devDependency with no schema file. Could confuse new developers or CI pipelines. |
| **Mitigation** | Delete `prisma.config.ts`. Remove Prisma devDependency if confirmed unused. |
| **Owner** | Project B |
| **Status** | Open |

### R09 — RoleClaim Type Bug

| Field | Value |
|-------|-------|
| **Score** | 6 (L:3 × I:2) |
| **Category** | Code Quality / ORM |
| **Description** | `RoleClaim.role` is typed as `Role[]` but `@ManyToOne` returns a single `Role` instance. TypeORM may silently return the wrong type at runtime. |
| **Mitigation** | Change type from `Role[]` to `Role`. Add `@ManyToOne(() => Role, role => role.roleClaims)` decorator (already present, just fix the return type). |
| **Owner** | Project B |
| **Status** | Open |
| **Reference** | `02_ProjectB_Architecture.md` C3 |

### R10 — Missing Notification Columns

| Field | Value |
|-------|-------|
| **Score** | 6 (L:3 × I:2) |
| **Category** | Feature / Frontend |
| **Description** | Frontend expects `link` and `isRead` columns on notifications. Entity has neither. |
| **Mitigation** | Add `link: string` (nullable) and `isRead: boolean` (default false) to Notification entity. Create migration. |
| **Owner** | Project B |
| **Status** | Open |
| **Reference** | `02_ProjectB_Architecture.md` |

### R11 — Email Normalization Divergence

| Field | Value |
|-------|-------|
| **Score** | 8 (L:4 × I:2) |
| **Category** | Authentication / Data Integrity |
| **Description** | Project B uses `trim().toLowerCase()`. Project A uses Better Auth's built-in normalization. If Better Auth does plus-addressing removal or Gmail dot-stripping, the same email could create two accounts. |
| **Impact** | Duplicate accounts for the same email. User confusion. Data fragmentation. |
| **Mitigation** | Verify Better Auth normalization matches `trim().toLowerCase()`. If not, add a pre-processing step in Better Auth hooks. Document the normalization contract. |
| **Owner** | Both projects |
| **Status** | Open |

### R12 — Production Schema Drift

| Field | Value |
|-------|-------|
| **Score** | 6 (L:3 × I:2) |
| **Category** | Database / Deployment |
| **Description** | `RESTORE_REPORT.md` found that production `public.user` table has different columns than `identity.users`. YouTube analytics tables are missing columns in production. TypeORM entities don't match deployed schema. |
| **Impact** | New code that references entity columns may fail at runtime with "column does not exist" errors. |
| **Mitigation** | Run `migration:generate` against production to detect drift. Create reconciliation migration. |
| **Owner** | Project B |
| **Status** | Open |

### R13 — Auto-Migration on Startup

| Field | Value |
|-------|-------|
| **Score** | 8 (L:4 × I:2) |
| **Category** | Deployment / Reliability |
| **Description** | `POSTGRES_MIGRATIONS_RUN=true` runs all 44 migrations on every startup. If a migration partially fails, the `migrations` table may record it as complete while the schema is inconsistent. |
| **Impact** | Subsequent startups skip the failed migration. Database is left in an inconsistent state. |
| **Mitigation** | Add health-check query after migration run. Consider using a separate migration step in CI/CD instead of startup. Add `IF NOT EXISTS` guards to all DDL statements. |
| **Owner** | Project B |
| **Status** | Open |

### R14 — BaseEntity.lastRefreshed Never Updated

| Field | Value |
|-------|-------|
| **Score** | 5 (L:5 × I:1) |
| **Category** | Code Quality / ORM |
| **Description** | `BaseEntity.lastRefreshed` is set to `CURRENT_TIMESTAMP` on insert but never updated by TypeORM's `@UpdateDateColumn`. The `@BeforeUpdate` hook sets `lastModifiedOn` but not `lastRefreshed`. |
| **Impact** | `lastRefreshed` is always the creation timestamp. Any logic relying on this field for cache invalidation or staleness detection is broken. |
| **Mitigation** | Either remove the column (if unused) or add explicit update logic in services that refresh data. |
| **Owner** | Project B |
| **Status** | Open |

### R15 — UserClaim PK Inconsistency

| Field | Value |
|-------|-------|
| **Score** | 5 (L:5 × I:1) |
| **Category** | ORM / Schema |
| **Description** | `UserClaim` uses `@PrimaryGeneratedColumn('increment')` (auto-increment integer) while all other entities use UUID. It does not extend BaseEntity. |
| **Impact** | Different PK strategy complicates the Drizzle migration. Auto-increment PKs don't work well with distributed systems. |
| **Mitigation** | Migrate to UUID PK in Phase 2 of migration strategy. Use `gen_random_uuid()` for new PKs. |
| **Owner** | Project B |
| **Status** | Open |

---

## Low Risks (Score 1–4)

### R16 — JWT Secret Exposure

| Field | Value |
|-------|-------|
| **Score** | 4 (L:2 × I:2) |
| **Category** | Security |
| **Description** | Frontend `.env.local` contains JWT secret. If repository is public or leaked, tokens can be forged. |
| **Mitigation** | Use asymmetric JWT (RS256) with public key in frontend for validation only. Or move JWT validation to a BFF (Backend for Frontend) pattern. |
| **Owner** | Project B + Frontend |
| **Status** | Open |
| **Reference** | `02_ProjectB_Architecture.md` C1 |

### R17 — Notification Status Enum Dead Code

| Field | Value |
|-------|-------|
| **Score** | 2 (L:2 × I:1) |
| **Category** | Code Quality |
| **Description** | `NotificationStatus` enum is defined but never used in any entity or service. Dead code increases maintenance burden. |
| **Mitigation** | Remove the enum if truly unused, or document where it will be used. |
| **Owner** | Project B |
| **Status** | Open |

### R18 — Missing E2E Test Coverage

| Field | Value |
|-------|-------|
| **Score** | 4 (L:2 × I:2) |
| **Category** | Quality / Testing |
| **Description** | Only 1 spec file exists (`test/app.e2e-spec.ts`). Zero unit tests for auth, profile, analytics, or import flows. Regression detection is manual. |
| **Impact** | Bugs are discovered in production. Migration failures go undetected until users report errors. |
| **Mitigation** | Add E2E tests for critical paths: register, login, refresh token, import, publish. Run in CI against Docker Postgres. |
| **Owner** | Project B |
| **Status** | Open |

---

## Risk Heat Map

```
              Impact →
              1    2    3    4    5
    L  5 | R14 R15  —    —    —
    i  4 |  —    —   R11   —   R01
    k  3 |  —    —    —   R06  R02
    e  2 | R17 R16 R18   —   R05
    l  1 |  —    —    —    —    —
```

---

## Top 5 Actions

1. **Implement UserIdMapping** — Bridge user identity across projects (R01)
2. **Add FK constraints** — Prevent orphan records (R03)
3. **Fix YouTube import error handling** — Stop partial imports (R07)
4. **Reduce Redis connections** — Prevent pool exhaustion (R06)
5. **Reconcile production schema** — Align entities with deployed tables (R12)
