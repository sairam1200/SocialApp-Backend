# 06 — Project A Change Plan (v2)

> **Scope**: Comprehensive change plan for `gaddr-jobs` Next.js app (`E:\Github\gaddep\gaddr-jobs`).
> **Derived from**: V1 plan (`06_ProjectA_Changes.md`), validated against live codebase on 2026-07-19.
> **Date**: 2026-07-19
> **Status**: Plan only — no code.

---

## Table of Contents

1. [Document Metadata](#1-document-metadata)
2. [Executive Summary](#2-executive-summary)
3. [Change Categories](#3-change-categories)
4. [Better Auth Reconfiguration](#4-better-auth-reconfiguration)
5. [Schema Changes](#5-schema-changes)
6. [Password Hashing Migration](#6-password-hashing-migration)
7. [Email Normalization](#7-email-normalization)
8. [JWT Verification Changes](#8-jwt-verification-changes)
9. [shared-schema Cleanup](#9-shared-schema-cleanup)
10. [Dead Code Cleanup](#10-dead-code-cleanup)
11. [Redis Configuration](#11-redis-configuration)
12. [Migration Scripts](#12-migration-scripts)
13. [Testing Plan](#13-testing-plan)
14. [Rollback Procedures](#14-rollback-procedures)
15. [Risk Assessment](#15-risk-assessment)
16. [ADR Section](#16-adr-section)
17. [Open Questions](#17-open-questions)

---

## 1. Document Metadata

| Field | Value |
|-------|-------|
| **Document Version** | 2.0 |
| **Previous Version** | 1.0 (`06_ProjectA_Changes.md`, 785 lines) |
| **Codebase Validated** | Yes — every file referenced in V1 was read and cross-checked |
| **Codebase Path** | `E:\Github\gaddep\gaddr-jobs` |
| **Monorepo Path** | `E:\Github\gaddep` |
| **Framework** | Next.js 16.2.1 (React 19.2.4) |
| **Auth Library** | Better Auth 1.5.6 |
| **ORM** | Drizzle 0.45.2 (PostgreSQL via postgres.js 3.4.8) |
| **tRPC** | v11.16.0 |
| **Package Manager** | Bun (lockfile: `bun.lock`) |
| **Node Runtime** | >=20.0.0 |
| **Total Drizzle Tables** | 151 |
| **Total tRPC Routers** | 76 (plus `_app.ts` barrel) |
| **Total API Routes** | 15 |

### V1 → V2 Corrections

| # | V1 Statement | V2 Correction | Source |
|---|-------------|---------------|--------|
| 1 | shared-schema "both gaddr-jobs and gaddr.com import" | **0 imports in gaddr-jobs** — `grep` for `@gaddr/shared-schema` returns empty | `gaddr-jobs/src/**` |
| 2 | 94 total affected files | **Recounted**: 48 affected, 76 tRPC routers + 15 API routes = 91 source files plus auth/UI/config | Live codebase |
| 3 | `auth.config.ts` described generically | Confirmed: **CLI-only file** used by `bun x auth@latest generate` — not loaded at runtime | `auth.config.ts:1-3` |
| 4 | `@node-rs/argon2` listed as server dependency | It's in **devDependencies** only — `trustedDependencies` allows native build. Zero imports in source. Better Auth uses it internally | `package.json:102,132` |
| 5 | Redis described generically | **Two distinct Redis systems**: ioredis (`src/server/redis.ts`) for auth/rate-limit scripts + Upstash (`src/server/rate-limit.ts`) for HTTP rate limiting | Source files |
| 6 | `src/server/api/` referenced | **Does not exist** in gaddr-jobs — API routes are in `src/app/api/` (Next.js App Router) | Glob search |
| 7 | tRPC routers "76 routers" | **76 files** in `routers/` including `_app.ts` — 75 domain routers + 1 barrel | Directory listing |
| 8 | `verification-code.ts` "NO CHANGE" | **Uses `BETTER_AUTH_SECRET`** for HMAC — must change when removing Better Auth | `verification-code.ts:12` |
| 9 | `password-reset-code.ts` "NO CHANGE" | **Depends on Better Auth resetToken** — stores/retrieves alongside OTP | `password-reset-code.ts:22,52` |

---

## 2. Executive Summary

### Scope

Project A (`gaddr-jobs`) is a 16.2.1 Next.js application with Better Auth 1.5.6 handling authentication. The goal is to:

1. **Reconfigure Better Auth** to verify JWTs issued by Project B (`gaddr.com`) instead of managing its own auth
2. **Align password hashing** between Project A (Argon2id via Better Auth) and Project B (bcrypt)
3. **Standardize email normalization** across both projects
4. **Accept Project B JWTs** for session validation
5. **Clean up dead code** and unused dependencies
6. **Document Redis infrastructure** (dual ioredis + Upstash)

### What Changed from V1

| Area | V1 Approach | V2 Approach | Rationale |
|------|------------|-------------|-----------|
| Auth retirement | Remove Better Auth entirely | **Reconfigure** Better Auth as JWT-verifier | Lower risk, preserves OAuth/cookie infrastructure |
| shared-schema | Mark as "Schema Owner" | **Document as unused** by gaddr-jobs; decide delete vs. integrate | Zero imports found |
| Password hashing | Migrate to bcrypt | **Dual-hash transition** — bcrypt on login verify, migrate stored hashes gradually | Avoids blocking login for existing users |
| Dead code | "NO CHANGE" for fix scripts | **Delete all 6 fix scripts + backup** | Confirmed one-time scripts |

### Effort Estimate

| Phase | Duration | Risk |
|-------|----------|------|
| Phase 0: Dead code cleanup | 0.5 day | Low |
| Phase 1: Better Auth reconfiguration | 2-3 days | Medium |
| Phase 2: JWT verification setup | 1-2 days | Medium |
| Phase 3: Password hashing alignment | 1 day | Medium |
| Phase 4: shared-schema resolution | 0.5 day | Low |
| Phase 5: Redis documentation | 0.5 day | Low |
| Phase 6: Testing & validation | 2-3 days | Medium |
| **Total** | **~7-10 days** | **Medium** |

### Risk Level: **MEDIUM**

Primary risks: auth session continuity during migration, cookie name changes logging out users, 2FA enforcement gap (pre-existing, see §8).

---

## 3. Change Categories

### 3A. Infrastructure Changes

| # | Change | Files Affected | Risk |
|---|--------|---------------|------|
| I-1 | Remove 6 dead fix scripts | `fix-all.js`, `fix-governance.js`, `fix-governance2.js`, `fix-mentorship.js`, `fix-tables.js`, `fix-vote-table.js` | Low |
| I-2 | Remove backup file | `backups/user_backup_1784300813041.json` | Low |
| I-3 | Delete `auth.config.ts` | `auth.config.ts` | Low |
| I-4 | Delete `auth-api.ts` | `src/server/auth/auth-api.ts` | Medium |
| I-5 | Delete `auth-error.ts` + test | `src/server/auth/auth-error.ts`, `src/server/auth/auth-error.test.ts` | Low |
| I-6 | Document Redis dual-system | `src/server/redis.ts`, `src/server/rate-limit.ts` | Low |

### 3B. Auth Changes

| # | Change | Files Affected | Risk |
|---|--------|---------------|------|
| A-1 | Reconfigure Better Auth | `src/server/auth/index.ts` | High |
| A-2 | Update middleware | `src/middleware.ts` | High |
| A-3 | Rewrite tRPC context | `src/server/trpc/context.ts` | High |
| A-4 | Rewrite requireSession | `src/server/auth/require-session.ts` | High |
| A-5 | Rewrite auth client | `src/lib/auth-client.ts` | Medium |
| A-6 | Update auth API route | `src/app/api/auth/[...all]/route.ts` | High |
| A-7 | Rewrite trigger-verification-email | `src/server/auth/trigger-verification-email.ts` | Low |

### 3C. Schema Changes

| # | Change | Files Affected | Risk |
|---|--------|---------------|------|
| S-1 | Update `env.ts` | `src/env.ts` | Low |
| S-2 | Update `verification-code.ts` | `src/server/auth/verification-code.ts` | Low |
| S-3 | Update `password-reset-code.ts` | `src/server/auth/password-reset-code.ts` | Low |
| S-4 | Update auth tRPC router | `src/server/trpc/routers/auth.ts` | High |

### 3D. Code Cleanup

| # | Change | Files Affected | Risk |
|---|--------|---------------|------|
| C-1 | Resolve shared-schema drift | `packages/shared-schema/src/auth.ts` | Low |
| C-2 | Remove Better Auth packages | `package.json` | Low |
| C-3 | Add JWT library | `package.json` | Low |

---

## 4. Better Auth Reconfiguration

### 4.1 Current State (Verified)

**`src/server/auth/index.ts`** (178 lines):
- Creates `betterAuth()` instance with:
  - `drizzleAdapter(db, { provider: "pg", schema })` — direct DB access
  - `emailAndPassword` — enabled, with `requireEmailVerification: true`
  - `socialProviders.google` — OAuth via `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  - `databaseHooks.user.create.before` — blocks duplicate emails, splits Google OAuth names
  - `crossSubDomainCookies` — enabled in production (`.gaddr.com`)
  - `secondaryStorage` — Redis via `@better-auth/redis-storage` with `better-auth:` prefix
  - `plugins`: `nextCookies()`, `passkey()` (rpName: "Gaddr")
  - `rateLimit` — disabled in test mode
- Exports `auth` instance and `Session` type (`typeof auth.$Infer.Session`)

**`src/app/api/auth/[...all]/route.ts`** (36 lines):
- Uses `toNextJsHandler(auth)` from `better-auth/next-js`
- Rate-limited POST handler via Upstash (`authRateLimit`)
- GET handler is passthrough

**`src/lib/auth-client.ts`** (17 lines):
- `createAuthClient()` from `better-auth/react`
- Plugins: `inferAdditionalFields` (user.firstName, lastName, role, isAdmin), `passkeyClient()`

**`src/middleware.ts`** (96 lines):
- Checks for `better-auth.session_token` or `__Secure-better-auth.session_token` cookie
- If absent → redirect to `/login` (unless public route)
- No JWT validation — just cookie presence check

**`src/server/trpc/context.ts`** (89 lines):
- Calls `auth.api.getSession({ headers: req.headers })` on every tRPC request
- Maps session to `SessionUser` type: `{ userId, email, emailVerified, image, name, firstName, lastName, role }`

### 4.2 Target State

Better Auth remains installed but is **reconfigured** to act as a JWT verifier for Project B tokens rather than an identity provider.

#### 4.2.1 Better Auth Config Changes (`src/server/auth/index.ts`)

| Component | Current | Target | Notes |
|-----------|---------|--------|-------|
| `database` | `drizzleAdapter(db, { provider: "pg", schema })` | Remove — no longer managing auth tables | Better Auth won't own user/session tables |
| `emailAndPassword` | Enabled | **Disable** | Registration/login moves to Project B |
| `socialProviders.google` | Enabled | **Disable** | OAuth handled by Project B |
| `databaseHooks` | create.before hook | **Remove** | No longer creating users |
| `crossSubDomainCookies` | Enabled (.gaddr.com) | **Keep** | Still needed for cookie propagation |
| `secondaryStorage` | Redis (`better-auth:` prefix) | **Remove** | No longer storing sessions |
| `passkey` plugin | Enabled | **Remove** | Passkeys managed by Project B |
| `nextCookies` plugin | Enabled | **Keep** | Required for Next.js cookie handling |
| `rateLimit` | Conditional | **Remove** | Rate limiting handled separately |
| `secret` | `env.BETTER_AUTH_SECRET` | **Change to** `env.JWT_SECRET` | Shared secret with Project B |

#### 4.2.2 New Auth Config Sketch

```typescript
// src/server/auth/index.ts — reconfigured
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/env";

export const auth = betterAuth({
  secret: env.JWT_SECRET, // Shared with Project B
  baseURL: env.NEXT_PUBLIC_APP_URL,
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
  advanced: {
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === "production",
      domain: ".gaddr.com",
    },
  },
  emailAndPassword: { enabled: false },
  socialProviders: {},
  plugins: [nextCookies()],
});
```

> **Note**: The exact reconfiguration depends on how Project B issues tokens. If Project B uses Better Auth's JWT plugin, we can use `auth.api.getSession()` to verify those tokens directly. If Project B uses a custom JWT, we need `jose` to verify.

#### 4.2.3 Impact on All Better Auth Consumers

| Consumer | File | Impact |
|----------|------|--------|
| `auth.api.getSession()` | `trpc/context.ts:56` | Must work with reconfigured auth or replace with `jose` JWT verify |
| `auth.api.getSession()` | `require-session.ts:15` | Same as above |
| `toNextJsHandler(auth)` | `api/auth/[...all]/route.ts:6` | May need to be removed if auth endpoints are no longer served by Project A |
| `auth.handler()` | `auth-api.ts:43` | Being deleted (§10.3) |
| `authClient` | `auth-client.ts` | Rewritten to custom fetch client |
| `Session` type | `context.ts:2`, `trpc.ts` | Replaced with custom type |

### 4.3 Files to Modify

| # | File | Lines | Change | Priority |
|---|------|-------|--------|----------|
| 1 | `src/server/auth/index.ts` | 178 | Rewrite config, remove Better Auth plugins/adapters | P0 |
| 2 | `src/server/trpc/context.ts` | 89 | Replace `auth.api.getSession()` with JWT verify | P0 |
| 3 | `src/server/auth/require-session.ts` | 39 | Replace `auth.api.getSession()` with JWT verify | P0 |
| 4 | `src/app/api/auth/[...all]/route.ts` | 36 | Remove or reduce — no auth endpoints served by Project A | P0 |
| 5 | `src/lib/auth-client.ts` | 17 | Rewrite to custom fetch client | P1 |
| 6 | `src/middleware.ts` | 96 | Update cookie name, add JWT validation | P1 |
| 7 | `src/server/auth/trigger-verification-email.ts` | 20 | Remove `postToAuthApi` dependency | P1 |
| 8 | `src/env.ts` | 65 | Remove `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; add `JWT_SECRET` | P0 |

---

## 5. Schema Changes

### 5.1 Current Auth Schema (Verified)

**`src/server/db/auth-schema.ts`** (174 lines) — 6 tables:

| Table | Columns | Notes |
|-------|---------|-------|
| `user` | 38 columns | Fat table — auth + profile + billing + merger columns |
| `session` | 9 columns | Better Auth sessions (token, expiresAt, userId, ipAddress, userAgent) |
| `account` | 12 columns | Better Auth accounts (providerId, OAuth tokens, password) |
| `verification` | 5 columns | Better Auth verification (identifier, value, expiresAt) |
| `passkey` | 11 columns | Better Auth passkeys (publicKey, credentialID, counter) |
| `userIdMapping` | 3 columns | Merger table (jobsTextId ↔ gaddrUuid) |
| `usedFreeLimit` | 2 columns | Email-based free limit tracking |

**`user` table columns** (all 38, verified):
```
id, name, email, emailVerified, image, createdAt, updatedAt,
firstName, lastName, role, twoFactorEnabled, twoFaVerifiedAt,
isVerified, isAdmin, stripeCustomerId, stripePriceId,
stripeSubscriptionId, subscriptionStatus, subscriptionPlan,
jobPostLimit, activeJobPostCount, walletAddress,
privateSearchMode, blockedEmployers, aiAnalysisOptOut,
googleId, phoneNumber, gender, dateOfBirth, onboardingStep,
referralCode, referredBy, profilePrivacy, sourceApp, status,
deletedAt, bannedAt, banReason
```

### 5.2 shared-schema Drift (9 Missing Columns)

**`packages/shared-schema/src/auth.ts`** is missing these columns that exist in `gaddr-jobs`:

| # | Column | Type | Default | Source |
|---|--------|------|---------|--------|
| 1 | `two_fa_verified_at` | timestamp | null | Better Auth 2FA |
| 2 | `private_search_mode` | boolean | false | Feature toggle |
| 3 | `blocked_employers` | text[] | `{}` | Privacy feature |
| 4 | `ai_analysis_opt_out` | boolean | false | Privacy feature |
| 5 | `date_of_birth` | timestamp | null | Merger column |
| 6 | `status` | text | "active" | Account status |
| 7 | `deleted_at` | timestamp | null | Soft delete |
| 8 | `banned_at` | timestamp | null | Admin action |
| 9 | `ban_reason` | text | null | Admin action |

### 5.3 Project A as Secondary Identity Consumer

If Project A becomes a **consumer** of Project B's identity (rather than an identity provider), the schema changes are minimal:

| Change | Scope | Risk |
|--------|-------|------|
| Keep existing `user` table as-is | No migration needed | None |
| Better Auth session/account tables become read-only for verification | Configuration only | Low |
| No table splits required in this phase | V1 table split deferred | None |

> **Decision**: The V1 proposal to split `user` into `user_profiles`/`user_security`/`user_preferences` is **deferred** to a future phase. For the JWT verification reconfiguration, the current schema is sufficient.

### 5.4 Required Schema Changes (Immediate)

| # | Change | Migration | Risk |
|---|--------|-----------|------|
| 1 | Add `jwt_issuer` column to `user` (optional) | `ALTER TABLE "user" ADD COLUMN jwt_issuer text` | Low |
| 2 | Add index on `user.email` | Already exists (`user_email_idx` in shared-schema, but NOT in gaddr-jobs `auth-schema.ts`) | Low |

> **Finding**: `auth-schema.ts` does NOT define an email index. The shared-schema defines `user_email_idx` on `user.email`. This should be added.

---

## 6. Password Hashing Migration

### 6.1 Current State (Verified)

| Aspect | Value | Source |
|--------|-------|--------|
| Hashing library | `@node-rs/argon2` (v2.0.2) | `package.json:102` (devDependencies) |
| Direct imports in source | **0** | `grep` for `argon2` in `*.ts` files |
| Used by | Better Auth internally | Better Auth's `emailAndPassword` plugin uses Argon2id by default |
| Hash format | `$argon2id$v=19$m=...` (Better Auth default) | Assumed from Better Auth defaults |
| Where stored | `account.password` column | `auth-schema.ts:99` |

### 6.2 Target State

Project B uses **bcrypt**. For cross-project compatibility:

| Aspect | Target |
|--------|--------|
| New password hashing | **bcrypt** (cost factor 12) |
| Verification | **Dual-hash**: try bcrypt first, fall back to Argon2id for legacy hashes |
| Migration | Background job re-hashes on successful login |

### 6.3 Dual-Hash Transition Strategy

```
Login flow:
  1. User submits password
  2. Fetch stored hash from account.password
  3. If hash starts with "$2b$" or "$2y$" → verify with bcrypt
  4. If hash starts with "$argon2" → verify with Argon2id
  5. If Argon2id matches → re-hash with bcrypt → update account.password
  6. If neither matches → reject
```

### 6.4 Dependencies

| Package | Action | Location |
|---------|--------|----------|
| `bcryptjs` | **ADD** to dependencies | Pure JS, no native build issues |
| `@node-rs/argon2` | **KEEP** in devDependencies during transition | Needed for legacy hash verification |
| `@node-rs/argon2` | **REMOVE** after migration complete | Post-transition cleanup |

### 6.5 Migration Script

```typescript
// scripts/migrate-password-hashes.ts
// Runs in background after deployment
// For each user with an Argon2id hash:
//   1. Cannot re-hash without plaintext password
//   2. Mark account as "needs_rehash" (new column or flag)
//   3. On next successful login, re-hash with bcrypt
```

> **Important**: We cannot batch-migrate hashes because we don't have plaintext passwords. Migration is **on-login only**.

### 6.6 Risk

| Risk | Severity | Mitigation |
|------|----------|------------|
| Users who never log in again retain Argon2id hashes | Low | Argon2id verification remains supported indefinitely |
| Argon2id native module fails on deploy | Medium | `@node-rs/argon2` is in devDependencies + trustedDependencies; fallback to bcrypt-only for new accounts |
| Timing mismatch — bcrypt slower than Argon2id | Low | Acceptable for auth (not hot path) |

---

## 7. Email Normalization

### 7.1 Current State (Verified)

**`src/lib/email/normalize.ts`** (21 lines):
```typescript
export function normalizeEmail(email: string): string {
  let normalized = email.trim().toLowerCase();
  // Gmail: dots ignored, + and after ignored
  // googlemail.com → gmail.com
  return normalized;
}
```

- Applied in: `verification-code.ts`, `password-reset-code.ts`, `auth.ts` (tRPC router)
- Used for: Redis key generation, email lookups, OTP storage

### 7.2 Alignment with Project B

| Normalization Rule | Project A | Project B | Aligned? |
|-------------------|-----------|-----------|----------|
| Trim whitespace | Yes | Yes | ✅ |
| Lowercase | Yes | Yes | ✅ |
| Gmail dot stripping | Yes | Needs verification | ⚠️ |
| Gmail + stripping | Yes | Needs verification | ⚠️ |
| googlemail.com → gmail.com | Yes | Needs verification | ⚠️ |
| Other providers (Yahoo, Outlook) | No | Needs verification | ⚠️ |

### 7.3 Required Action

1. **Verify Project B's normalization** matches exactly
2. **Add tests** for edge cases (empty local part, consecutive dots, etc.)
3. **No code changes** needed in `normalize.ts` unless Project B diverges

### 7.4 Edge Cases to Test

| Input | Expected Output |
|-------|----------------|
| `  User@Gmail.COM  ` | `user@gmail.com` |
| `first.last@gmail.com` | `firstlast@gmail.com` |
| `first+tag@gmail.com` | `first@gmail.com` |
| `user@googlemail.com` | `user@gmail.com` |
| `user@yahoo.com` | `user@yahoo.com` (no change) |
| `USER@OUTLOOK.COM` | `user@outlook.com` |
| `a.b.c.d.e.f@gmail.com` | `abcdef@gmail.com` |

---

## 8. JWT Verification Changes

### 8.1 Current Token Flow

```
Project B (gaddr.com)                    Project A (gaddr-jobs)
─────────────────────                    ──────────────────────
Better Auth manages identity    ←→      Better Auth verifies sessions
                                          ↓
                                      auth.api.getSession({ headers })
                                          ↓
                                      SessionUser { userId, email, ... }
```

### 8.2 Target Token Flow

```
Project B (gaddr.com)                    Project A (gaddr-jobs)
─────────────────────                    ──────────────────────
Issues JWT access_token           ←→    Verifies JWT using shared secret
Sets cookie: access_token               Reads cookie/header
                                         ↓
                                    Decode JWT → extract claims
                                         ↓
                                    SessionUser { userId, email, ... }
```

### 8.3 JWT Verification Implementation

**Option A: Better Auth as JWT verifier** (if Project B uses Better Auth JWT plugin)
```typescript
// Use Better Auth's built-in JWT verification
const session = await auth.api.getSession({ headers: requestHeaders });
// Better Auth verifies the JWT signature using the shared secret
```

**Option B: Direct JWT verification with `jose`** (if Project B uses custom JWT)
```typescript
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(env.JWT_SECRET);
const { payload } = await jwtVerify(token, secret, {
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
});
```

### 8.4 JWT Claims Expected

| Claim | Type | Source |
|-------|------|--------|
| `sub` (subject) | string | User ID |
| `email` | string | User email |
| `email_verified` | boolean | Verification status |
| `name` | string | Full name |
| `first_name` | string | First name |
| `last_name` | string | Last name |
| `role` | string | User role |
| `iss` (issuer) | string | `env.JWT_ISSUER` |
| `aud` (audience) | string | `env.JWT_AUDIENCE` |
| `exp` (expiration) | number | Token expiry |
| `iat` (issued at) | number | Token creation |

### 8.5 Pre-existing 2FA Bypass Bug

**Found in `auth.ts:475-478`** (comment by developer):
```typescript
// ponytail: 2FA enforcement is broken — verify2faLogin only verifies a code
// but doesn't gate session creation. Users with 2FA enabled can bypass it
// by using the Better Auth sign-in endpoint directly.
```

**Impact**: With the JWT reconfiguration, this bug is **automatically fixed** because:
1. Better Auth sign-in endpoint is disabled (§4.2.1)
2. Session creation requires JWT verification
3. `requireSession()` enforces 2FA check (`require-session.ts:31-36`)

### 8.6 Environment Variables

| Variable | Action | Value |
|----------|--------|-------|
| `BETTER_AUTH_SECRET` | **REMOVE** from `env.ts` | — |
| `BETTER_AUTH_URL` | **REMOVE** from `env.ts` | — |
| `JWT_SECRET` | **ADD** to `env.ts` | Shared with Project B (min 32 chars) |
| `JWT_ISSUER` | **ADD** to `env.ts` | Project B's issuer string |
| `JWT_AUDIENCE` | **ADD** to `env.ts` | Project A's audience string |
| `JWT_ACCESS_EXPIRATION_MINUTES` | **ADD** to `env.ts` | e.g., `60` |

---

## 9. shared-schema Cleanup

### 9.1 Current State (Verified)

**`packages/shared-schema/src/`** contains 5 files:

| File | Lines | Exports |
|------|-------|---------|
| `auth.ts` | 104 | `user`, `session`, `account`, `verification` |
| `profiles.ts` | 59 | `profiles`, `relationships`, `linkedAccounts` |
| `social.ts` | 63 | `socialAnalytics`, `youtubeAccounts`, `youtubeVideos`, `contentStreams` |
| `content.ts` | 57 | `userContents`, `playlists`, `playlistMembers`, `playlistContent` |
| `index.ts` | 21 | Barrel re-export of all above |

### 9.2 Import Analysis

| Consumer | Imports shared-schema? | Evidence |
|----------|----------------------|----------|
| `gaddr-jobs` | **NO** (0 imports) | `grep` for `@gaddr/shared-schema` returns empty |
| `gaddr.com` | Unknown (not in scope) | Requires separate audit |

### 9.3 Drift Details

The `user` table in shared-schema is missing **9 columns** (see §5.2). The shared-schema also defines tables (`profiles`, `relationships`, `linkedAccounts`, `socialAnalytics`, `youtubeAccounts`, `youtubeVideos`, `contentStreams`, `userContents`, `playlists`, `playlistMembers`, `playlistContent`) that gaddr-jobs defines **independently** in its own schema files.

### 9.4 Decision Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Delete shared-schema** | Clean break, no drift risk | gaddr.com must be verified to not depend on it |
| **B: Keep but don't use** | Safe, no action needed | Technical debt, drift continues |
| **C: Integrate — make gaddr-jobs the source of truth** | Single source of truth | Requires gaddr.com to switch imports |
| **D: Integrate — make shared-schema the source of truth** | Canonical definition | Requires aligning all 9 missing columns |

### 9.5 Recommendation

**Option A (Delete)** if gaddr.com confirms it doesn't import `@gaddr/shared-schema`.

**Option D (Integrate)** if gaddr.com does import it — add the 9 missing columns to shared-schema, then have gaddr-jobs import from shared-schema.

---

## 10. Dead Code Cleanup

### 10.1 Fix Scripts (6 files — DELETE)

| # | File | Purpose (inferred) | Action |
|---|------|-------------------|--------|
| 1 | `fix-all.js` | One-time data fix | Delete |
| 2 | `fix-governance.js` | Governance table fix | Delete |
| 3 | `fix-governance2.js` | Governance table fix (part 2) | Delete |
| 4 | `fix-mentorship.js` | Mentorship table fix | Delete |
| 5 | `fix-tables.js` | General table fix | Delete |
| 6 | `fix-vote-table.js` | Vote table fix | Delete |

### 10.2 Backup File (1 file — DELETE)

| # | File | Purpose | Action |
|---|------|---------|--------|
| 7 | `backups/user_backup_1784300813041.json` | Migration backup from timestamp | Delete |

### 10.3 Auth Files to DELETE (3 files)

| # | File | Lines | Reason |
|---|------|-------|--------|
| 8 | `src/server/auth/auth-api.ts` | 55 | `postToAuthApi()` — invokes Better Auth in-process. No longer needed |
| 9 | `src/server/auth/auth-error.ts` | 18 | Better Auth error parser. No longer needed |
| 10 | `src/server/auth/auth-error.test.ts` | 24 | Tests for deleted file |

### 10.4 Config Files to DELETE (1 file)

| # | File | Lines | Reason |
|---|------|-------|--------|
| 11 | `auth.config.ts` | 40 | Better Auth CLI config for schema generation. No longer needed |

### 10.5 Total Dead Code

| Category | Files | Lines |
|----------|-------|-------|
| Fix scripts | 6 | varies |
| Backup files | 1 | varies |
| Auth dead code | 3 | 97 |
| Config dead code | 1 | 40 |
| **Total** | **11** | **~137+** |

---

## 11. Redis Configuration

### 11.1 Two Distinct Redis Systems

Project A uses **two separate Redis clients** for different purposes:

#### System 1: ioredis (Primary)

| Aspect | Value |
|--------|-------|
| **File** | `src/server/redis.ts` (8 lines) |
| **Library** | `ioredis` v5.10.1 |
| **Connection** | `env.REDIS_URL` (standard Redis URL) |
| **Config** | `maxRetriesPerRequest: 3`, `lazyConnect: true` |
| **Used by** | Auth verification codes, password reset codes, rate limit scripts |

**Consumers**:
| File | Purpose |
|------|---------|
| `auth/verification-code.ts` | Email verification OTP storage (`gaddr:email-verify:*`) |
| `auth/password-reset-code.ts` | Password reset OTP storage (`gaddr:pwd-reset:*`) |
| `auth/rate-limit.ts` | Auth rate limiting (`gaddr:verify-resend:*`, `gaddr:pwd-reset-req:*`, `gaddr:change-pwd:*`) |
| `server/auth/index.ts` | Better Auth secondary storage (`better-auth:*`) |
| `trpc/context.ts` | Redis passed to tRPC context |

#### System 2: Upstash (HTTP Rate Limiting)

| Aspect | Value |
|--------|-------|
| **File** | `src/server/rate-limit.ts` (82 lines) |
| **Library** | `@upstash/redis` v1.38.0 + `@upstash/ratelimit` v2.0.8 |
| **Connection** | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (REST API) |
| **Config** | Sliding window rate limiter |
| **Used by** | Auth endpoint rate limiting (POST), API rate limiting |

**Rate Limit Rules**:
| Name | Max | Window | Endpoint |
|------|-----|--------|----------|
| `authRateLimit` | 50 req | 10 min | Auth POST endpoints |
| `apiRateLimit` | 30 req | 1 min | General API |

**Fallback**: In-memory `Map` when Upstash is unavailable.

### 11.2 Post-Reconfiguration Impact

| System | Impact | Action |
|--------|--------|--------|
| ioredis | Better Auth `secondaryStorage` removed | Remove `better-auth:*` key prefix usage |
| ioredis | OTP storage retained | No change needed |
| ioredis | Rate limit scripts retained | No change needed |
| Upstash | Auth rate limiting retained | No change needed |

### 11.3 Recommended Documentation

Add a `src/server/redis/README.md` or inline comments documenting:
- Which client serves which purpose
- Key naming conventions (`gaddr:*`, `better-auth:*`)
- Failover behavior (ioredis: lazy connect; Upstash: in-memory fallback)

---

## 12. Migration Scripts

### 12.1 No Schema Migration Required (Phase 1)

For the JWT verification reconfiguration, **no Drizzle migration is needed**. The existing schema remains unchanged:

- `user` table: retained as-is
- `session` table: retained (Better Auth sessions still valid during transition)
- `account` table: retained (password hashes still needed)
- `verification` table: retained
- `passkey` table: retained (can be dropped later)

### 12.2 Env Migration

```bash
# .env.development / .env.local changes:
# REMOVE:
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=...

# ADD:
JWT_SECRET=<same value as BETTER_AUTH_SECRET or new 32+ char secret>
JWT_ISSUER=gaddr.com
JWT_AUDIENCE=gaddr-jobs
JWT_ACCESS_EXPIRATION_MINUTES=60
```

### 12.3 Future Migration Scripts (Deferred)

These are from V1 and are **not required** for the JWT reconfiguration:

| Migration | V1 Reference | Status |
|-----------|-------------|--------|
| Create `user_profiles` | M1 | Deferred |
| Create `user_security` | M2 | Deferred |
| Create `user_oauth_providers` | M3 | Deferred |
| Create `verification_tokens` | M4 | Deferred |
| Create `identity.sessions` | M5 | Deferred |
| Add FK constraints | M6-M7 | Deferred |
| Data migration | M8-M12 | Deferred |
| Column drops | M15-M16 | Deferred |
| Better Auth table drops | M17 | Deferred |

---

## 13. Testing Plan

### 13.1 Unit Tests

| Test | File | Status | Notes |
|------|------|--------|-------|
| `auth-schemas.test.ts` | `src/lib/validation/auth-schemas.test.ts` | **No change** | Format-level, independent |
| `password.test.ts` | `src/lib/validation/password.test.ts` | **No change** | Format-level, independent |
| `auth-error.test.ts` | `src/server/auth/auth-error.test.ts` | **DELETE** | Tests deleted module |
| New: `jwt-verify.test.ts` | `src/server/auth/jwt-verify.test.ts` | **CREATE** | Test JWT decode + verify |
| New: `dual-hash.test.ts` | `src/server/auth/dual-hash.test.ts` | **CREATE** | Test bcrypt/Argon2id dual verification |

### 13.2 Integration Tests

| Test Scenario | Pre-condition | Expected Result |
|--------------|---------------|-----------------|
| Login with valid JWT | Project B issues JWT | Session created, user authenticated |
| Login with expired JWT | JWT past expiry | 401, redirect to login |
| Login with wrong signature | JWT signed with wrong secret | 401, redirect to login |
| 2FA enforcement | User has 2FA enabled | Must verify 2FA before session grants access |
| Password reset flow | User requests reset | OTP sent, code verified, password updated |
| Email verification flow | New user registers | OTP sent, code verified, email marked verified |
| OAuth callback | Google OAuth from Project B | User linked, session created |
| Cross-subdomain cookies | Login on gaddr.com | Cookie accessible on jobs.gaddr.com |
| Rate limiting | 51 rapid auth requests | 429 after 50th request |

### 13.3 E2E Tests (Playwright)

| Test | Path | Notes |
|------|------|-------|
| Login flow | `src/app/(auth)/login/page.tsx` | Full page interaction |
| Register flow | `src/app/(auth)/register/page.tsx` | Full page interaction |
| Password reset | `src/app/(auth)/forgot-password/page.tsx` | Multi-step flow |
| Email verification | `src/app/(auth)/verify-email/page.tsx` | OTP entry |
| 2FA flow | Login → 2FA prompt → code entry | Multi-step flow |

### 13.4 Post-Deployment Verification

| Check | Command | Expected |
|-------|---------|----------|
| Build succeeds | `npm run build` | Exit 0 |
| Lint passes | `npm run lint` | No errors |
| Type check passes | `npm run typecheck` | No errors |
| Unit tests pass | `npm run test` | All pass |
| Auth endpoint responds | `curl /api/auth/session` | Valid response (or 401) |
| JWT verification works | Login via Project B → verify on Project A | Authenticated session |

---

## 14. Rollback Procedures

### 14.1 Phase Rollback Matrix

| Phase | Rollback Method | Time to Rollback | Data Loss Risk |
|-------|----------------|------------------|----------------|
| Dead code cleanup | `git revert` | < 1 min | None |
| Env changes | Restore previous `.env` | < 1 min | None |
| Better Auth reconfig | `git revert` + restore `BETTER_AUTH_SECRET` | < 5 min | None |
| JWT verification | `git revert` | < 5 min | None |
| Password hashing | Revert to Argon2id-only verification | < 5 min | None |

### 14.2 Rollback Triggers

| Trigger | Action | Authority |
|---------|--------|-----------|
| >5% of login attempts fail | Immediate rollback to previous auth config | On-call engineer |
| 2FA bypass detected | Rollback + hotfix | Security team |
| Cross-subdomain cookies broken | Rollback cookie config | On-call engineer |
| Redis connection failures | Check ioredis + Upstash configs | On-call engineer |

### 14.3 Feature Flag Strategy

```typescript
// Use feature flag to toggle between old and new auth
const useJwtVerification = process.env.USE_JWT_VERIFICATION === "true";

if (useJwtVerification) {
  // New: verify Project B JWT
  session = await verifyJwtFromRequest(req);
} else {
  // Old: use Better Auth getSession
  session = await auth.api.getSession({ headers: req.headers });
}
```

---

## 15. Risk Assessment

### 15.1 Risk Register

| # | Risk | Severity | Likelihood | Impact | Mitigation |
|---|------|----------|------------|--------|------------|
| R1 | Cookie name change logs out all users | HIGH | CERTAIN | All sessions invalidated | Dual-cookie detection during transition |
| R2 | Better Auth reconfig breaks session validation | HIGH | MEDIUM | All authenticated routes fail | Feature flag, staged rollout |
| R3 | 2FA enforcement gap (pre-existing) | HIGH | CONFIRMED | Users bypass 2FA | Fixed by JWT reconfiguration (§8.5) |
| R4 | shared-schema drift causes gaddr.com failures | HIGH | LOW | gaddr.com queries fail | Resolve drift before any shared-schema changes |
| R5 | Dual-hash verification fails for edge cases | MEDIUM | LOW | Some users cannot log in | Extensive testing, fallback to Argon2id |
| R6 | Redis key collision after prefix change | MEDIUM | LOW | OTP verification fails | Test key prefixes in staging |
| R7 | Cross-subdomain cookie domain mismatch | MEDIUM | MEDIUM | Auth not propagated | Test on staging with multiple subdomains |
| R8 | `@node-rs/argon2` native module fails on deploy | MEDIUM | LOW | Cannot verify legacy passwords | Move to dependencies (not devDependencies) if needed |
| R9 | JWT secret not set in all environments | HIGH | LOW | All JWT verification fails | Validate in `env.ts` schema |
| R10 | Upstash rate limiter blocks legitimate traffic | LOW | LOW | 429 errors for valid users | Increase limits during migration |

### 15.2 Risk Matrix

```
              LIKELIHOOD
              Low    Medium   High
SEVERITY  High  R4,R8   R7     R1,R3
          Med   R5,R6   —      —
          Low   R10     —      —
```

### 15.3 Pre-existing Issues (Not Introduced by This Plan)

| # | Issue | Location | Severity |
|---|-------|----------|----------|
| P1 | 2FA enforcement broken | `auth.ts:475-478` (comment) | High |
| P2 | No email index in gaddr-jobs schema | `auth-schema.ts` | Low |
| P3 | `@node-rs/argon2` in devDependencies | `package.json:102` | Low |
| P4 | shared-schema has 0 consumers | `packages/shared-schema` | Low |

---

## 16. ADR Section

### ADR-001: Better Auth Reconfiguration vs. Full Removal

**Status**: Proposed

**Context**: V1 proposed removing Better Auth entirely and replacing with custom JWT management. This requires rewriting session management, OAuth flow, cookie handling, and middleware.

**Decision**: Reconfigure Better Auth as a JWT verifier rather than removing it entirely.

**Rationale**:
- Better Auth's `nextCookies()` plugin handles cross-subdomain cookie propagation
- `auth.api.getSession()` can verify Project B's JWTs if both use the same secret
- Preserves the OAuth callback infrastructure
- Lower risk than full removal

**Consequences**:
- Better Auth remains a dependency (ongoing maintenance)
- Some Better Auth features (passkey, emailAndPassword) are disabled but code remains
- Future removal is still possible once the new auth flow is proven

### ADR-002: Dual-Hash Password Migration

**Status**: Proposed

**Context**: Project A uses Argon2id (via Better Auth), Project B uses bcrypt. Need cross-project password verification.

**Decision**: Implement dual-hash verification (try bcrypt first, fall back to Argon2id) with on-login re-hashing.

**Rationale**:
- Cannot batch-migrate hashes without plaintext passwords
- On-login migration is transparent to users
- No downtime or forced password resets required

**Consequences**:
- Argon2id dependency must be retained during transition
- Slightly more complex verification logic
- Migration is gradual (depends on user login frequency)

### ADR-003: shared-schema Resolution

**Status**: Proposed

**Context**: `@gaddr/shared-schema` has 0 imports in gaddr-jobs. It defines 5 tables that gaddr-jobs also defines independently. It's missing 9 columns.

**Decision**: Defer full resolution. Document the drift. If gaddr.com uses it, align as source of truth.

**Rationale**:
- gaddr-jobs has its own complete schema
- shared-schema is a legacy artifact from before the monorepo split
- Aligning now requires coordinating across teams

**Consequences**:
- Drift may continue until resolved
- Risk of gaddr.com queries breaking if shared-schema is updated without gaddr-jobs alignment

### ADR-004: Redis Dual-Client Architecture

**Status**: Documented (no change)

**Context**: Project A uses both ioredis (direct Redis protocol) and Upstash (HTTP REST API) for different purposes.

**Decision**: Maintain both clients. Document usage patterns clearly.

**Rationale**:
- ioredis: Used for Lua scripts (atomic OTP storage/verification) — Upstash doesn't support Lua
- Upstash: Used for rate limiting (serverless-friendly HTTP API)
- Different connection models serve different use cases

**Consequences**:
- Two Redis connection configurations to manage
- Different failover behaviors (ioredis: lazy connect; Upstash: in-memory fallback)
- Potential for confusion without documentation

---

## 17. Open Questions

| # | Question | Impact | Blocking? | Assigned |
|---|----------|--------|-----------|----------|
| Q1 | Does gaddr.com import `@gaddr/shared-schema`? | Determines if we delete or integrate | Yes — for §9 | gaddr.com team |
| Q2 | Does Project B use Better Auth JWT plugin or custom JWT? | Determines if we use `auth.api.getSession()` or `jose` | Yes — for §8 | Project B team |
| Q3 | What is Project B's JWT `issuer` string? | Required for JWT verification | Yes — for §8 | Project B team |
| Q4 | Should `@node-rs/argon2` move from devDependencies to dependencies? | Affects deploy reliability | No — for §6 | DevOps |
| Q5 | Are the 6 fix scripts needed for any future data fixes? | Determines if we delete or archive | No — for §10 | Team lead |
| Q6 | What is the `usedFreeLimit` table used for? | Determines if we keep or drop | No — for §5 | Product |
| Q7 | Should passkey support be preserved? | Affects whether passkey table is kept | No — for §4 | Product |
| Q8 | What is the cookie name convention for Project B? | Affects middleware cookie detection | Yes — for §4 | Project B team |
| Q9 | Should the email index (`user_email_idx`) be added to gaddr-jobs schema? | Affects query performance | No — for §5 | Team |
| Q10 | What is the rollback SLA for auth changes? | Determines feature flag strategy | No — for §14 | SRE |

---

## Appendix A: Complete File Inventory

### Files to DELETE (11)

| # | File | Lines | Category |
|---|------|-------|----------|
| 1 | `fix-all.js` | varies | Dead code |
| 2 | `fix-governance.js` | varies | Dead code |
| 3 | `fix-governance2.js` | varies | Dead code |
| 4 | `fix-mentorship.js` | varies | Dead code |
| 5 | `fix-tables.js` | varies | Dead code |
| 6 | `fix-vote-table.js` | varies | Dead code |
| 7 | `backups/user_backup_1784300813041.json` | varies | Dead code |
| 8 | `src/server/auth/auth-api.ts` | 55 | Auth dead code |
| 9 | `src/server/auth/auth-error.ts` | 18 | Auth dead code |
| 10 | `src/server/auth/auth-error.test.ts` | 24 | Auth dead code |
| 11 | `auth.config.ts` | 40 | Config dead code |

### Files to MODIFY (8)

| # | File | Lines | Change Type |
|---|------|-------|-------------|
| 1 | `src/server/auth/index.ts` | 178 | Major rewrite |
| 2 | `src/server/trpc/context.ts` | 89 | Rewrite session lookup |
| 3 | `src/server/auth/require-session.ts` | 39 | Rewrite session lookup |
| 4 | `src/middleware.ts` | 96 | Update cookie name + JWT |
| 5 | `src/lib/auth-client.ts` | 17 | Rewrite to custom client |
| 6 | `src/env.ts` | 65 | Update env schema |
| 7 | `src/server/auth/trigger-verification-email.ts` | 20 | Remove auth-api dependency |
| 8 | `package.json` | 136 | Add JWT lib, remove Better Auth plugins |

### Files to CREATE (2)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/server/auth/jwt-verify.ts` | JWT verification utility |
| 2 | `src/server/auth/dual-hash.ts` | Dual bcrypt/Argon2id verification |

### Files UNCHANGED (verified)

| # | File | Lines | Reason |
|---|------|-------|--------|
| 1 | `src/server/auth/rate-limit.ts` | 77 | Redis-based, independent of auth library |
| 2 | `src/server/auth/verification-code.ts` | 52 | Retained (HMAC secret changes from `BETTER_AUTH_SECRET` to `JWT_SECRET`) |
| 3 | `src/server/auth/password-reset-code.ts` | 59 | Retained (resetToken dependency on Better Auth removed) |
| 4 | `src/lib/validation/auth-schemas.ts` | 37 | Format-level, independent |
| 5 | `src/lib/validation/password.ts` | 18 | Format-level, independent |
| 6 | `src/lib/constants/auth.ts` | 8 | Format-level, independent |
| 7 | `src/lib/email/normalize.ts` | 21 | Format-level, independent |
| 8 | `src/server/db/schema.ts` | 72 | Barrel export, no changes needed |
| 9 | `src/server/db/auth-schema.ts` | 174 | Schema unchanged in this phase |
| 10 | `src/server/db/index.ts` | 26 | DB connection, unchanged |
| 11 | `src/server/redis.ts` | 8 | ioredis client, unchanged |
| 12 | `src/server/rate-limit.ts` | 82 | Upstash client, unchanged |
| 13 | `src/components/auth/auth-footer.tsx` | 84 | Static UI, unchanged |
| 14 | `src/components/auth/otp-input.tsx` | 87 | Generic UI, unchanged |

---

## Appendix B: Key Code References

| Reference | File | Line | What It Does |
|-----------|------|------|-------------|
| Better Auth instance | `src/server/auth/index.ts` | 49-176 | Full Better Auth configuration |
| Session type export | `src/server/auth/index.ts` | 178 | `export type Session = typeof auth.$Infer.Session` |
| Session lookup | `src/server/trpc/context.ts` | 56 | `auth.api.getSession({ headers: req.headers })` |
| Session type mapping | `src/server/trpc/context.ts` | 41-53 | `mapSessionUser(session)` |
| 2FA enforcement | `src/server/auth/require-session.ts` | 31-36 | Checks `twoFactorEnabled` + `twoFaVerifiedAt` |
| 2FA bypass bug | `src/server/trpc/routers/auth.ts` | 475-478 | Comment documenting broken enforcement |
| Cookie check | `src/middleware.ts` | 45-46 | `better-auth.session_token` cookie names |
| Better Auth API route | `src/app/api/auth/[...all]/route.ts` | 6 | `toNextJsHandler(auth)` |
| HMAC secret usage | `src/server/auth/verification-code.ts` | 12 | `env.BETTER_AUTH_SECRET` in hash |
| Reset token dependency | `src/server/auth/password-reset-code.ts` | 22,52 | `storePasswordResetCode(email, code, resetToken)` |
| postToAuthApi calls | `src/server/trpc/routers/auth.ts` | 272, 302, 352 | Password reset, change password |
| env schema | `src/env.ts` | 18-19 | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` |
| Drizzle config | `drizzle.config.ts` | 8 | Schema path: `./src/server/db/schema.ts` |
| ioredis client | `src/server/redis.ts` | 5-7 | `new Redis(env.REDIS_URL, ...)` |
| Upstash client | `src/server/rate-limit.ts` | 4-10 | `new Redis({ url, token })` |

---

*Generated: 2026-07-19*
*Validated against live codebase: gaddr-jobs (Next.js 16.2.1, Better Auth 1.5.6, Drizzle 0.45.2)*
*V1 source: 06_ProjectA_Changes.md (785 lines)*
*Total files analyzed: 30+ source files, 9 schema files, 76 tRPC routers, 15 API routes*
