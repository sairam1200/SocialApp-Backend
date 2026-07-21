# 01 — Project A (gaddep) Complete Architecture Audit

> **Scope**: `E:\Github\gaddep` — authentication, Drizzle schema, User table, and full dependency tree.
> **Date**: 2026-07-19
> **Purpose**: Establish this project as the Schema Owner for cross-project integration.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Authentication Architecture](#2-authentication-architecture)
   - 2.1 [Auth Library & Configuration](#21-auth-library--configuration)
   - 2.2 [Signup Flow](#22-signup-flow)
   - 2.3 [Login Flow](#23-login-flow)
   - 2.4 [Password Hashing](#24-password-hashing)
   - 2.5 [Session Handling](#25-session-handling)
   - 2.6 [JWT / Token Model](#26-jwt--token-model)
   - 2.7 [Refresh Tokens](#27-refresh-tokens)
   - 2.8 [OAuth (Google)](#28-oauth-google)
   - 2.9 [Passkey (WebAuthn)](#29-passkey-webauthn)
   - 2.10 [Email Verification](#210-email-verification)
   - 2.11 [Forgot Password / Password Reset](#211-forgot-password--password-reset)
   - 2.12 [Two-Factor Authentication (2FA)](#212-two-factor-authentication-2fa)
   - 2.13 [Rate Limiting](#213-rate-limiting)
   - 2.14 [Middleware / Route Protection](#214-middleware--route-protection)
3. [Drizzle Schema Architecture](#3-drizzle-schema-architecture)
   - 3.1 [Schema Organization](#31-schema-organization)
   - 3.2 [Database Connection](#32-database-connection)
   - 3.3 [Migration System](#33-migration-system)
4. [User Table — Complete Column Reference](#4-user-table--complete-column-reference)
5. [Auth-Related Tables](#5-auth-related-tables)
   - 5.1 [Session Table](#51-session-table)
   - 5.2 [Account Table](#52-account-table)
   - 5.3 [Verification Table](#53-verification-table)
   - 5.4 [Passkey Table](#54-passkey-table)
   - 5.5 [UserIdMapping Table](#55-useridmapping-table)
   - 5.6 [UsedFreeLimit Table](#56-usedfreelimit-table)
6. [User Table Dependency Tree](#6-user-table-dependency-tree)
   - 6.1 [Full FK Dependency Map](#61-full-fk-dependency-map)
   - 6.2 [onDelete Behavior Summary](#62-ondelete-behavior-summary)
   - 6.3 [Missing onDelete Specifications](#63-missing-ondelete-specifications)
7. [Schema Drift & Inconsistencies](#7-schema-drift--inconsistencies)
8. [Migration Issues](#8-migration-issues)
9. [Circular Import Analysis](#9-circular-import-analysis)
10. [Dead Code / Unused Artifacts](#10-dead-code--unused-artifacts)
11. [Key File Reference](#11-key-file-reference)

---

## 1. Project Overview

| Aspect | Details |
|--------|---------|
| **Root** | `E:\Github\gaddep` |
| **Main App** | `gaddr-jobs/` — Next.js 16 (App Router), React 19, TypeScript |
| **Auth Library** | Better Auth v1.5.6 |
| **Database** | PostgreSQL (Neon cloud), `postgres` (postgres.js) driver |
| **ORM** | Drizzle ORM v0.45 |
| **API Layer** | tRPC v11 with 77+ routers |
| **Shared Package** | `packages/shared-schema/` — shared Drizzle tables for monorepo |
| **Migrations** | 86 Drizzle Kit SQL files + manual scripts |
| **Schema Files** | 61 individual `*-schema.ts` barrel-exported from `schema.ts` |
| **Session Storage** | PostgreSQL (primary) + Redis secondary (optional) |
| **Email** | Nodemailer SMTP + React Email templates |
| **Testing** | Vitest (unit + integration), Playwright (E2E) |

### Auth Methods Supported

1. **Email + Password** (primary)
2. **Google OAuth** (social provider)
3. **Passkey / WebAuthn** (`@better-auth/passkey`)

### No JWT / Refresh Token Model

Better Auth uses **database-backed sessions** with opaque tokens, NOT JWTs. There are no access/refresh token pairs. The session cookie (`better-auth.session_token`) is the sole credential, stored in an HTTP-only secure cookie and backed by the `session` table in PostgreSQL.

---

## 2. Authentication Architecture

### 2.1 Auth Library & Configuration

**File**: `gaddr-jobs/src/server/auth/index.ts` (178 lines)

Better Auth is configured with:

| Config Key | Value | Notes |
|------------|-------|-------|
| `secret` | `env.BETTER_AUTH_SECRET` | Server-side HMAC secret |
| `baseURL` | `env.NEXT_PUBLIC_APP_URL` | Canonical app URL |
| `trustedOrigins` | Dev: localhost variants; Prod: gaddr.com, NEXT_PUBLIC_APP_URL, BETTER_AUTH_URL | CORS trusted origins |
| `crossSubDomainCookies` | Enabled in prod on `.gaddr.com` | Cross-subdomain session sharing |
| `database` | `drizzleAdapter(db, { provider: "pg", schema })` | All Drizzle schema passed |
| `secondaryStorage` | Redis via `@better-auth/redis-storage` (prefix `better-auth:`) | Optional, fails gracefully |
| `emailAndPassword.enabled` | `true` | Email+password auth active |
| `emailAndPassword.requireEmailVerification` | `true` | Must verify email before access |
| `emailAndPassword.minPasswordLength` | `8` | From `PASSWORD_MIN_LENGTH` constant |
| `emailAndPassword.resetPasswordTokenExpiresIn` | `300` (5 min) | `TWO_FA_CODE_TTL_SEC` |
| `rateLimit.enabled` | `!isTest` | Disabled in test env |
| `plugins` | `nextCookies()`, `passkey({ rpName: "Gaddr", ... })` | |

**Custom user fields** (additionalFields):
- `firstName`: string, required, input=true
- `lastName`: string, required, input=true
- `role`: string, required=false, input=false (server-controlled)
- `isAdmin`: boolean, required=false, input=false (server-controlled)

### 2.2 Signup Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. User fills form (firstName, lastName, email, password)          │
│  2. Client-side validation:                                         │
│     - email format (z.email())                                      │
│     - password strength (passwordStrengthError):                    │
│       * >= 8 chars, lowercase, uppercase, digit, special char       │
│     - password confirmation match                                   │
│     - terms acceptance checkbox                                     │
│     - real-time email availability check (tRPC isEmailAvailable)    │
│  3. authClient.signUp.email({ email, password, name,                │
│       firstName, lastName })                                        │
│  4. Better Auth databaseHook `user.create.before`:                  │
│     - Block duplicate email (queries user table)                    │
│     - Split Google's `name` into firstName/lastName if missing      │
│     - Compose `name` from firstName + lastName                      │
│  5. Better Auth creates: user row + account row (provider: email)   │
│  6. Better Auth triggers sendVerificationEmail hook:                │
│     - Generates 6-digit OTP via randomInt(0, 999999)               │
│     - Stores SHA-256 hash in Redis (key: gaddr:email-verify:{email})│
│     - Sends branded HTML email with verification LINK + CODE        │
│  7. Client redirects to /verify-email?email=...                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key files involved**:
- `src/components/auth/auth-form.tsx` — SignUpForm component (798 lines)
- `src/server/auth/index.ts` — databaseHooks.user.create.before
- `src/server/auth/verification-code.ts` — OTP generation + Redis storage
- `src/server/email/auth-emails.ts` — sendVerificationEmail()

### 2.3 Login Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. User enters email + password                                    │
│  2. Client checks if 2FA is enabled:                               │
│     - Calls api.auth.request2faCode({ email })                     │
│     - If 2FA enabled → shows 2FA code input                        │
│     - If not → proceed to step 3                                    │
│  3. authClient.signIn.email({ email, password })                   │
│  4. Better Auth:                                                    │
│     - Finds account row (provider: "email")                        │
│     - Verifies password hash (argon2 via @node-rs/argon2)          │
│     - Creates session row in PostgreSQL                             │
│     - Optionally writes to Redis secondary storage                  │
│     - Sets better-auth.session_token cookie (HTTP-only, secure)    │
│  5. If 2FA enabled:                                                │
│     - Client calls api.auth.verify2faLogin({ email, code })        │
│     - Server verifies OTP from Redis, sets twoFaVerifiedAt on user  │
│     - Then proceeds with signIn.email                               │
│  6. Client reads session → routes by role:                         │
│     - business_owner → /recruiter                                   │
│     - freelancer → /freelancer                                      │
│     - job_seeker → /job-seeker                                      │
│     - no role → /role-selection                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Role-based routing** in `auth-form.tsx:SignInForm`:
```typescript
if (role === "business_owner") router.push(APP_PATHS.recruiterDashboard);
else if (role === "freelancer") router.push("/freelancer");
else if (role === "job_seeker") router.push("/job-seeker");
else router.push(APP_PATHS.roleSelection);
```

### 2.4 Password Hashing

**Algorithm**: Argon2id (via `@node-rs/argon2` — native Rust binding)

Better Auth handles hashing internally. The `account.password` column stores the Argon2id hash. When a user signs up or changes their password, Better Auth:
1. Hashes the plaintext password with Argon2id
2. Stores the hash in `account.password`
3. On login, verifies the submitted password against the stored hash

**Client-side validation** (`src/lib/validation/password.ts`):
```typescript
function passwordStrengthError(password: string): string | null {
  if (password.length < 8) return "At least 8 characters";
  if (!/[a-z]/.test(password)) return "Include a lowercase letter";
  if (!/[A-Z]/.test(password)) return "Include an uppercase letter";
  if (!/[0-9]/.test(password)) return "Include a number";
  if (!PASSWORD_SPECIAL_RE.test(password)) return "Include a special character";
  return null;
}
```

### 2.5 Session Handling

Better Auth sessions are **database-backed**, not JWT-based.

**Session lifecycle**:
1. **Creation**: On successful login, Better Auth inserts a row into the `session` table with an opaque token, expiry, IP, user-agent, and userId.
2. **Storage**: The session token is stored in an HTTP-only secure cookie (`better-auth.session_token`). In production, a `__Secure-` prefixed variant is also checked.
3. **Secondary storage**: If Redis is configured, session data is also cached in Redis (`better-auth:` prefix) for faster lookups.
4. **Retrieval**: `auth.api.getSession({ headers })` reads the cookie, looks up the session in DB (or Redis), and returns the user object.
5. **Expiry**: Sessions have an `expiresAt` timestamp. Better Auth checks this on each request.
6. **Cross-subdomain**: In production, cookies are set on `.gaddr.com` domain.
7. **Revocation**: `changePassword` accepts `revokeOtherSessions` flag. `deleteSelf` deletes the user (cascading to sessions).

**Session type**:
```typescript
type Session = {
  user: { id, email, emailVerified, image, firstName, lastName, name, role, isAdmin };
  session: { id, userId, expiresAt, token, ipAddress, userAgent };
};
```

### 2.6 JWT / Token Model

**There is no JWT.** Better Auth uses opaque bearer tokens stored in the `session` table. The token is a random string, not a signed JWT payload. This means:
- No client-side token decoding
- Every session validation hits the database (or Redis cache)
- Token revocation is immediate (delete the row)
- No token expiry calculation on the client

### 2.7 Refresh Tokens

**There is no separate refresh token.** Better Auth uses a single session token with a configurable lifetime. The session row in PostgreSQL is the source of truth. When the session expires, the user must re-authenticate.

The `account` table stores `refreshToken` and `refreshTokenExpiresAt` for **OAuth provider tokens** (Google), not for session management.

### 2.8 OAuth (Google)

**Configuration** (`src/server/auth/index.ts`):
```typescript
socialProviders: {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  },
},
```

**Flow**:
1. Client calls `authClient.signIn.social({ provider: "google", callbackURL: "..." })`
2. Better Auth redirects to Google OAuth consent screen
3. On callback, Better Auth creates/links an `account` row (provider: "google")
4. Database hook `user.create.before` splits Google's `name` into `firstName`/`lastName`
5. Google's `sub` (subject ID) is stored as `account.accountId`
6. The `user.googleId` column stores the Google user ID (added by merger migration 0063)

**Note**: Google OAuth bypasses email verification requirement.

### 2.9 Passkey (WebAuthn)

**Configuration**:
```typescript
passkey({
  rpName: "Gaddr",
  rpID: isDev ? "localhost" : new URL(authUrl).hostname,
  origin: authUrl,
})
```

**Client plugin**: `@better-auth/passkey/client` → `passkeyClient()`

**Server table**: `passkey` — stores WebAuthn credentials (publicKey, credentialID, counter, deviceType, backedUp, transports, aaguid).

**Flow**:
- Registration: `authClient.signUp.passkey()` → WebAuthn ceremony → passkey row created
- Login: `authClient.signIn.passkey()` → WebAuthn ceremony → session created

### 2.10 Email Verification

**Two parallel mechanisms**:

#### A. Verification Link (Better Auth built-in)
1. Better Auth generates a verification token
2. `sendVerificationEmail` hook sends an email with a callback URL containing the token
3. User clicks link → `/api/auth/verify-email?token=...&callbackURL=/`
4. Better Auth marks `user.emailVerified = true`

#### B. Verification Code (custom OTP)
1. Same hook generates a 6-digit code via `generateSixDigitCode()` (cryptographically uniform `randomInt(0, 999999)`)
2. Code is SHA-256 hashed with email + secret, stored in Redis (`gaddr:email-verify:{email}`, TTL 15 min)
3. Email contains BOTH the link AND the 6-digit code
4. User can enter code on `/verify-email-code` page
5. tRPC mutation `verifyEmailWithCode` → `verifyAndConsumeEmailCode()` (timing-safe comparison)
6. On success: sets `user.emailVerified = true`, sends welcome email, tracks `sign_up` event

**Redis OTP scripts** (atomic get-and-delete):
```lua
local stored = redis.call("GET", KEYS[1])
if not stored then return "" end
redis.call("DEL", KEYS[1])
return stored
```

**Constants**:
- `AUTH_CODE_TTL_SEC = 900` (15 minutes) for email verification
- `TWO_FA_CODE_TTL_SEC = 300` (5 minutes) for 2FA codes
- `emailVerification.expiresIn = 86400` (24 hours) for Better Auth link tokens

### 2.11 Forgot Password / Password Reset

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. User enters email on /forgot-password                           │
│  2. tRPC: requestPasswordReset                                     │
│     - Rate limit: 5 requests/hour per email+IP                     │
│     - Calls Better Auth API: request-password-reset                 │
│     - Better Auth generates reset token + sends email hook          │
│  3. sendResetPassword hook:                                         │
│     - Generates 6-digit OTP                                         │
│     - Stores SHA-256 hash + reset token in Redis                    │
│       (key: gaddr:pwd-reset:{email}, TTL 15 min)                   │
│     - Sends branded email with link + code                          │
│  4. User enters code + new password on /reset-password-code         │
│  5. tRPC: resetPasswordWithCode                                     │
│     - verifyAndConsumePasswordResetCode():                          │
│       * Validates 6-digit format                                    │
│       * SHA-256 hashes submitted code                               │
│       * Atomic Redis GET+DEL                                        │
│       * Timing-safe comparison                                      │
│       * Returns stored reset token                                  │
│     - Calls Better Auth API: reset-password with token + newPassword│
│  6. Better Auth updates account.password hash                       │
│  7. Client redirects to /login?reset=1                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Security features**:
- Rate limiting: 5 requests/hour per email+IP
- Timing-safe comparison (prevents timing attacks)
- Atomic Redis operations (Lua scripts)
- Email normalization (Gmail dot/plus canonicalization)
- Same response regardless of email existence (prevents enumeration)

### 2.12 Two-Factor Authentication (2FA)

**Type**: Email-based OTP (NOT TOTP/authenticator app)

**Enabling 2FA**:
1. User goes to `/settings/two-factor`
2. Calls `enable2fa` mutation with a 6-digit code
3. Server generates code, stores in Redis, sends email
4. User enters code → `verifyAndConsumeEmailCode()` → sets `user.twoFactorEnabled = true`

**Login with 2FA**:
1. After email+password sign-in, client checks `request2faCode`
2. If 2FA enabled, shows code input
3. User enters code → `verify2faLogin` mutation → sets `user.twoFaVerifiedAt = new Date()`
4. Then proceeds with normal sign-in

**Session enforcement** (`require-session.ts`):
```typescript
if (row?.twoFactorEnabled) {
  const verifiedAt = row.twoFaVerifiedAt;
  if (!verifiedAt || Date.now() - verifiedAt.getTime() > 5 * 60 * 1000) {
    redirect(loginRedirectUrl(callbackURL));
  }
}
```
- 2FA verification expires after 5 minutes
- Checked on every server-side page load via `requireSession()`

**Known issue** (documented in code comment at `auth.ts:475-478`):
> "ponytail: 2FA enforcement is broken — verify2faLogin only verifies a code but doesn't gate session creation. Users with 2FA enabled can bypass it by using the Better Auth sign-in endpoint directly."

### 2.13 Rate Limiting

**Custom Redis-based rate limiting** (`src/server/auth/rate-limit.ts`):

| Rule | Prefix | Max | TTL | Scope |
|------|--------|-----|-----|-------|
| Verification resend | `gaddr:verify-resend:` | 5 | 3600s (1hr) | email+IP |
| Password reset request | `gaddr:pwd-reset-req:` | 5 | 3600s (1hr) | email+IP |
| Password change | `gaddr:change-pwd:` | 5 | 3600s (1hr) | userId+IP |

**Implementation**: Redis Lua `INCR` + `EXPIRE` script (atomic):
```lua
local n = redis.call("INCR", KEYS[1])
if n == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return n
```

Better Auth also has its own built-in rate limiting (enabled in non-test environments).

### 2.14 Middleware / Route Protection

**File**: `src/middleware.ts` (96 lines)

**Mechanism**: Edge middleware checks for `better-auth.session_token` or `__Secure-better-auth.session_token` cookie.

**Public routes** (no auth required):
```
/, /login, /register, /forgot-password, /reset-password-code,
/verify-email-code, /verify-email, /account-created, /role-selection,
/about, /contact, /faq, /features, /help, /press, /privacy, /terms,
/acceptable-use, /paths, /browse, /opportunities, /projects,
/companies, /careers, /job-seeker, /pricing, /cookies, /career,
/explore, /mentorship, /communities, /governance, /rewards,
/community-funds, /universities, /opportunities/co-founders,
/opportunities/bounties, /disputes
```

**Protected routes**: Everything else → redirect to `/login?callbackURL=...`

**Note**: Middleware only checks cookie presence, NOT validity. Server-side session validation happens in `auth.api.getSession()` and `requireSession()`.

---

## 3. Drizzle Schema Architecture

### 3.1 Schema Organization

```
src/server/db/
├── schema.ts                    ← Master barrel (re-exports all 61 sub-schemas)
├── auth-schema.ts               ← Better Auth tables (user, session, account, verification, passkey)
├── index.ts                     ← DB client (postgres.js + drizzle)
├── activity-feed-schema.ts
├── admin-ai-key-schema.ts
├── ai-audit-schema.ts
├── ai-settings-schema.ts
├── analytics-schema.ts
├── application-schema.ts
├── audit-schema.ts
├── bounty-schema.ts
├── cal-user-schema.ts
├── career-memory-schema.ts
├── cofounder-schema.ts
├── community-fund-schema.ts
├── community-schema.ts
├── company-schema.ts
├── contract-schema.ts
├── contribution-schema.ts
├── credential-schema.ts
├── credit-schema.ts
├── crypto-payment-schema.ts
├── dispute-schema.ts
├── employer-verification-schema.ts
├── endorsement-schema.ts        ← Has NO FK to user (standalone)
├── external-job-schema.ts       ← Has NO FK to user (standalone)
├── gdpr-schema.ts               ← accountDeletionLog (userId WITHOUT FK constraint)
├── governance-schema.ts
├── internal-marketplace-schema.ts
├── interview-intelligence-schema.ts
├── interview-kit-schema.ts
├── interview-schema.ts
├── invoice-schema.ts
├── issuer-registry-schema.ts    ← Has NO FK to user
├── meeting-schema.ts
├── mentorship-schema.ts
├── merger-schema.ts             ← 17 tables from gaddr.com merger
├── milestone-dispute-schema.ts
├── milestone-validation-schema.ts
├── network-schema.ts
├── notification-schema.ts
├── opportunity-schema.ts
├── partner-reward-schema.ts
├── passport-schema.ts           ← 8 passport sub-tables
├── profile-schema.ts            ← 4 profile types
├── project-room-schema.ts
├── project-schema.ts
├── proof-of-contribution-schema.ts
├── recruiter-crm-schema.ts
├── review-schema.ts
├── saved-jobs-schema.ts
├── saved-search-schema.ts
├── scam-detection-schema.ts
├── selective-disclosure-schema.ts
├── skill-schema.ts
├── smart-account-schema.ts      ← Has NO FK to user
├── talent-schema.ts
├── team-schema.ts
├── token-schema.ts
├── trust-schema.ts
└── university-schema.ts         ← Has NO FK to user
```

**Barrel export** (`schema.ts`): Uses `export *` for most files. Special handling for `milestone-dispute-schema.ts` (selective exports to avoid naming conflicts with `dispute-schema.ts`).

### 3.2 Database Connection

**File**: `src/server/db/index.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(env.DATABASE_URL, {
  max: poolMax,           // 1 on Vercel, env.DATABASE_POOL_MAX otherwise
  prepare: !isVercel,     // Prepared statements disabled on Vercel
  ssl: needsSsl ? "require" : false,
  connect_timeout: 10,
  idle_timeout: 30,
});

export const db = drizzle(client, { schema });
```

**Key decisions**:
- `prepare: false` on Vercel (serverless, no connection reuse)
- SSL auto-detected for Neon, neon.io, or URLs containing `sslmode`
- Pool size controlled by `DATABASE_POOL_MAX` env var

### 3.3 Migration System

**86 SQL migration files** in `gaddr-jobs/drizzle/`:

| Range | Count | Description |
|-------|-------|-------------|
| 0000-0011 | 12 | Core tables (auth, profiles, opportunities, notifications, talent) |
| 0012-0022 | 11 | Saved jobs, skills, contracts, audit, performance indexes |
| 0023-0036 | 14 | Analytics, subscriptions, invoices, disputes, payments, companies |
| 0037-0048 | 12 | Portfolio, AI settings, crypto, unified opportunity model |
| 0049-0058 | 10 | Passport, employer verification, privacy, trust, projects, interviews |
| 0059-0069 | 11 | Meeting agent, network, marketplace, economic ecosystem, merger, 2FA |
| 0070-0079 | 10 | Opportunity enhancements, credentials, milestones, GDPR |
| 0080-0085 | 6 | Milestone disputes/escrow/validation, GDPR soft delete, user bans, coordinates |

**Migration journal** (`drizzle/meta/_journal.json`): Only 14 entries tracked (idx 0-13), which is inconsistent with the 86 SQL files present. This suggests migrations were applied via `drizzle-kit push` or manual SQL rather than through the normal Drizzle Kit generate/migrate pipeline.

**Additional migration scripts**:
- `apply-migrations.js` — Manual SQL runner
- `scripts/migrate-gaddr-data.ts` — Data migration from gaddr.com
- `scripts/migrate-gaddr-users.ts` — User data migration

---

## 4. User Table — Complete Column Reference

**File**: `src/server/db/auth-schema.ts:12-57`
**DB table name**: `"user"`
**Primary key**: `id` (text, generated by Better Auth — UUID format)

| # | TypeScript Field | DB Column | Type | Nullable | Default | Unique | Description |
|---|-----------------|-----------|------|----------|---------|--------|-------------|
| 1 | `id` | `id` | text | NOT NULL | — (Better Auth generates) | PK | User identifier (UUID) |
| 2 | `name` | `name` | text | NOT NULL | — | No | Full display name (composed from firstName+lastName) |
| 3 | `email` | `email` | text | NOT NULL | — | **UNIQUE** | Email address |
| 4 | `emailVerified` | `email_verified` | boolean | NOT NULL | `false` | No | Whether email has been verified |
| 5 | `image` | `image` | text | **NULLABLE** | null | No | Profile image (base64 data URI or URL) |
| 6 | `createdAt` | `created_at` | timestamp | NOT NULL | `now()` | No | Account creation timestamp |
| 7 | `updatedAt` | `updated_at` | timestamp | NOT NULL | `now()` + `$onUpdate` | No | Last update timestamp (auto-updates on write) |
| 8 | `firstName` | `first_name` | text | NOT NULL | — | No | Given name |
| 9 | `lastName` | `last_name` | text | NOT NULL | — | No | Family name |
| 10 | `role` | `role` | text | **NULLABLE** | null | No | User role: "business_owner", "freelancer", "job_seeker" |
| 11 | `twoFactorEnabled` | `two_factor_enabled` | boolean | **NULLABLE** | `false` | No | Whether email-based 2FA is enabled |
| 12 | `twoFaVerifiedAt` | `two_fa_verified_at` | timestamp | **NULLABLE** | null | No | When 2FA was last verified (5min session window) |
| 13 | `isVerified` | `is_verified` | boolean | NOT NULL | `false` | No | Platform verification badge |
| 14 | `isAdmin` | `is_admin` | boolean | NOT NULL | `false` | No | Admin privileges |
| 15 | `stripeCustomerId` | `stripe_customer_id` | text | **NULLABLE** | null | No | Stripe customer identifier |
| 16 | `stripePriceId` | `stripe_price_id` | text | **NULLABLE** | null | No | Current Stripe price/plan |
| 17 | `stripeSubscriptionId` | `stripe_subscription_id` | text | **NULLABLE** | null | No | Active Stripe subscription ID |
| 18 | `subscriptionStatus` | `subscription_status` | text | NOT NULL | `"none"` | No | "none", "active", "canceled", etc. |
| 19 | `subscriptionPlan` | `subscription_plan` | text | NOT NULL | `"free"` | No | Plan tier name |
| 20 | `jobPostLimit` | `job_post_limit` | integer | NOT NULL | `1` | No | Max allowed active job posts |
| 21 | `activeJobPostCount` | `active_job_post_count` | integer | NOT NULL | `0` | No | Current active job post count |
| 22 | `walletAddress` | `wallet_address` | text | **NULLABLE** | null | No | Ethereum/crypto wallet address |
| 23 | `privateSearchMode` | `private_search_mode` | boolean | **NULLABLE** | `false` | No | Hide profile from search results |
| 24 | `blockedEmployers` | `blocked_employers` | text[] | **NULLABLE** | `'{}'::text[]` | No | Array of blocked employer user IDs |
| 25 | `aiAnalysisOptOut` | `ai_analysis_opt_out` | boolean | **NULLABLE** | `false` | No | Opt out of AI-powered analytics |
| 26 | `googleId` | `google_id` | text | **NULLABLE** | null | **UNIQUE** | Google OAuth subject ID |
| 27 | `phoneNumber` | `phone_number` | text | **NULLABLE** | null | No | Phone number (from gaddr.com merger) |
| 28 | `gender` | `gender` | text | **NULLABLE** | null | No | Gender (from merger) |
| 29 | `dateOfBirth` | `date_of_birth` | timestamp | **NULLABLE** | null | No | Date of birth (from merger) |
| 30 | `onboardingStep` | `onboarding_step` | text | **NULLABLE** | `"not_started"` | No | Onboarding progress tracker |
| 31 | `referralCode` | `referral_code` | text | **NULLABLE** | null | **UNIQUE** | Unique referral code |
| 32 | `referredBy` | `referred_by` | text | **NULLABLE** | null | No | Referrer's referral code |
| 33 | `profilePrivacy` | `profile_privacy` | text | **NULLABLE** | `"public"` | No | "public" or "private" |
| 34 | `sourceApp` | `source_app` | text | **NULLABLE** | `"jobs"` | No | Origin app ("jobs" or "gaddr") |
| 35 | `status` | `status` | text | **NULLABLE** | `"active"` | No | "active" or "deleted" |
| 36 | `deletedAt` | `deleted_at` | timestamp | **NULLABLE** | null | No | Soft delete timestamp |
| 37 | `bannedAt` | `banned_at` | timestamp | **NULLABLE** | null | No | Ban timestamp |
| 38 | `banReason` | `ban_reason` | text | **NULLABLE** | null | No | Ban reason text |

### Column Groups by Origin

| Group | Columns | Origin |
|-------|---------|--------|
| **Core Auth** (Better Auth) | id, name, email, emailVerified, image, createdAt, updatedAt | Better Auth managed |
| **Additional Fields** | firstName, lastName, role, isAdmin | Better Auth additionalFields config |
| **2FA** | twoFactorEnabled, twoFaVerifiedAt | Custom email-based 2FA |
| **Verification** | isVerified | Platform verification badge |
| **Stripe/Billing** | stripeCustomerId, stripePriceId, stripeSubscriptionId, subscriptionStatus, subscriptionPlan, jobPostLimit, activeJobPostCount | Stripe integration |
| **Privacy** | privateSearchMode, blockedEmployers, aiAnalysisOptOut | Privacy controls |
| **Crypto** | walletAddress | Blockchain integration |
| **gaddr.com Merger** | googleId, phoneNumber, gender, dateOfBirth, onboardingStep, referralCode, referredBy, profilePrivacy, sourceApp | Migration 0063 |
| **Soft Delete/GDPR** | status, deletedAt | Migration 0083 |
| **Admin/Ban** | bannedAt, banReason | Migration 0084 |

---

## 5. Auth-Related Tables

### 5.1 Session Table

**File**: `src/server/db/auth-schema.ts:65-82`
**DB table name**: `"session"`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | text | PK | — | Session identifier |
| `expiresAt` | timestamp | NOT NULL | — | Session expiry |
| `token` | text | NOT NULL | — | **UNIQUE** — session token (opaque, not JWT) |
| `createdAt` | timestamp | NOT NULL | `now()` | |
| `updatedAt` | timestamp | NOT NULL | `now()` + onUpdate | |
| `ipAddress` | text | NULLABLE | null | Client IP |
| `userAgent` | text | NULLABLE | null | Client user-agent |
| `userId` | text | NOT NULL | — | **FK → user.id (CASCADE)** |

**Indexes**: `session_userId_idx` on `userId`

### 5.2 Account Table

**File**: `src/server/db/auth-schema.ts:84-106`
**DB table name**: `"account"`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | text | PK | — | |
| `accountId` | text | NOT NULL | — | Provider-specific ID (e.g., Google sub) |
| `providerId` | text | NOT NULL | — | "email" or "google" |
| `userId` | text | NOT NULL | — | **FK → user.id (CASCADE)** |
| `accessToken` | text | NULLABLE | null | OAuth access token |
| `refreshToken` | text | NULLABLE | null | OAuth refresh token |
| `idToken` | text | NULLABLE | null | OAuth ID token |
| `accessTokenExpiresAt` | timestamp | NULLABLE | null | |
| `refreshTokenExpiresAt` | timestamp | NULLABLE | null | |
| `scope` | text | NULLABLE | null | OAuth scopes |
| `password` | text | NULLABLE | null | Argon2id hash (email provider only) |
| `createdAt` | timestamp | NOT NULL | `now()` | |
| `updatedAt` | timestamp | NOT NULL | `now()` + onUpdate | |

**Indexes**: `account_userId_idx` on `userId`

### 5.3 Verification Table

**File**: `src/server/db/auth-schema.ts:108-122`
**DB table name**: `"verification"`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | text | PK | — | |
| `identifier` | text | NOT NULL | — | Email or other identifier |
| `value` | text | NOT NULL | — | Verification token |
| `expiresAt` | timestamp | NOT NULL | — | Token expiry |
| `createdAt` | timestamp | NOT NULL | `now()` | |
| `updatedAt` | timestamp | NOT NULL | `now()` + onUpdate | |

**Indexes**: `verification_identifier_idx` on `identifier`

### 5.4 Passkey Table

**File**: `src/server/db/auth-schema.ts:124-145`
**DB table name**: `"passkey"`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | text | PK | — | |
| `name` | text | NULLABLE | null | User-friendly name |
| `publicKey` | text | NOT NULL | — | WebAuthn public key |
| `userId` | text | NOT NULL | — | **FK → user.id (CASCADE)** |
| `credentialID` | text | NOT NULL | — | **UNIQUE INDEX** |
| `counter` | integer | NOT NULL | `0` | Signature counter |
| `deviceType` | text | NOT NULL | — | "singleDevice" or "multiDevice" |
| `backedUp` | boolean | NOT NULL | `false` | Whether backed up |
| `transports` | text | NULLABLE | null | USB/NFC/BLE/HTTP |
| `createdAt` | timestamp | NOT NULL | `now()` | |
| `aaguid` | text | NULLABLE | null | Authenticator identifier |

**Indexes**: `passkey_credential_id_idx` (unique) on `credentialID`, `passkey_user_idx` on `userId`

### 5.5 UserIdMapping Table

**File**: `src/server/db/auth-schema.ts:59-63`
**DB table name**: `"user_id_mapping"`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `jobsTextId` | text | PK | — | gaddr-jobs text ID |
| `gaddrUuid` | text | NOT NULL | — | **UNIQUE** — gaddr.com UUID |
| `migratedAt` | timestamp | NOT NULL | `now()` | Migration timestamp |

### 5.6 UsedFreeLimit Table

**File**: `src/server/db/auth-schema.ts:167-174`
**DB table name**: `"used_free_limit"`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `email` | text | PK | — | Normalized email |
| `consumedAt` | timestamp | NOT NULL | `now()` | When free limit was consumed |

**Indexes**: `used_free_limit_email_idx` on `email`

---

## 6. User Table Dependency Tree

### 6.1 Full FK Dependency Map

**49 schema files** import `user` from `auth-schema` and create foreign key references.

**113 total foreign key columns** reference `user.id` across **113 database tables** (including auth tables).

```
user (PK: id)
├── session.userId ──────────────────── CASCADE
├── account.userId ──────────────────── CASCADE
├── passkey.userId ──────────────────── CASCADE
├── adminAiKey.userId ──────────────── CASCADE
├── aiAuditLog.userId ──────────────── SET NULL
├── analyticsEvent.userId ──────────── SET NULL
├── application.userId ─────────────── CASCADE
├── auditLog.userId ────────────────── CASCADE
├── bounty.createdBy ───────────────── CASCADE
├── bountyApplication.userId ───────── CASCADE
├── calUser.userId ─────────────────── CASCADE
├── journalEntry.userId ────────────── CASCADE
├── achievement.userId ─────────────── CASCADE
├── careerGoal.userId ──────────────── CASCADE
├── cofounderListing.userId ────────── CASCADE
├── communityFund.createdBy ────────── CASCADE
├── fundContribution.userId ────────── CASCADE
├── fundPayout.userId ──────────────── CASCADE
├── community.createdBy ────────────── CASCADE
├── communityMember.userId ─────────── CASCADE
├── communityPost.authorId ─────────── CASCADE
├── communityEvent.creatorId ───────── CASCADE
├── communityEventAttendee.userId ──── CASCADE
├── communityPoll.creatorId ────────── CASCADE
├── communityPollVote.userId ───────── CASCADE
├── company.ownerId ────────────────── CASCADE
├── companyFollow.userId ───────────── CASCADE
├── contract.employerId ────────────── CASCADE
├── contract.freelancerId ──────────── CASCADE
├── contributionRecord.userId ──────── CASCADE
├── issuedCredential.holderId ──────── CASCADE
├── creditBalance.userId ───────────── CASCADE
├── creditTransaction.userId ───────── CASCADE
├── cryptoPayment.userId ───────────── CASCADE
├── stripeDispute.userId ───────────── (NO onDelete)
├── paymentRefund.userId ───────────── (NO onDelete)
├── employerVerification.userId ────── CASCADE
├── governanceProposal.authorId ────── CASCADE
├── governanceVote.userId ──────────── CASCADE
├── marketplaceListing.userId ──────── CASCADE
├── interviewTranscript.userId ─────── CASCADE
├── interviewSummary.userId ────────── CASCADE
├── interviewEvidence.userId ───────── CASCADE
├── interviewFeedbackQuality.interviewerId ─ CASCADE
├── interviewKit.createdBy ─────────── CASCADE
├── interviewScorecard.candidateId ─── CASCADE
├── interviewScorecard.interviewerId ─ CASCADE
├── interviewSession.userId ────────── CASCADE
├── invoice.userId ─────────────────── (NO onDelete)
├── meeting.userId ─────────────────── CASCADE
├── mentorProfile.userId ───────────── CASCADE
├── mentorshipSession.mentorId ─────── CASCADE
├── mentorshipSession.menteeId ─────── CASCADE
├── mentorRating.mentorId ──────────── CASCADE
├── mentorRating.menteeId ──────────── CASCADE
├── profiles.id (1:1) ─────────────── CASCADE
├── relationships.userId ───────────── CASCADE
├── relationships.targetId ─────────── CASCADE
├── linkedAccounts.userId ──────────── CASCADE
├── userTopics.userId ──────────────── CASCADE
├── newsletterSubscribers.userId ───── SET NULL
├── userContents.userId ────────────── CASCADE
├── playlists.userId ───────────────── CASCADE
├── playlistMembers.userId ─────────── CASCADE
├── socialAnalytics.userId ─────────── CASCADE
├── youtubeAccounts.userId ─────────── CASCADE
├── contentStreams.userId ───────────── CASCADE
├── uploadJobs.userId ──────────────── CASCADE
├── searchHistories.userId ─────────── CASCADE
├── premiumRollups.userId ──────────── CASCADE
├── dispute.initiatorId ────────────── CASCADE
├── dispute.respondentId ───────────── CASCADE
├── disputeEvidence.submitterId ────── CASCADE
├── disputeMessage.senderId ────────── CASCADE
├── milestoneValidation.reviewedBy ─── SET NULL
├── connection.userId1 ─────────────── CASCADE
├── connection.userId2 ─────────────── CASCADE
├── connectionRequest.fromUserId ───── CASCADE
├── connectionRequest.toUserId ─────── CASCADE
├── notificationPreference.userId ──── CASCADE
├── notification.userId ────────────── CASCADE
├── conversationParticipant.userId ─── CASCADE
├── message.senderId ───────────────── CASCADE
├── outreachUnsubscribe.userId ─────── CASCADE
├── opportunity.createdBy ──────────── SET NULL
├── partnerReward.userId ───────────── CASCADE
├── passport.userId ────────────────── CASCADE
├── passportEmploymentHistory.userId ─ CASCADE
├── passportEducation.userId ───────── CASCADE
├── passportCertifications.userId ──── CASCADE
├── passportReferences.userId ──────── CASCADE
├── passportVolunteering.userId ────── CASCADE
├── passportAssessments.userId ─────── CASCADE
├── passportVerifiedMilestones.userId ─ CASCADE
├── jobSeekerProfile.userId ────────── CASCADE (PK)
├── freelancerProfile.userId ───────── CASCADE (PK)
├── freelancerAvailability.userId ──── CASCADE (PK)
├── businessProfile.userId ─────────── CASCADE (PK)
├── projectRoomMember.userId ───────── CASCADE
├── projectRoomMessage.senderId ────── CASCADE
├── project.clientId ───────────────── CASCADE
├── proposal.freelancerId ──────────── CASCADE
├── project.dispute.raisedBy ───────── CASCADE
├── timeEntry.freelancerId ─────────── CASCADE
├── timeEntry.approvedBy ───────────── (NO onDelete)
├── proofOfContribution.userId ─────── CASCADE
├── pipeline.createdBy ─────────────── CASCADE
├── pipelineCandidate.candidateId ──── CASCADE
├── pipelineCandidate.movedBy ──────── SET NULL
├── shortlist.createdBy ────────────── CASCADE
├── shortlistItem.candidateId ──────── CASCADE
├── shortlistItem.addedBy ──────────── CASCADE
├── referral.referrerId ────────────── CASCADE
├── referral.candidateId ───────────── SET NULL
├── outreach.sentBy ────────────────── CASCADE
├── review.fromUserId ──────────────── CASCADE
├── review.toUserId ────────────────── CASCADE
├── savedJob.userId ────────────────── CASCADE
├── savedSearch.userId ─────────────── CASCADE
├── userReport.reporterId ──────────── CASCADE
├── userTrustScore.userId ──────────── CASCADE
├── verificationBadge.userId ───────── CASCADE
├── disclosurePolicy.userId ────────── CASCADE
├── userSkillEscMapping.userId ─────── CASCADE
├── talentCard.userId ──────────────── CASCADE
├── team.createdBy ─────────────────── CASCADE
├── teamMember.userId ──────────────── CASCADE
├── tokenBalance.userId ────────────── CASCADE (PK)
├── tokenTransaction.userId ────────── CASCADE
├── trustScore.userId ──────────────── CASCADE
├── doubleBlindReview.reviewerId ───── CASCADE
├── doubleBlindReview.revieweeId ───── CASCADE
├── appeal.userId ──────────────────── CASCADE
└── accountDeletionLog.userId ──────── (NO FK CONSTRAINT in DB)
```

### 6.2 onDelete Behavior Summary

| Behavior | Count | Percentage |
|----------|-------|------------|
| `cascade` | ~107 | 94.7% |
| `set null` | 7 | 6.2% |
| Not specified (NO ACTION) | 4 | 3.5% |

**SET NULL columns** (preserve data when user is deleted):
1. `aiAuditLog.userId` — audit trail preserved
2. `analyticsEvent.userId` — analytics preserved
3. `newsletterSubscribers.userId` — newsletter preserved
4. `opportunity.createdBy` — opportunities preserved
5. `pipelineCandidate.movedBy` — CRM history preserved
6. `referral.candidateId` — referral preserved
7. `milestoneValidation.reviewedBy` — validation preserved

### 6.3 Missing onDelete Specifications

**4 columns have NO onDelete specified** (defaults to PostgreSQL `NO ACTION`):

| Table | Column | Risk |
|-------|--------|------|
| `stripe_dispute` | `userId` | Orphaned dispute records |
| `refund` | `userId` | Orphaned refund records |
| `invoice` | `userId` | Orphaned invoices |
| `time_entry` | `approvedBy` | Orphaned approval reference |

Additionally, `account_deletion_log.userId` in `gdpr-schema.ts` has **no FK constraint at all** (just `text("user_id").notNull()`).

---

## 7. Schema Drift & Inconsistencies

### 7.1 Shared-Schema vs Auth-Schema Drift

The `packages/shared-schema/src/auth.ts` defines a **different version** of the user table than `gaddr-jobs/src/server/db/auth-schema.ts`.

| Column | auth-schema.ts (Jobs) | shared-schema (Shared) | Drift? |
|--------|----------------------|----------------------|--------|
| `twoFaVerifiedAt` | Yes | **MISSING** | YES |
| `dateOfBirth` | Yes | **MISSING** | YES |
| `status` | Yes | **MISSING** | YES |
| `deletedAt` | Yes | **MISSING** | YES |
| `bannedAt` | Yes | **MISSING** | YES |
| `banReason` | Yes | **MISSING** | YES |
| `privateSearchMode` | Yes | **MISSING** | YES |
| `blockedEmployers` | Yes (text[]) | **MISSING** | YES |
| `aiAnalysisOptOut` | Yes | **MISSING** | YES |
| `email` index | **MISSING** | Has `user_email_idx` | YES |

**Impact**: If `gaddr.com` uses the shared-schema to query user rows, it will be missing 9 columns that exist in the actual database. The jobs app is the Schema Owner and has the authoritative definition.

### 7.2 Missing Email Index

The main `auth-schema.ts` does **NOT** define an index on the `email` column (despite `email` being marked `.unique()`). The shared-schema has `user_email_idx`. The actual database may have this index from the shared-schema or migration, but the Drizzle schema in the jobs app doesn't declare it.

**Impact**: Drizzle Kit `push` or `generate` might attempt to drop this index.

### 7.3 passkey Table Column Naming

The `passkey` table uses **camelCase column names** (`publicKey`, `credentialID`, `deviceType`, `backedUp`, `transports`, `aaguid`) while all other tables use **snake_case**. This is because Better Auth's passkey plugin manages this table and uses its own naming convention.

### 7.4 Inconsistent FK Naming

Some tables use different naming patterns for user references:
- `userId` (most common)
- `createdBy` (bounty, community, communityFund, etc.)
- `authorId` (communityPost, governanceProposal)
- `creatorId` (communityEvent)
- `employerId` / `freelancerId` (contract)
- `holderId` (issuedCredential)
- `mentorId` / `menteeId` (mentorship)
- `initiatorId` / `respondentId` (dispute)
- `fromUserId` / `toUserId` (review, connection)
- `senderId` (message, projectRoomMessage)
- `referrerId` / `candidateId` (referral)
- `reviewerId` / `revieweeId` (doubleBlindReview)
- `reviewedBy` (milestoneValidation)
- `raisedBy` (project dispute)
- `approvedBy` (timeEntry)

All point to `user.id` but with different semantic names. This is fine for readability but means there's no single "userId" column convention.

---

## 8. Migration Issues

### 8.1 Journal/Snapshot Mismatch

The `drizzle/meta/_journal.json` only tracks **14 entries** (idx 0-13) despite there being **86 SQL files** in the `drizzle/` directory. The journal entries jump from `0012_saved_jobs` (idx 12) directly to `0078_catchup_apply_all_missing` (idx 13).

This means:
- Migrations 0013-0077 and 0079-0085 were likely applied via `drizzle-kit push` or manual SQL
- Drizzle Kit's `migrate` command won't know about these applied migrations
- Running `drizzle-kit generate` may create duplicate migration attempts

### 8.2 Missing Migration Numbers

SQL files with gaps in numbering:
- **0060** — missing (jumps from 0059 to 0061)
- **0073, 0074** — missing (jumps from 0072 to 0075)

### 8.3 Manual Migration Scripts

Three scripts exist outside Drizzle Kit:
- `apply-migrations.js` — Manual SQL runner
- `scripts/migrate-gaddr-data.ts` — Data migration from gaddr.com
- `scripts/migrate-gaddr-users.ts` — User migration

These are one-time scripts that may have been run manually in production.

---

## 9. Circular Import Analysis

**No circular imports detected.** The import graph is strictly hierarchical:

```
schema.ts (barrel)
  └── auth-schema.ts (defines user, session, account, verification, passkey)
        └── imported by 49 other *-schema.ts files (all import { user } from "./auth-schema")

auth/index.ts (Better Auth config)
  ├── imports from schema.ts (barrel)
  ├── imports from auth-schema.ts (direct, in databaseHooks via dynamic import)
  └── imports from db/index.ts (DB client)

db/index.ts
  └── imports from schema.ts (barrel) ← used for drizzle(client, { schema })
```

**Dynamic imports in databaseHooks** (`auth/index.ts:120-122`):
```typescript
const { user: userTable } = await import("@/server/db/auth-schema");
const { db } = await import("@/server/db");
const { eq } = await import("drizzle-orm");
```
These dynamic imports avoid circular dependencies at module load time, which is correct since `auth/index.ts` is imported by `db/schema.ts` (indirectly through the barrel).

---

## 10. Dead Code / Unused Artifacts

### 10.1 Potentially Unused Schema Files

These schema files define tables but have **no FK to user** and appear to be standalone:

| File | Tables | Notes |
|------|--------|-------|
| `endorsement-schema.ts` | endorsement | No user FK |
| `external-job-schema.ts` | externalJob | No user FK |
| `issuer-registry-schema.ts` | issuerRegistry | No user FK |
| `smart-account-schema.ts` | smartAccount | No user FK |
| `university-schema.ts` | university | No user FK |
| `activity-feed-schema.ts` | activityFeed | Has userId but NO FK constraint |

### 10.2 Unused Auth Config File

`auth.config.ts` at the project root is only used for Better Auth CLI schema generation, not for runtime auth.

### 10.3 Backup Files

`backups/user_backup_1784300813041.json` — one-time migration backup, can be archived.

### 10.4 Fix Scripts

Multiple ad-hoc fix scripts in the root:
- `fix-all.js`, `fix-governance.js`, `fix-governance2.js`, `fix-mentorship.js`, `fix-tables.js`, `fix-vote-table.js`

These appear to be one-time data fix scripts from development.

---

## 11. Key File Reference

### Auth Core

| File | Lines | Purpose |
|------|-------|---------|
| `src/server/auth/index.ts` | 178 | Better Auth server config (THE source of truth) |
| `src/lib/auth-client.ts` | 17 | Better Auth React client |
| `src/server/auth/auth-api.ts` | 55 | In-process HTTP caller for Better Auth endpoints |
| `src/server/auth/auth-error.ts` | 18 | Error response parser |
| `src/server/auth/require-session.ts` | 39 | Server-side session guard + 2FA enforcement |
| `src/server/auth/verification-code.ts` | 52 | Email OTP store/verify (Redis) |
| `src/server/auth/password-reset-code.ts` | 59 | Password reset OTP (Redis, includes Better Auth token) |
| `src/server/auth/trigger-verification-email.ts` | 20 | Triggers verification email via API |
| `src/server/auth/rate-limit.ts` | 77 | Redis-based rate limiting (3 rules) |

### Auth Validation

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/constants/auth.ts` | 8 | PASSWORD_MIN_LENGTH=8, AUTH_CODE_TTL=15min, 2FA_TTL=5min |
| `src/lib/validation/auth-schemas.ts` | 37 | Zod schemas for OTP, email, reset password |
| `src/lib/validation/password.ts` | 18 | Password strength validation |
| `src/lib/email/normalize.ts` | 21 | Gmail dot/plus canonicalization |

### Auth API

| File | Lines | Purpose |
|------|-------|---------|
| `src/server/trpc/routers/auth.ts` | 805 | Full auth tRPC router (me, verify, 2FA, delete, export, GDPR) |
| `src/app/api/auth/[...all]/route.ts` | — | Next.js catch-all for Better Auth |

### Schema

| File | Lines | Purpose |
|------|-------|---------|
| `src/server/db/auth-schema.ts` | 174 | User, session, account, verification, passkey, userIdMapping, usedFreeLimit |
| `src/server/db/schema.ts` | 72 | Master barrel export (61 sub-schemas) |
| `src/server/db/index.ts` | 26 | DB client (postgres.js + drizzle) |
| `packages/shared-schema/src/auth.ts` | 104 | Shared auth tables (DRIFTED from main) |

### Auth UI

| File | Lines | Purpose |
|------|-------|---------|
| `src/components/auth/auth-form.tsx` | 798 | SignIn + SignUp forms with 2FA, passkey, Google |
| `src/app/(auth)/login/page.tsx` | 23 | Login page |
| `src/app/(auth)/register/page.tsx` | 17 | Register page |
| `src/app/(auth)/forgot-password/page.tsx` | | Forgot password page |
| `src/app/(auth)/reset-password-code/page.tsx` | 282 | Reset password with OTP page |
| `src/app/(auth)/verify-email/page.tsx` | 164 | Email verification (link) page |
| `src/app/(auth)/verify-email-code/page.tsx` | 152 | Email verification (OTP) page |
| `src/app/(auth)/account-created/page.tsx` | 27 | Account created confirmation |

### Middleware

| File | Lines | Purpose |
|------|-------|---------|
| `src/middleware.ts` | 96 | Route protection (cookie presence check) |

---

## Summary — Critical Facts for Schema Owner

1. **Auth library**: Better Auth v1.5.6 (NOT NextAuth, NOT custom JWT)
2. **Session model**: Database-backed opaque tokens (NOT JWT, NOT refresh tokens)
3. **Password hashing**: Argon2id via `@node-rs/argon2` (Rust native)
4. **User table**: 38 columns, text PK (UUID), with 9 columns from gaddr.com merger
5. **Dependencies**: 113 FK columns across 113 tables reference `user.id`
6. **onDelete**: 95% cascade, 6% set null, 3.5% unspecified
7. **Schema drift**: shared-schema is missing 9 columns vs auth-schema
8. **Migration journal**: Only 14 of 86 migrations tracked (push/paste applied)
9. **No circular imports**: Clean hierarchical import graph
10. **2FA known gap**: Session creation not gated by 2FA verification (documented issue)
