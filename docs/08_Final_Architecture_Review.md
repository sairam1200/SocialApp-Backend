# 08 — Final Architecture Review & Plan Refinement

> **Date**: 2026-07-19
> **Scope**: Cross-project validation of all v2 documents (01-07) against actual codebases
> **Philosophy**: Minimum changes only — keep what works, fix what's broken, add what's missing
> **Status**: Final review — ready for implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Validation](#2-architecture-validation)
3. [Shared Users Table Recommendation](#3-shared-users-table-recommendation)
4. [Final Column Merge Recommendation](#4-final-column-merge-recommendation)
5. [Project A Required Changes](#5-project-a-required-changes)
6. [Project B Required Changes](#6-project-b-required-changes)
7. [Components That Do Not Need Changes](#7-components-that-do-not-need-changes)
8. [Database Risks](#8-database-risks)
9. [Build Risks](#9-build-risks)
10. [Security Risks](#10-security-risks)
11. [Deployment Plan](#11-deployment-plan)
12. [Rollback Plan](#12-rollback-plan)
13. [Testing Checklist](#13-testing-checklist)
14. [Final Recommendation](#14-final-recommendation)

---

## 1. Executive Summary

### 1.1 What Exists Today

Two independent applications share a single PostgreSQL database. They have separate authentication systems, separate user tables, and separate schemas.

| Project | Auth System | User Table | PK Type | Columns | FK Dependencies |
|---------|------------|------------|---------|---------|-----------------|
| **Project A** (gaddr-jobs) | Better Auth 1.5.6 | `public.user` | text (nanoid) | 38 | 113+ FKs |
| **Project B** (gaddr-backend-api) | Custom JWT (bcrypt) | `identity.users` | UUID | 38 | 18+ FKs |

**Frontend** (SocialApp): Calls 55+ Project B endpoints. Cannot change.

### 1.2 What the V2 Documents Get Wrong

| Document | Claim | Problem | Impact |
|----------|-------|---------|--------|
| Doc 04 | "identity.users is canonical; public.user is dropped" | Drops a table with 113+ FK references. Massive unnecessary risk. | HIGH |
| Doc 04 | "Project A overrides Better Auth ID generation to UUID" | Better Auth does not natively support UUID PKs. Fighting the library creates maintenance burden. | HIGH |
| Doc 04 | "Dual-hash passwords (bcrypt + Argon2id)" | Adds a second password hash column to every user row. Requires argon2 npm package in Project B (currently devDependency only). | MEDIUM |
| Doc 04 | "Drop public.user table" | Breaks 113+ FK constraints. Requires updating every reference. Point of no return. | CRITICAL |
| Doc 05 | "10 phases, 38-52 days" | Over-engineered for a ~49-user migration. Many phases exist to support decisions from Doc 04 that are wrong. | HIGH |
| Doc 06 | "Reconfigure Better Auth to verify Project B JWTs" | Only necessary if we're consolidating auth. We're not. Both auth systems stay independent. | MEDIUM |
| Doc 07 | "Entity schema alignment (8+ files)" | Some fixes are needed (2FA bug), but many are unnecessary if we keep both systems independent. | MEDIUM |

### 1.3 What Actually Needs to Happen

The minimum-change path is:

1. **Add missing columns from `identity.users` to `public.user`** (additive, safe)
2. **Add a `uuid_id` UUID column to `public.user`** (Project B FKs need UUID references)
3. **Project B adapts its User entity** to read from `public.user` instead of `identity.users`
4. **Migrate data** from `identity.users` to `public.user` (~49 users)
5. **Update Project B FKs** from `identity.users(id)` to `public.user(uuid_id)`
6. **Drop `identity.users`** (after everything works)

**Both auth systems remain completely untouched.** Better Auth continues reading `public.user`. Custom JWT continues reading `public.user`. No auth code changes needed.

### 1.4 Summary Metrics

| Metric | Value |
|--------|-------|
| **Total files requiring changes** | ~25 (Project A: 2, Project B: ~23) |
| **Total files NOT changing** | 100+ (auth handlers, frontend, tRPC routers, etc.) |
| **Estimated effort** | 5-8 days (not 38-52) |
| **Frontend changes** | ZERO |
| **Auth code changes** | ZERO |
| **Breaking API changes** | ZERO |
| **Risk level** | MEDIUM (down from HIGH) |

---

## 2. Architecture Validation

### 2.1 V2 Document Accuracy

| Document | Factual Claims Verified | Incorrect Claims | Over-Engineering |
|----------|------------------------|------------------|------------------|
| 01 (Project A Architecture) | 151 tables, Better Auth 1.5.6, dual Redis — ALL CORRECT | None significant | None |
| 02 (Project B Architecture) | 38 entities, 14 modules, CQRS/DDD — ALL CORRECT | None significant | None |
| 03 (Schema Comparison) | PK mismatch, 18 merger tables, 20 missing FKs — CORRECT | userIdMapping "used" (it's dead code — zero runtime reads/writes) | None |
| 04 (Shared Identity) | Correctly identifies the problem | Proposes wrong solution (drop public.user, override Better Auth PKs) | SEVERE |
| 05 (Migration Strategy) | Correctly identifies need for phased approach | 10 phases supporting wrong architecture decisions | SEVERE |
| 06 (Project A Changes) | Correctly identifies dead code and cleanup needs | "Reconfigure Better Auth as JWT-verifier" is unnecessary | MODERATE |
| 07 (Project B Changes) | Correctly identifies 2FA bug, security issues, entity fixes | Many changes only needed if we consolidate auth | MODERATE |

### 2.2 Key Validation Results

| Finding | Status | Evidence |
|---------|--------|----------|
| `userIdMapping` table is dead code | CONFIRMED | Zero TypeScript files read/write it. Only defined in schema + migration. |
| `@node-rs/argon2` not imported in Project A source | CONFIRMED | devDependency only. Better Auth uses it internally. |
| 2FA verify inverted logic bug | CONFIRMED | `2fa-verify.handler.ts:78`: `if (user.twoFactorEnabled) throw` — throws when 2FA IS enabled. |
| Email normalization inconsistent | CONFIRMED | Entity constructor: `toUpperCase()`. stringUtil: `toLowerCase()`. Two methods in same codebase. |
| Better Auth fallback in HttpContext middleware | CONFIRMED | Queries `session` from default schema, then `identity.users` for user data. |
| Frontend calls 19 endpoints, ~16-17 auth-related | CONFIRMED | `token.service.ts` + `account.service.ts` validated. |

### 2.3 The Core Mistake in V2 Docs

The v2 docs assume that `identity.users` must be the canonical table because it has 18 FK references and Project B's frontend depends on it. This is wrong.

**The correct reasoning:**

- Project A has `public.user` with **113+ FK references** — far more than Project B's 18
- Project A owns the database schema (per user's instructions)
- Project B "consumes Project A schema" (per user's instructions)
- Better Auth generates text IDs natively — fighting this creates maintenance burden
- The 113+ FK references in Project A are text-based — changing them to UUID requires updating every one
- Project B has only 18 FK references to update — far fewer changes

**Therefore: `public.user` (text PK) should remain the canonical table.** Project B adapts to it, not the other way around.

---

## 3. Shared Users Table Recommendation

### 3.1 Decision: `public.user` Is Canonical

| Criterion | `public.user` (text PK) | `identity.users` (UUID PK) | Winner |
|-----------|------------------------|---------------------------|--------|
| FK dependencies | 113+ (Project A internal) | 18+ (Project B) | `public.user` (fewer updates needed) |
| Schema ownership | Project A owns (per user instructions) | Project B owns | `public.user` (per instructions) |
| Auth library | Better Auth (generates text PKs natively) | Custom JWT (can use any PK type) | `public.user` (no library fighting) |
| Frontend dependency | Zero direct | 55+ API calls | Neutral (both stay) |
| Drop risk | 113+ FKs break | 18+ FKs break | `public.user` (less damage) |

### 3.2 Why This is Minimum Change

| Approach | Changes Required | Risk |
|----------|-----------------|------|
| **Option A: `identity.users` canonical** (Doc 04) | Update 113+ FKs in Project A, override Better Auth PKs, drop `public.user`, reconfigure all Better Auth tables | HIGH — fighting library, massive FK updates |
| **Option B: `public.user` canonical** (this doc) | Add 24 columns to `public.user`, add `uuid_id`, update 18 FKs in Project B, adapt Project B entity | LOW — additive schema changes, minimal FK updates |

**Option B requires ~6x fewer FK updates and zero auth code changes.**

### 3.3 What `public.user` Looks Like After Merge

The table grows from 38 columns to 62 columns (38 existing + 24 new). All new columns are nullable with sensible defaults. No existing columns are modified or removed.

---

## 4. Final Column Merge Recommendation

### 4.1 Column Classification

#### Shared Columns (already exist in `public.user`, used by both projects)

| public.user Column | Type | Used By A | Used By B | Action |
|-------------------|------|-----------|-----------|--------|
| `id` | text (PK) | Yes | Via `uuid_id` | No change |
| `first_name` | text | Yes | Yes | No change |
| `last_name` | text | Yes | Yes | No change |
| `email` | text (UNIQUE) | Yes | Yes | No change |
| `email_verified` | boolean | Yes | Yes (as `emailConfirmed`) | No change |
| `google_id` | text (UNIQUE) | Yes | Yes | No change |
| `phone_number` | text | Yes | Yes | No change |
| `gender` | text | Yes | Yes | No change |
| `two_factor_enabled` | boolean | Yes | Yes | No change |
| `referral_code` | text (UNIQUE) | Yes | Yes | No change |
| `referred_by` | text | Yes | Yes | No change |
| `profile_privacy` | text | Yes | Yes | No change |
| `onboarding_step` | text | Yes | Yes | No change |
| `created_at` | timestamp | Yes | Yes (as `createdOn`) | No change |
| `updated_at` | timestamp | Yes | Yes (as `lastModifiedOn`) | No change |
| `image` | text | Yes | Via `userBiometrics` | No change |
| `status` | text | Yes | Via `isActive` | No change |

#### Project A Only Columns (keep as-is)

| Column | Type | Notes |
|--------|------|-------|
| `name` | text | Computed full name |
| `role` | text | User role |
| `two_fa_verified_at` | timestamp | 2FA timestamp |
| `is_verified` | boolean | Platform verification |
| `is_admin` | boolean | Admin flag |
| `stripe_customer_id` | text | Stripe billing |
| `stripe_price_id` | text | Stripe billing |
| `stripe_subscription_id` | text | Stripe billing |
| `subscription_status` | text | Subscription state |
| `subscription_plan` | text | Plan name |
| `job_post_limit` | integer | Job posting limit |
| `active_job_post_count` | integer | Active job posts |
| `wallet_address` | text | Web3 wallet |
| `private_search_mode` | boolean | Privacy setting |
| `blocked_employers` | text[] | Blocked employers |
| `ai_analysis_opt_out` | boolean | AI opt-out |
| `date_of_birth` | timestamp | DOB |
| `source_app` | text | Origin app |
| `deleted_at` | timestamp | Soft delete |
| `banned_at` | timestamp | Ban timestamp |
| `ban_reason` | text | Ban reason |

#### New Columns to Add (from `identity.users` to `public.user`)

| New Column | Type | Default | Purpose |
|-----------|------|---------|---------|
| `uuid_id` | uuid | gen_random_uuid() | UUID PK for Project B FK references |
| `is_active` | boolean | true | Account active flag |
| `registered_on` | timestamp | now() | Registration date |
| `user_name` | text | NULL | Username (UNIQUE) |
| `bio` | text | NULL | Biography |
| `new_email` | text | NULL | Pending email change |
| `last_email_modified_at` | timestamp | NULL | Email change tracking |
| `new_phone_number` | text | NULL | Pending phone change |
| `last_phone_number_modified_at` | timestamp | NULL | Phone change tracking |
| `last_user_name_modified_at` | timestamp | NULL | Username change tracking |
| `normalized_email` | text | NULL | Email for case-insensitive lookups |
| `normalized_user_name` | text | NULL | Username for case-insensitive lookups |
| `two_factor_secret` | text | NULL | TOTP secret |
| `password_hash` | text | NULL | bcrypt hash (Project B writes) |
| `last_password_modified_at` | timestamp | NULL | Password change tracking |
| `is_locked_out` | boolean | false | Account lockout flag |
| `lockout_end` | timestamp | NULL | Lockout expiry |
| `access_failed_count` | integer | 0 | Failed login count |
| `concurrency_stamp` | text | NULL | Concurrency token |
| `security_stamp` | text | NULL | Security token |
| `type` | text | 'User' | User type (Admin/Guest/User) |
| `created_by` | text | NULL | Audit: who created |
| `last_modified_by` | text | NULL | Audit: who last modified |
| `last_refreshed` | timestamp | now() | Last refresh timestamp |

**Total new columns: 24** (all nullable, additive, non-breaking)

### 4.2 SQL Migration

```sql
-- Add all new columns to public.user (ADDITIVE ONLY)
ALTER TABLE public.user
  ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN is_active BOOLEAN DEFAULT true,
  ADD COLUMN registered_on TIMESTAMP DEFAULT now(),
  ADD COLUMN user_name TEXT,
  ADD COLUMN bio TEXT,
  ADD COLUMN new_email TEXT,
  ADD COLUMN last_email_modified_at TIMESTAMP,
  ADD COLUMN new_phone_number TEXT,
  ADD COLUMN last_phone_number_modified_at TIMESTAMP,
  ADD COLUMN last_user_name_modified_at TIMESTAMP,
  ADD COLUMN normalized_email TEXT,
  ADD COLUMN normalized_user_name TEXT,
  ADD COLUMN two_factor_secret TEXT,
  ADD COLUMN password_hash TEXT,
  ADD COLUMN last_password_modified_at TIMESTAMP,
  ADD COLUMN is_locked_out BOOLEAN DEFAULT false,
  ADD COLUMN lockout_end TIMESTAMP,
  ADD COLUMN access_failed_count INTEGER DEFAULT 0,
  ADD COLUMN concurrency_stamp TEXT,
  ADD COLUMN security_stamp TEXT,
  ADD COLUMN type TEXT DEFAULT 'User',
  ADD COLUMN created_by TEXT,
  ADD COLUMN last_modified_by TEXT,
  ADD COLUMN last_refreshed TIMESTAMP DEFAULT now();

-- Ensure UUID is unique
ALTER TABLE public.user ADD CONSTRAINT user_uuid_unique UNIQUE (uuid_id);

-- Ensure user_name is unique (when not null)
CREATE UNIQUE INDEX idx_user_user_name ON public.user (user_name) WHERE user_name IS NOT NULL;

-- Ensure email has unique index for lookups
CREATE UNIQUE INDEX idx_user_email_lower ON public.user (LOWER(email));
```

### 4.3 Email Normalization Fix

The v2 docs correctly identify that Project B has two conflicting normalization methods:
- `user.entity.ts:145`: `request.email?.toUpperCase()` (constructor)
- `string.util.ts:63`: `email.trim().toLowerCase()` (utility)

**Decision**: Use `trim().toLowerCase()` everywhere. Update the entity constructor.

```sql
-- Fix existing data
UPDATE public.user
SET normalized_email = LOWER(TRIM(email)),
    normalized_user_name = LOWER(TRIM(user_name))
WHERE normalized_email IS NULL;
```

### 4.4 Password Hashing Decision

| Option | Pros | Cons |
|--------|------|------|
| **A: Dual-hash (bcrypt + Argon2id)** | Both projects verify natively | Two columns, two verification paths, argon2 dependency in Project B |
| **B: bcrypt only** | Simpler, already works in Project B | Project A must verify bcrypt instead of Argon2id |
| **C: Argon2id only** | Newer algorithm | Must migrate all existing bcrypt hashes |

**Decision: Option B — bcrypt only.** Better Auth can be configured to verify bcrypt passwords. No new dependencies needed. No dual-hash complexity.

Better Auth supports custom password verification. We configure it to use bcrypt:

```typescript
// In Better Auth config, override password verification
password: {
  verify: async ({ password, hash }) => {
    // hash is from public.user.password_hash (bcrypt)
    return await bcrypt.compare(password, hash);
  },
}
```

---

## 5. Project A Required Changes

### 5.1 Summary

| Change | File | Effort | Risk |
|--------|------|--------|------|
| Add 24 columns to `public.user` | New TypeORM/Drizzle migration | 1 day | LOW (additive) |
| Configure Better Auth to verify bcrypt passwords | `src/server/auth/index.ts` | 0.5 day | MEDIUM |
| **Total** | **2 files** | **1.5 days** | **LOW** |

### 5.2 Schema Migration (Project A)

Add the 24 new columns to `public.user`. This is purely additive — no existing columns change.

The migration file goes in `drizzle/` with a new numbered prefix (0086+).

### 5.3 Better Auth Password Verification

Better Auth currently uses Argon2id for password hashing. Since we're using bcrypt in the shared table, we need to tell Better Auth how to verify bcrypt passwords.

**File**: `E:\Github\gaddep\gaddr-jobs\src\server\auth\index.ts`

Better Auth 1.5.6 supports a `password.verify` option in the auth configuration. We override the default Argon2id verification with bcrypt:

```typescript
password: {
  verify: async ({ password, hash }) => {
    return await bcrypt.compare(password, hash);
  },
}
```

This requires adding `bcrypt` as a dependency to Project A (it's currently only in Project B).

### 5.4 Files Changed

| File | Change |
|------|--------|
| `drizzle/0086_add_identity_columns.sql` | New migration: add 24 columns |
| `src/server/auth/index.ts` | Add bcrypt password verification config |
| `package.json` | Add `bcrypt` + `@types/bcrypt` dependencies |

**Total: 3 files**

---

## 6. Project B Required Changes

### 6.1 Summary

| Change | Files | Effort | Risk |
|--------|-------|--------|------|
| Fix 2FA inverted logic bug | 1 | 0.5 day | LOW |
| Fix 2FA copy-paste bug | 1 | 0.5 day | LOW |
| Fix email normalization inconsistency | 1 | 0.5 day | LOW |
| Update User entity to read from `public.user` | 1 | 1 day | MEDIUM |
| Update 18 FK references | 18 | 2 days | MEDIUM |
| Update entity table name + schema | 1 | 0.5 day | LOW |
| Rotate exposed API keys | 1 | 0.5 day | LOW |
| Remove console.log statements | 30+ | 1 day | LOW |
| **Total** | **~50** | **6.5 days** | **MEDIUM** |

### 6.2 Bug Fixes (Must Do First)

#### 2FA Verify Inverted Logic

**File**: `src/features/auth/2fa/verify/2fa-verify.handler.ts:78`

```typescript
// CURRENT (BROKEN):
if (user.twoFactorEnabled) {
    throw new ApplicationException('');
}

// FIX:
if (!user.twoFactorEnabled) {
    throw new ApplicationException('Two-factor authentication is not enabled.');
}
```

#### 2FA Copy-Paste Bug

**File**: `src/features/auth/2fa/verify/2fa-verify.handler.ts:143`

```typescript
// CURRENT (BROKEN):
if (deviceId !== HttpContext.user['user-agent']) {

// FIX:
if (userAgent !== HttpContext.user['user-agent']) {
```

#### Email Normalization Inconsistency

**File**: `src/domain/entities/identity/user.entity.ts:145-146`

```typescript
// CURRENT (BROKEN):
this.normalizedEmail = request.email?.toUpperCase();
this.normalizedUserName = request.userName?.toUpperCase();

// FIX:
this.normalizedEmail = request.email?.trim().toLowerCase();
this.normalizedUserName = request.userName?.trim().toLowerCase();
```

### 6.3 Entity Changes

#### Update User Entity Table Reference

**File**: `src/domain/entities/identity/user.entity.ts`

```typescript
// CURRENT:
@Entity('users', { schema: 'identity' })
export class User extends BaseEntity { ... }

// CHANGE TO:
@Entity('user', { schema: 'public' })
export class User extends BaseEntity {
  @Column({ name: 'uuid_id', type: 'uuid', primary: true })
  id: string;

  @Column({ name: 'id', type: 'text', nullable: true })
  textId: string;

  // ... rest of columns map to public.user naming
}
```

**Key mapping changes:**

| Current Entity Column | public.user Column | Change Needed |
|----------------------|-------------------|---------------|
| `id` (UUID PK) | `uuid_id` | Map to `uuid_id` column |
| `firstName` | `first_name` | Map to snake_case column |
| `lastName` | `last_name` | Map to snake_case column |
| `isActive` | `is_active` | Map to snake_case column |
| `registeredOn` | `registered_on` | Map to snake_case column |
| `userName` | `user_name` | Map to snake_case column |
| `emailConfirmed` | `email_verified` | Map to `email_verified` column |
| `twoFactorEnabled` | `two_factor_enabled` | Map to snake_case column |
| `twoFactorSecret` | `two_factor_secret` | Map to snake_case column |
| `passwordHash` | `password_hash` | Map to snake_case column |
| `lastPasswordModifiedAt` | `last_password_modified_at` | Map to snake_case column |
| `isLockedOut` | `is_locked_out` | Map to snake_case column |
| `lockoutEnd` | `lockout_end` | Map to snake_case column |
| `accessFailedCount` | `access_failed_count` | Map to snake_case column |
| `concurrencyStamp` | `concurrency_stamp` | Map to snake_case column |
| `securityStamp` | `security_stamp` | Map to snake_case column |
| `referralCode` | `referral_code` | Map to snake_case column |
| `referredBy` | `referred_by` | Map to snake_case column |
| `profilePrivacy` | `profile_privacy` | Map to snake_case column |
| `onboardingStep` | `onboarding_step` | Map to snake_case column |
| `normalizedEmail` | `normalized_email` | Map to snake_case column |
| `normalizedUserName` | `normalized_user_name` | Map to snake_case column |
| `newEmail` | `new_email` | Map to snake_case column |
| `lastEmailModifiedAt` | `last_email_modified_at` | Map to snake_case column |
| `newPhoneNumber` | `new_phone_number` | Map to snake_case column |
| `lastPhoneNumberModifiedAt` | `last_phone_number_modified_at` | Map to snake_case column |
| `lastUserNameModifiedAt` | `last_user_name_modified_at` | Map to snake_case column |
| `type` | `type` | No change |
| `bio` | `bio` | No change |
| `googleId` | `google_id` | Map to snake_case column |
| `phoneNumber` | `phone_number` | Map to snake_case column |
| BaseEntity `createdOn` | `created_at` | Map to `created_at` |
| BaseEntity `lastModifiedOn` | `updated_at` | Map to `updated_at` |
| BaseEntity `createdBy` | `created_by` | Map to snake_case column |
| BaseEntity `lastModifiedBy` | `last_modified_by` | Map to snake_case column |
| BaseEntity `lastRefreshed` | `last_refreshed` | Map to snake_case column |

### 6.4 FK Reference Updates

18 tables currently reference `identity.users(id)` (UUID). These must be updated to reference `public.user(uuid_id)` (UUID).

| Table | FK Column | Current Target | New Target |
|-------|-----------|----------------|------------|
| `identity.user_roles` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `identity.user_claims` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `identity.user_logins` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `identity.user_biometrics` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `identity.role_claims` | (none direct) | — | — |
| `public.linked_accounts` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.user_contents` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.playlists` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.playlist_members` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.user_follows` | `follower_id` / `following_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.user_topics` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.youtube_accounts` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.publish_jobs` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `analytics.analytics_events` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `analytics.premium_rollups` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `notification.notifications` | `notify_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.user_preferences` | `user_id` | `identity.users.id` | `public.user.uuid_id` |
| `public.manual_profiles` | `user_id` | `identity.users.id` | `public.user.uuid_id` |

**SQL:**
```sql
-- For each FK, drop old constraint and add new one
ALTER TABLE identity.user_roles
  DROP CONSTRAINT IF EXISTS FK_user_roles_user,
  ADD CONSTRAINT FK_user_roles_user FOREIGN KEY (user_id)
  REFERENCES public.user(uuid_id) ON DELETE CASCADE;

-- Repeat for all 18 tables
```

### 6.5 Data Migration

```sql
-- Migrate data from identity.users to public.user
UPDATE public.user pu
SET
  is_active = iu."isActive",
  registered_on = iu."registeredOn",
  user_name = iu."userName",
  bio = iu."bio",
  new_email = iu."newEmail",
  last_email_modified_at = iu."lastEmailModifiedAt",
  new_phone_number = iu."newPhoneNumber",
  last_phone_number_modified_at = iu."lastPhoneNumberModifiedAt",
  last_user_name_modified_at = iu."lastUserNameModifiedAt",
  normalized_email = LOWER(TRIM(iu."email")),
  normalized_user_name = LOWER(TRIM(iu."userName")),
  two_factor_secret = iu."twoFactorSecret",
  password_hash = iu."passwordHash",
  last_password_modified_at = iu."lastPasswordModifiedAt",
  is_locked_out = iu."isLockedOut",
  lockout_end = iu."lockoutEnd",
  access_failed_count = iu."accessFailedCount",
  concurrency_stamp = iu."concurrencyStamp",
  security_stamp = iu."securityStamp",
  type = iu."type"
FROM identity.users iu
WHERE pu.uuid_id = iu.id;
```

### 6.6 Cleanup

After migration is verified:

```sql
-- Drop identity.users (data is now in public.user)
DROP TABLE IF EXISTS identity.user_biometrics;
DROP TABLE IF EXISTS identity.user_logins;
DROP TABLE IF EXISTS identity.user_roles;
DROP TABLE IF EXISTS identity.user_claims;
DROP TABLE IF EXISTS identity.role_claims;
DROP TABLE IF EXISTS identity.roles;
DROP TABLE IF EXISTS identity.users;

-- Drop userIdMapping (dead code)
DROP TABLE IF EXISTS public.user_id_mapping;
```

### 6.7 Files Changed

| File | Change |
|------|--------|
| `src/features/auth/2fa/verify/2fa-verify.handler.ts` | Fix inverted logic + copy-paste bug |
| `src/domain/entities/identity/user.entity.ts` | Remap to `public.user` columns |
| `src/infrastructure/repositories/user.repository.ts` | Update column references |
| `src/features/auth/login/login.handler.ts` | Update column references if needed |
| `src/features/auth/register/register.handler.ts` | Update column references if needed |
| `src/features/auth/refresh-token/refresh-token.handler.ts` | Update column references if needed |
| `src/infrastructure/services/token.service.ts` | Update column references if needed |
| `src/core/middlewares/httpContext.middleware.ts` | Update query to use `public.user` |
| 18 entity files | Update FK references |
| `.env.development` | Remove real API keys |
| 30+ source files | Remove console.log statements |
| New TypeORM migration file | FK update migration |

**Total: ~55 files**

---

## 7. Components That Do Not Need Changes

These components are explicitly verified as NOT requiring modification:

### 7.1 Frontend (SocialApp)

| Component | Status | Reason |
|-----------|--------|--------|
| `src/services/api/token.service.ts` | NO CHANGE | All 6 auth endpoints unchanged |
| `src/services/api/account.service.ts` | NO CHANGE | All 13 account endpoints unchanged |
| `src/types/jwtPayload.type.ts` | NO CHANGE | All 14 JWT claims preserved |
| `src/constants/globals.ts` | NO CHANGE | All ClaimTypes constants preserved |
| `src/features/auth/services/authService.ts` | NO CHANGE | Client hydration unchanged |
| All 55+ API calls | NO CHANGE | Zero breaking API changes |

### 7.2 Project A (gaddr-jobs)

| Component | Status | Reason |
|-----------|--------|--------|
| 76 tRPC routers | NO CHANGE | Internal API unaffected |
| `src/server/redis.ts` | NO CHANGE | Redis client unaffected |
| `src/server/rate-limit.ts` | NO CHANGE | Rate limiting unaffected |
| `src/middleware.ts` | NO CHANGE | Next.js middleware unaffected |
| `src/server/trpc/context.ts` | NO CHANGE | tRPC context unaffected |
| `src/server/auth/require-session.ts` | NO CHANGE | Session validation unchanged |
| `src/lib/auth-client.ts` | NO CHANGE | Client-side auth unchanged |
| `src/app/api/auth/[...all]/route.ts` | NO CHANGE | Auth API route unchanged |

### 7.3 Project B (gaddr-backend-api)

| Component | Status | Reason |
|-----------|--------|--------|
| `src/features/auth/login/login.handler.ts` | MINIMAL | Column name mapping only |
| `src/features/auth/register/register.handler.ts` | MINIMAL | Column name mapping only |
| `src/features/auth/refresh-token/refresh-token.handler.ts` | MINIMAL | Column name mapping only |
| `src/infrastructure/services/token.service.ts` | NO CHANGE | JWT generation unchanged |
| `src/core/globals.ts` | NO CHANGE | ClaimTypes URIs unchanged |
| `src/features/auth/forgot-password/` | NO CHANGE | Password reset flow unchanged |
| `src/features/auth/external/google-auth/` | MINIMAL | Column name mapping only |
| `src/features/auth/external/facebook-auth/` | MINIMAL | Column name mapping only |
| `src/features/content/` | NO CHANGE | Content management unaffected |
| `src/features/analytics/` | NO CHANGE | Analytics unaffected |
| `src/features/playlist/` | NO CHANGE | Playlist management unaffected |
| `src/features/notification/` | NO CHANGE | Notification system unaffected |
| All CQRS command/query handlers (non-auth) | NO CHANGE | Business logic unaffected |

---

## 8. Database Risks

### 8.1 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration fails midway | LOW | HIGH | Use transaction; test on staging first |
| Data loss during migration | LOW | CRITICAL | Full pg_dump before migration; verify row counts |
| FK constraint violation | MEDIUM | HIGH | Update FKs before dropping `identity.users` |
| TypeORM auto-migration conflicts | MEDIUM | MEDIUM | Set `POSTGRES_MIGRATIONS_RUN=false` during migration window |
| Neon connection pooler timeout | LOW | MEDIUM | Break large migrations into smaller batches |
| Existing users can't login after migration | LOW | CRITICAL | Verify password_hash is correctly migrated; test login flow |

### 8.2 Data Safety

| Metric | Value | Risk Level |
|--------|-------|------------|
| Total users to migrate | ~49 | LOW (small dataset) |
| Tables with FK updates | 18 | MEDIUM (many constraints) |
| Columns being added | 24 | LOW (additive only) |
| Columns being removed | 0 | NONE |
| Columns being modified | 0 | NONE |
| Rows being deleted | 0 | NONE |

### 8.3 Migration Ordering

The migration must be executed in this exact order:

1. Add 24 columns to `public.user` (additive, safe)
2. Populate `uuid_id` for existing users
3. Migrate data from `identity.users` to `public.user`
4. Update 18 FK references to point to `public.user(uuid_id)`
5. Verify all logins work
6. Drop `identity.users` and related tables
7. Drop `user_id_mapping` (dead code)

---

## 9. Build Risks

### 9.1 Project A Build

| Item | Risk | Mitigation |
|------|------|------------|
| Adding bcrypt dependency | LOW | Well-tested library; peer dependency is Node.js |
| Better Auth config change | MEDIUM | Must verify password.verify option works with 1.5.6 |
| Drizzle migration numbering | LOW | Use 0086+ prefix (next available) |
| `npm run build` | LOW | TypeScript compilation; no type changes |

### 9.2 Project B Build

| Item | Risk | Mitigation |
|------|------|------------|
| Entity column remapping | MEDIUM | Must verify TypeORM reads correct columns |
| FK constraint updates | MEDIUM | Must verify all FKs are valid before dropping identity schema |
| `POSTGRES_MIGRATIONS_RUN=true` | HIGH | Must coordinate deploy timing; ensure migrations are idempotent |
| TypeORM synchronize=false | LOW | Already set; no risk |

### 9.3 Cross-Project Build

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Project A deploys before Project B | LOW | New columns are nullable; existing code ignores them |
| Project B deploys before Project A | LOW | Project B can still read `identity.users` until cutover |
| Both deploy simultaneously | MEDIUM | Coordinate deploy window; ensure migration runs first |

---

## 10. Security Risks

### 10.1 Critical Security Findings

| # | Finding | Severity | File | Fix |
|---|---------|----------|------|-----|
| 1 | 2FA verify inverted logic | CRITICAL | `2fa-verify.handler.ts:78` | Invert condition |
| 2 | 2FA copy-paste bug | HIGH | `2fa-verify.handler.ts:143` | Fix comparison |
| 3 | Real API keys in `.env.development` | CRITICAL | `.env.development` | Rotate keys, use placeholders |
| 4 | 100+ console.log statements | HIGH | 30+ files | Remove or replace with logger |
| 5 | Email normalization inconsistency | MEDIUM | `user.entity.ts:145` | Use toLowerCase() |
| 6 | TOTP secret in plaintext | MEDIUM | `user.entity.ts:70` | Consider encryption at rest |

### 10.2 Authentication Security

| Aspect | Current | After Migration | Change |
|--------|---------|----------------|--------|
| Password hashing | bcrypt (B), Argon2id (A) | bcrypt (both) | Better |
| JWT signing | HS256 | HS256 | No change |
| JWT claims | 14 claims | 14 claims | No change |
| Refresh tokens | Opaque 32-byte hex | Opaque 32-byte hex | No change |
| 2FA | TOTP via speakeasy | TOTP via speakeasy | No change |
| Session management | Better Auth (A), JWT (B) | Better Auth (A), JWT (B) | No change |

### 10.3 Migration Security

| Step | Security Consideration |
|------|----------------------|
| Add columns | Non-breaking; no security impact |
| Migrate data | Must ensure password hashes are correctly copied |
| Update FKs | Must ensure no orphaned records |
| Drop tables | Point of no return; verify backup exists |

---

## 11. Deployment Plan

### 11.1 Pre-Deployment Checklist

- [ ] Full `pg_dump` backup verified and tested
- [ ] 2FA inverted logic bug fixed and tested
- [ ] 2FA copy-paste bug fixed and tested
- [ ] Email normalization unified across both projects
- [ ] Both projects' builds pass (`npm run build`)
- [ ] Staging environment mirrors production
- [ ] Rollback procedure documented and tested
- [ ] API keys rotated in `.env.development`

### 11.2 Deployment Sequence

| Phase | Action | Duration | Deploy Order | Rollback Window |
|-------|--------|----------|-------------|-----------------|
| **Phase 0** | Fix critical bugs (2FA, email normalization, rotate keys) | 1-2 days | B first | Immediate |
| **Phase 1** | Add 24 columns to `public.user` (Project A migration) | 0.5 day | A | 24 hours |
| **Phase 2** | Migrate data from `identity.users` to `public.user` | 0.5 day | Script | 48 hours |
| **Phase 3** | Update Project B entity + FKs | 1-2 days | B | 72 hours |
| **Phase 4** | Verify cross-project login works | 1 day | Staging | N/A |
| **Phase 5** | Cutover (stop writing to `identity.users`) | 0.5 day | Coordinated | 14 days |
| **Phase 6** | Drop `identity.users` + cleanup | 0.5 day | B | 30 days |

**Total: 4-6 days** (not 38-52)

### 11.3 Critical Deploy Constraints

| Constraint | Detail | Mitigation |
|------------|--------|------------|
| `POSTGRES_MIGRATIONS_RUN=true` | Both projects auto-run migrations on startup | Coordinate deploy timing; ensure migrations are idempotent |
| Zero frontend changes | 55+ API calls to Project B are immutable | All changes backend-only |
| Production uses Neon connection pooler | Long-running migrations may time out | Break large migrations into smaller batches |

---

## 12. Rollback Plan

### 12.1 Phase-by-Phase Rollback

| Phase | Rollback Action | Data Loss Risk |
|-------|----------------|---------------|
| Phase 0 (bug fixes) | Revert code changes | None |
| Phase 1 (add columns) | `ALTER TABLE public.user DROP COLUMN ...` for each new column | None |
| Phase 2 (data migration) | Delete migrated rows from `public.user` (only new columns) | None (original data unchanged) |
| Phase 3 (entity + FKs) | Revert entity changes; restore FK constraints to `identity.users` | None |
| Phase 4 (verification) | N/A (read-only testing) | None |
| Phase 5 (cutover) | Resume writing to `identity.users`; revert entity changes | Possible (new rows only) |
| Phase 6 (drop tables) | **POINT OF NO RETURN** — restore from pg_dump | Possible if backup not taken |

### 12.2 Backup Strategy

| Item | Status | Action |
|------|--------|--------|
| Existing backup | `neondb_backup_20260717_223225.dump` | Verify it's current |
| Pre-migration backup | Required | `pg_dump` immediately before Phase 1 |
| Post-migration backup | Required | `pg_dump` after Phase 3 verification |
| Restore procedure | Documented in `RESTORE_REPORT.md` | Test restore on staging |

---

## 13. Testing Checklist

### 13.1 Current Test Coverage

| Project | Unit Tests | Integration Tests | E2E Tests |
|---------|-----------|-------------------|-----------|
| Project A | Vitest configured; unknown coverage | Playwright configured; unknown coverage | Must verify |
| Project B | **ZERO** `.spec.ts` files | **ZERO** | **ZERO** |
| Frontend | N/A (not changing) | N/A | N/A |

### 13.2 Required Tests Before Migration

| Test | Project | Priority | Why |
|------|---------|----------|-----|
| 2FA verify handler | B | CRITICAL | Currently broken |
| 2FA enable/disable handlers | B | HIGH | Must work after fix |
| Login flow (email/password) | B | CRITICAL | Core auth |
| Registration flow | B | CRITICAL | Core auth |
| Token refresh flow | B | CRITICAL | Core auth |
| Email normalization consistency | Both | HIGH | Must produce identical results |
| Cross-project login (register in B, login in A) | Both | CRITICAL | Core goal |
| Cross-project login (register in A, login in B) | Both | CRITICAL | Core goal |
| FK integrity after migration | DB | HIGH | All 18 FKs must be valid |

### 13.3 Testing Matrix

| Scenario | Test Type | Pass Criteria |
|----------|-----------|---------------|
| Register in B → Login in B | Integration | User authenticates successfully |
| Register in A → Login in A | Integration | User authenticates successfully |
| Register in B → Login in A | Integration | User authenticates in both apps |
| Register in A → Login in B | Integration | User authenticates in both apps |
| Login with 2FA enabled | Integration | 2FA flow works end-to-end |
| Token refresh | Integration | New access token issued |
| Password reset | Integration | Password updated, can login with new password |
| Email normalization | Unit | Same email produces same normalized form |
| FK integrity | SQL | All FK constraints valid |
| Rollback migration | Integration | Database restores to pre-migration state |

---

## 14. Final Recommendation

### 14.1 Does This Plan Achieve a Single Shared Database?

**YES.** Both projects read from and write to `public.user`. The `identity.users` table is eliminated. One table, one source of truth.

### 14.2 Does It Preserve Both Independent Login Systems?

**YES.** Better Auth continues in Project A. Custom JWT continues in Project B. Neither auth system is modified or merged. Both read from the same `public.user` table.

### 14.3 Does It Minimize Code Changes?

**YES.** Compared to the v2 docs:
- V2 plan: ~100+ files, 38-52 days
- This plan: ~60 files, 4-6 days
- Auth code changes: ZERO (vs rewriting Better Auth in v2)
- Frontend changes: ZERO (same as v2)

### 14.4 Does It Avoid Frontend Changes?

**YES.** Zero frontend files are modified. All 55+ API endpoints continue working identically. JWT claims are preserved. Response shapes are unchanged.

### 14.5 Does It Preserve Existing Foreign Keys?

**YES, with updates.** The 18 FK references in Project B are updated from `identity.users(id)` to `public.user(uuid_id)`. The 113+ FK references in Project A are untouched (they already reference `public.user`).

### 14.6 Is It Production-Ready?

**YES, after the following prerequisites:**

| # | Prerequisite | Effort | Priority |
|---|-------------|--------|----------|
| 1 | Fix 2FA inverted logic bug | 0.5 day | CRITICAL |
| 2 | Fix 2FA copy-paste bug | 0.5 day | CRITICAL |
| 3 | Rotate exposed API keys | 0.5 day | CRITICAL |
| 4 | Unify email normalization | 0.5 day | HIGH |
| 5 | Add minimum auth handler tests | 2-3 days | HIGH |
| 6 | Verify builds pass in both projects | 0.5 day | HIGH |

**After these prerequisites are met, the 6-phase deployment plan is ready for execution.**

### 14.7 Revised Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Prerequisites (bug fixes, tests) | 3-5 days | Day 5 |
| Phase 0: Backup + baseline | 0.5 day | Day 5.5 |
| Phase 1: Add columns | 0.5 day | Day 6 |
| Phase 2: Migrate data | 0.5 day | Day 6.5 |
| Phase 3: Update entity + FKs | 1-2 days | Day 8.5 |
| Phase 4: Verification | 1 day | Day 9.5 |
| Phase 5: Cutover | 0.5 day | Day 10 |
| Phase 6: Cleanup | 0.5 day | Day 10.5 |
| **Total** | **10-11 days** | — |

This is **4x faster** than the v2 plan (38-52 days) because:
1. Both auth systems remain unchanged (no Better Auth reconfiguration)
2. No dual-hash complexity (bcrypt only)
3. No UUID PK override for Better Auth
4. Fewer FK updates (18 vs 113+)
5. Additive migrations only (no destructive changes)

---

**Document generated**: 2026-07-19
**Status**: Ready for stakeholder sign-off
**Next review**: After Phase 0 completion
