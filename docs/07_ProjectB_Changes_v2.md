# 07 — Project B Change Plan v2

> Comprehensive v2 execution plan for Project B (gaddr-backend-api NestJS backend).
> **Date**: 2026-07-19
> **Supersedes**: `07_ProjectB_Changes.md` (v1)
> **Status**: Active

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [V1 Errata & Decision Reversals](#2-v1-errata--decision-reversals)
3. [Codebase Audit Findings](#3-codebase-audit-findings)
4. [Security Fixes](#4-security-fixes)
5. [Bug Fixes](#5-bug-fixes)
6. [Schema Changes](#6-schema-changes)
7. [Entity Fixes](#7-entity-fixes)
8. [Password Hashing](#8-password-hashing)
9. [Email Normalization](#9-email-normalization)
10. [JWT Enhancements](#10-jwt-enhancements)
11. [Code Quality](#11-code-quality)
12. [Testing Plan](#12-testing-plan)
13. [Rollback Procedures](#13-rollback-procedures)
14. [Risk Assessment](#14-risk-assessment)
15. [Execution Order](#15-execution-order)
16. [Files Changed Summary](#16-files-changed-summary)
17. [Architecture Decision Records](#17-architecture-decision-records)
18. [Open Questions](#18-open-questions)

---

## 1. Executive Summary

### 1.1 Scope

Project B (`E:\gaddr-backend-api`) is a NestJS backend that serves as the **primary API** for a social/content management application. The frontend (`E:\SocialApp`) calls 55+ Project B endpoints directly for authentication, profile, integrations, content management, and analytics. Project B **must remain the identity provider and primary backend** — it cannot be downsized to a "read-only" identity consumer as v1 proposed.

### 1.2 V1 Decision Reversal

V1 proposed removing auth ownership from Project B (deleting 32 files, 14 handler directories). **This is BLOCKED.** The frontend (`E:\SocialApp`) directly calls:
- `POST /auth/access-token` (login)
- `POST /auth/refresh-access-token` (token refresh)
- `POST /auth/logout`
- `POST /account/register`
- `POST /account/email/verify`
- `POST /account/forgot-password`
- `POST /account/reset-password`
- `POST /account/2fa/setup`, `/enable`, `/disable`
- `GET /auth/{platform}/connect`, `/connect-callback`
- `GET /auth/current`
- Plus 40+ additional endpoints for profile, integrations, search, etc.

### 1.3 Effort Estimate

| Category | Files Changed | Estimated Effort |
|----------|--------------|-----------------|
| Security fixes | 5 | 2-3 days |
| Bug fixes (2FA, FK, relations) | 20+ | 3-4 days |
| Entity schema alignment | 8+ | 2-3 days |
| JWT enhancements | 4 | 1-2 days |
| Code quality (console.log, .env) | 30+ | 2-3 days |
| Testing | All handlers | 3-5 days |
| **Total** | **~50 files** | **13-20 days** |

### 1.4 Risk Level

**HIGH** — Changes affect authentication, JWT token generation, entity schema, and 55+ API endpoints. Breaking changes to JWT claims will immediately break the frontend.

---

## 2. V1 Errata & Decision Reversals

### 2.1 Reversed: Auth Removal

| V1 Proposed | V2 Decision | Reason |
|-------------|------------|--------|
| Delete `register/` directory | **KEEP** — Project B owns registration | Frontend calls `POST /account/register` on Project B |
| Delete `reset-password/` | **KEEP** | Frontend calls `POST /account/reset-password` on Project B |
| Delete `forgot-password/` | **KEEP** | Frontend calls `POST /account/forgot-password` on Project B |
| Delete `verify-email/` | **KEEP** | Frontend calls `POST /account/email/verify` on Project B |
| Delete `2fa/setup/` | **KEEP** | Frontend calls `POST /account/2fa/setup` on Project B |
| Delete `2fa/enable/` | **KEEP** | Frontend calls `POST /account/2fa/enable` on Project B |
| Delete `2fa/disable/` | **KEEP** | Frontend calls `POST /account/2fa/disable` on Project B |
| Delete `2fa/verify/` | **KEEP** | Frontend uses 2FA verification flow on Project B |
| Delete `external/google-auth/` | **KEEP** | Frontend calls `GET /auth/google/connect` on Project B |
| Delete `external/facebook-auth/` | **KEEP** | Frontend calls `GET /auth/facebook/connect` on Project B |
| Delete `user.entity.ts` | **KEEP** — but REWRITE | Project B is canonical identity provider |
| Delete `email.service.ts` | **KEEP** | Project B sends emails for its own features |
| Delete `better-auth.service.ts` | **REMOVE** | Better Auth is not used as primary auth |

### 2.2 Reversed: JWT Claim Removals

| V1 Proposed | V2 Decision | Reason |
|-------------|------------|--------|
| Remove `securityStamp` from JWT | **KEEP** — mandatory | Account guard validates stamp against Redis cache; frontend reads it |
| Remove `concurrencyStamp` from JWT | **KEEP** — mandatory | Account guard uses for token refresh detection; frontend reads it |
| Remove `UserType` claim | **KEEP** — mandatory | Frontend `JwtPayload` type requires `ClaimTypes.UserType`; guard checks it |
| Remove `UserName` claim | **KEEP** | Frontend `JwtPayload` type requires `ClaimTypes.UserName` |
| Remove `ProfileImage` claim | **KEEP** | Frontend `JwtPayload` type requires `ClaimTypes.ProfileImage` |

### 2.3 Correct from V1 (Retained)

| V1 Proposal | V2 Status |
|-------------|-----------|
| Remove Better Auth fallback from HttpContext middleware | **ADOPTED** — remove raw SQL fallback |
| Add FK constraints to `identity.users` | **ADOPTED** |
| Add soft delete support (`status`, `deletedAt`) | **ADOPTED** |
| Adapt login handler column names | **ADOPTED** — with corrections |

---

## 3. Codebase Audit Findings

### 3.1 Entities (38 total in `src/domain/entities/`)

**Entities WITH proper relational decorators (7):**
- `userContent.entity.ts` — `@ManyToOne(() => User)` with `@JoinColumn`
- `userFollow.entity.ts` — `@ManyToOne(() => User)` × 2
- `userTopic.entity.ts` — `@ManyToOne(() => User)` + `@ManyToOne(() => Topic)`
- `playlist.entity.ts` — `@ManyToOne(() => User)` + `@OneToMany` relations
- `playlistMember.entity.ts` — `@ManyToOne(() => User)` + `@ManyToOne(() => Playlist)`
- `manualProfile.entity.ts` — `@ManyToOne(() => User)` with `@JoinColumn`
- `userPreference.entity.ts` — `@OneToOne(() => User)` with `@JoinColumn`

**Entities MISSING relational decorators (14+):**

| Entity | Missing Column(s) | Missing Decorator |
|--------|-------------------|-------------------|
| `linkedAccount.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` |
| `searchHistroy.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` |
| `publishJob.entity.ts` | `userId`, `linkedAccountId` | `@ManyToOne(() => User)` + `@ManyToOne(() => LinkedAccount)` |
| `youtubeAccount.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` |
| `analyticsEvent.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` |
| `premiumRollup.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` |
| `notification.entity.ts` | `notifyId` | `@ManyToOne(() => User)` + `@JoinColumn` |
| `rateLimit.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` (optional) |
| `rateLimitLog.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` (optional) |
| `dataProtectionKey.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` (optional) |
| `userLogin.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` |
| `userRole.entity.ts` | `userId`, `roleId` | `@ManyToOne(() => User)` + `@ManyToOne(() => Role)` |
| `userClaim.entity.ts` | `userId` | `@ManyToOne(() => User)` + `@JoinColumn` |
| `roleClaim.entity.ts` | `roleId` | Has `@ManyToOne(() => Role)` but inverse side is typed as `Role[]` instead of `Role` |

### 3.2 console.log Statements (100+ instances)

Found `console.log` in **30+ production source files** including:
- `src/core/passport/onboarding.guard.ts` (7 instances)
- `src/infrastructure/repositories/user.repository.ts` (2 instances)
- `src/infrastructure/repositories/contentStream.repository.ts` (1)
- `src/infrastructure/repositories/linkedAccount.repository.ts` (2)
- `src/infrastructure/repositories/userContent.repository.ts` (2)
- `src/features/auth/external/google-auth/google-auth.handler.ts` (14+)
- `src/features/auth/external/google-auth/google-auth.endpoint.ts` (8+)
- `src/features/integrations/linkedin/connect/linkedin-connect.handler.ts` (7)
- `src/features/integrations/facebook/connect/facebook-connect.handler.ts` (11)
- `src/features/integrations/twitter/connect/twitter-connect.handler.ts` (9)
- `src/features/integrations/tiktok/connect/tiktok-connect.handler.ts` (4)
- `src/features/integrations/pinterest/connect/pinterest-connect.handler.ts` (8)
- `src/features/integrations/youtube/connect/youtube-connect.handler.ts` (3)
- `src/features/integrations/youtube/sync/enable-youtube-sync.handler.ts` (2)
- `src/features/integrations/youtube/import/youtube-import.handler.ts` (1)
- `src/features/integrations/youtube/import/youtube-import.endpoint.ts` (1)
- `src/features/integrations/pinterest/import/pinterest-import.handler.ts` (3)
- `src/features/integrations/twitter/import/twitter-import.handler.ts` (5)
- `src/features/user/update/profile-image/update-profile-image.handler.ts` (2)
- `src/features/user/update/profile-image/update-profile-image.endpoint.ts` (2)
- `src/infrastructure/services/pinterest/pinterest-import.service.ts` (1)
- `src/infrastructure/background/listeners/email.listener.ts` (1)
- `src/core/utils/redirectUrl.util.ts` (2)
- `src/core/utils/permissions.util.ts` (1)

**Severity**: MEDIUM — console.log leaks internal state to stdout in production. Some log sensitive data (OAuth tokens at `tiktok-connect.handler.ts:121`, API keys at `linkedin-connect.handler.ts:298`).

### 3.3 Real API Keys in `.env.development`

**CRITICAL SEVERITY** — The following production credentials are committed in plaintext:

| Service | Key Present | Line |
|---------|------------|------|
| Facebook | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET` | 43-44 |
| Instagram | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` | 48-49 |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | 52-53 |
| Twitter/X | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_bearer` | 58-61 |
| Pinterest | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | 63-64 |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | 67-68 |
| TikTok | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET` | 71-72 |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | 77-79 |
| Brevo/SMTP | `SMTP_USER`, `SMTP_PASSWORD`, `BREVO_API_KEY` | 84-86 |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | 88-89 |
| Discord | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | 92-93 |
| Cloudflare R2 | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | 103-105 |
| Neon DB | `DATABASE_URL` (full connection string with password) | 99 |
| Better Auth | `BETTER_AUTH_SECRET` | 109 |

### 3.4 Weak JWT Secret

```
JWT_SECRET=super-secret-key
```

This is a **trivially guessable** secret. Any attacker can forge JWTs for any user.

### 3.5 Schema Mismatches

**BaseEntity column names** (`src/domain/baseEntity.ts`):
- Current: `createdOn`, `lastModifiedOn`
- Project A convention: `createdAt`, `updatedAt`

**User entity** (`src/domain/entities/identity/user.entity.ts`) missing Project A columns:
- `name` (composed full name)
- `emailVerified` (current: `emailConfirmed`)
- `image` (currently derived from `biometrics.profileImageUrl`)
- `role` (currently derived from `userRoles` join)
- `isAdmin` (currently: `type` enum)
- `twoFaVerifiedAt`
- `isVerified`
- `stripeCustomerId`, `stripePriceId`, `stripeSubscriptionId`
- `subscriptionStatus`, `subscriptionPlan`
- `jobPostLimit`, `activeJobPostCount`
- `privateSearchMode`, `blockedEmployers`, `aiAnalysisOptOut`
- `walletAddress`
- `status` (replaces `isActive` boolean)
- `deletedAt`
- `bannedAt`, `banReason`
- `dateOfBirth`, `sourceApp`

### 3.6 HttpContext Middleware Bug

`src/core/middlewares/httpContext.middleware.ts:106-117` — The Better Auth fallback queries `u.name` which **does not exist** on the current User entity. The column is `userName`. This raw SQL query would fail at runtime with a PostgreSQL column-not-found error.

---

## 4. Security Fixes

### 4.1 JWT Secret Replacement

**File**: `.env.development` (and all environment `.env` files)

**Current**:
```
JWT_SECRET=super-secret-key
```

**Required**: Generate a cryptographically random 256-bit (32-byte) secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Action**: Replace `JWT_SECRET` in all `.env.*` files. After replacement, all existing tokens become invalid — users must re-login.

**Files changed**:
- `.env.development`
- `.env.production` (if exists)
- `.env.staging` (if exists)
- `src/configs.ts` — Add minimum length validation: `JWT_SECRET: Joi.string().min(32).required()`

### 4.2 API Key Remediation

**File**: `.env.development`

**Action**: Move all API keys to a secrets manager or environment variable injection at deploy time. `.env.development` must contain only placeholder values:

```
FACEBOOK_CLIENT_ID=your_facebook_client_id
FACEBOOK_CLIENT_SECRET=your_facebook_client_secret
# ... etc for all services
```

**Immediate**: Rotate ALL exposed credentials:
- Facebook App Secret
- Instagram Client Secret
- YouTube Client Secret
- Twitter/X Client Secret + Bearer Token
- Pinterest Client Secret
- LinkedIn Client Secret
- TikTok Client Secret
- Cloudinary API Secret
- Brevo API Key + SMTP Password
- GitHub Client Secret
- Discord Client Secret
- Cloudflare R2 Secret Access Key
- Neon DB password
- Better Auth Secret

**Add to `.gitignore`**:
```
.env.development
.env.production
.env.staging
.env.local
```

**Create `.env.example`** with placeholder values only.

### 4.3 console.log Removal

**Scope**: All 100+ `console.log` statements across 30+ files.

**Action**: Replace with `logger` (Winston) calls where logging is intentional. Delete purely debug statements.

**Priority files** (log sensitive data — fix first):
- `src/features/integrations/tiktok/connect/tiktok-connect.handler.ts:121` — logs OAuth access token
- `src/features/integrations/linkedin/connect/linkedin-connect.handler.ts:298` — logs user data JSON
- `src/features/integrations/twitter/connect/twitter-connect.handler.ts:211` — logs token response
- `src/features/integrations/pinterest/connect/pinterest-connect.handler.ts:254` — logs access token response

**Full file list** — see [Section 11.1](#111-consolelog-removal清单).

### 4.4 Rate Limiting on Auth Endpoints

**Current state**: No rate limiting on login, registration, password reset, or 2FA endpoints.

**Action**: Add `@Throttle()` decorators (using `@nestjs/throttler`) to:
- `POST /auth/access-token` — 5 attempts / 15 min per IP
- `POST /auth/refresh-access-token` — 30 / 15 min per IP
- `POST /account/register` — 3 / hour per IP
- `POST /account/forgot-password` — 3 / hour per email
- `POST /account/2fa/verify` — 5 / 5 min per user
- `POST /account/2fa/enable` — 3 / hour per user
- `POST /account/reset-password` — 5 / hour per email

### 4.5 Turnstile Integration Check

**Current state**: `.env.development` has Turnstile keys. Frontend sends `x-turnstile-token` header on login. Backend `login.endpoint.ts` does NOT validate the Turnstile token.

**Action**: Add Turnstile server-side verification in `login.handler.ts` and `register.handler.ts`:
```typescript
const turnstileValid = await verifyTurnstile(token, configs.turnstile.secretKey);
if (!turnstileValid) {
  throw new BadRequestException('CAPTCHA verification failed.');
}
```

---

## 5. Bug Fixes

### 5.1 2FA Verify Handler — Inverted Logic BUG

**File**: `src/features/auth/2fa/verify/2fa-verify.handler.ts:78`

**Current (BROKEN)**:
```typescript
if (user.twoFactorEnabled) {
  throw new ApplicationException(''); // BUG: Blocks when 2FA IS enabled
}
```

**Problem**: The verify endpoint is called AFTER login when `twoFactorEnabled === true`. The handler throws an error when 2FA IS enabled, which is the exact opposite of the intended behavior. Users with 2FA enabled can never complete verification.

**Fix**:
```typescript
if (!user.twoFactorEnabled) {
  throw new ApplicationException('Two-factor authentication is not enabled for this account.');
}
```

**Also fix**: Empty error message `''` — replace with user-friendly message.

### 5.2 2FA Enable Handler — Empty Error Message

**File**: `src/features/auth/2fa/enable/2fa-enable.handler.ts:61`

**Current**:
```typescript
if (user.twoFactorEnabled) {
  throw new ApplicationException(''); // Empty message
}
```

**Fix**: The logic here is correct (can't enable if already enabled), but the message is empty:
```typescript
if (user.twoFactorEnabled) {
  throw new ApplicationException('Two-factor authentication is already enabled.');
}
```

### 5.3 2FA Setup Handler — Empty Error Message

**File**: `src/features/auth/2fa/setup/2fa-setup.handler.ts:36`

**Current**:
```typescript
if (user.twoFactorEnabled) {
  throw new ApplicationException(''); // Empty message
}
```

**Fix**:
```typescript
if (user.twoFactorEnabled) {
  throw new ApplicationException('Two-factor authentication is already enabled. Disable it first to set up again.');
}
```

### 5.4 RoleClaim Entity — Inverse Relation Type

**File**: `src/domain/entities/identity/roleClaim.entity.ts:20`

**Current**:
```typescript
@ManyToOne(() => Role, (role) => role.roleClaims)
role!: Role[]; // BUG: Should be Role, not Role[]
```

**Fix**:
```typescript
@ManyToOne(() => Role, (role) => role.roleClaims)
role!: Role;
```

### 5.5 HttpContext Middleware — Broken Raw SQL

**File**: `src/core/middlewares/httpContext.middleware.ts:110`

**Current**:
```sql
SELECT u.id, u.email, u.name, u."securityStamp", u."concurrencyStamp"
FROM identity.users u
WHERE u.id = $1
```

**Problem**: Column `u.name` does not exist in the `identity.users` table. The column is `userName`.

**Fix**: After removing the Better Auth fallback entirely (per this plan), this bug becomes moot. If the fallback is retained for any reason, change `u.name` to `u."userName"`.

### 5.6 Onboarding Guard — Debug Console.logs

**File**: `src/core/passport/onboarding.guard.ts`

**Current**: 7 `console.log` statements that dump user claims, Redis keys, and account data to stdout.

**Fix**: Remove all console.log statements. Replace with `logger.debug()` if the logging is intentional.

### 5.7 Login Handler — Unused EmailService Injection

**File**: `src/features/auth/login/login.handler.ts:68`

**Current**:
```typescript
@Inject(_const.IEMAIL_SERVICE)
private readonly emailService: IEmailService,
```

The `emailService` is injected but only used in the commented-out `sendWelcomeEmail` method (lines 138-140). The `sendWelcomeEmail` method exists at line 193 but is never called.

**Fix**: Remove the `emailService` injection and the dead `sendWelcomeEmail` method.

---

## 6. Schema Changes

### 6.1 User Entity — Add Missing Columns

**File**: `src/domain/entities/identity/user.entity.ts`

**Rationale**: Project B is the canonical identity provider. The User entity must match the actual database schema.

**Columns to ADD** (not currently in entity):

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `name` | `string` | — | Full display name (composed or stored) |
| `emailVerified` | `boolean` | `false` | Replaces `emailConfirmed` |
| `image` | `string`, nullable | `null` | Profile image URL (replaces biometrics fallback) |
| `role` | `string`, nullable | `null` | User role text |
| `isAdmin` | `boolean` | `false` | Admin flag |
| `twoFaVerifiedAt` | `timestamp`, nullable | `null` | When 2FA was last verified |
| `isVerified` | `boolean` | `false` | Verification status |
| `stripeCustomerId` | `string`, nullable | `null` | Stripe customer |
| `stripePriceId` | `string`, nullable | `null` | Stripe price |
| `stripeSubscriptionId` | `string`, nullable | `null` | Stripe subscription |
| `subscriptionStatus` | `string` | `'none'` | Subscription status |
| `subscriptionPlan` | `string` | `'free'` | Subscription plan |
| `jobPostLimit` | `number` | `1` | Job post limit |
| `activeJobPostCount` | `number` | `0` | Active job posts |
| `privateSearchMode` | `boolean` | `false` | Privacy setting |
| `blockedEmployers` | `simple-array`, nullable | `null` | Blocked employers |
| `aiAnalysisOptOut` | `boolean` | `false` | AI opt-out |
| `walletAddress` | `string`, nullable | `null` | Crypto wallet |
| `dateOfBirth` | `timestamp`, nullable | `null` | DOB |
| `sourceApp` | `string`, nullable | `'jobs'` | Source app |
| `status` | `string`, nullable | `'active'` | Account status |
| `deletedAt` | `timestamp`, nullable | `null` | Soft delete |
| `bannedAt` | `timestamp`, nullable | `null` | Ban timestamp |
| `banReason` | `string`, nullable | `null` | Ban reason |

**Columns to KEEP but RENAME**:

| Current | Target | Migration |
|---------|--------|-----------|
| `emailConfirmed` | `emailVerified` | `ALTER TABLE identity.users RENAME COLUMN "emailConfirmed" TO "emailVerified"` |
| `isActive` | (remove — use `status`) | `UPDATE identity.users SET "status" = CASE WHEN "isActive" THEN 'active' ELSE 'inactive' END; ALTER TABLE identity.users DROP COLUMN "isActive"` |
| `isLockedOut` | (remove — use `bannedAt`) | `UPDATE identity.users SET "bannedAt" = CASE WHEN "isLockedOut" THEN NOW() END; ALTER TABLE identity.users DROP COLUMN "isLockedOut"` |
| `registeredOn` | (keep, mapped to `createdAt` in base entity) | No DB change needed — map in code |

**Columns to KEEP (legacy, still used)**:

| Column | Reason |
|--------|--------|
| `securityStamp` | Account guard validates against Redis; JWT claim |
| `concurrencyStamp` | Account guard validates token refresh; regenerated on every update |
| `passwordHash` | Login handler calls `checkPasswordAsync()` which does `bcrypt.compare` |
| `twoFactorSecret` | 2FA verify handler uses `speakeasy.totp.verify()` with this |
| `isLockedOut` | Login handler checks this — keep until `bannedAt` migration is complete |
| `isActive` | Login handler checks this — keep until `status` migration is complete |

**CRITICAL**: Do NOT remove `securityStamp`, `concurrencyStamp`, or `passwordHash` from the entity. They are actively used by:
- `account.guard.ts` — reads stamps from JWT and Redis
- `refresh-token.handler.ts:106` — validates securityStamp
- `user.repository.ts:429` — `bcrypt.compare(password, user.passwordHash!)`
- `token.service.ts:93-94` — includes stamps in JWT claims

### 6.2 BaseEntity — Add Alias Columns

**File**: `src/domain/baseEntity.ts`

Add column aliases so queries can use either `createdAt` or `createdOn`:

```typescript
@Column({ type: 'timestamp', nullable: true })
createdAt?: Date; // Alias for createdOn

@Column({ type: 'timestamp', nullable: true })
updatedAt?: Date; // Alias for lastModifiedOn
```

Or, if the DB columns are actually named `createdAt`/`updatedAt`, rename the BaseEntity columns:
```typescript
@CreateDateColumn({ name: 'createdAt' })
createdAt: Date;

@UpdateDateColumn({ name: 'updatedAt', nullable: true })
updatedAt?: Date;
```

**Decision needed**: Verify actual database column names before implementing.

### 6.3 Database Migration

Create migration `XXXXXX-AlignUserSchemaWithProjectA.ts`:

```typescript
// Phase 1: Add new columns (non-breaking)
export class AlignUserSchema1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add missing columns
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "name" varchar`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "emailVerified" boolean DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "image" varchar`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "role" varchar`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "isAdmin" boolean DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "twoFaVerifiedAt" timestamp`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "isVerified" boolean DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "stripeCustomerId" varchar`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "stripePriceId" varchar`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "stripeSubscriptionId" varchar`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "subscriptionStatus" varchar DEFAULT 'none'`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "subscriptionPlan" varchar DEFAULT 'free'`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "jobPostLimit" integer DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "activeJobPostCount" integer DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "privateSearchMode" boolean DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "blockedEmployers" text[]`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "aiAnalysisOptOut" boolean DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "walletAddress" varchar`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "dateOfBirth" timestamp`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "sourceApp" varchar DEFAULT 'jobs'`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "status" varchar DEFAULT 'active'`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "deletedAt" timestamp`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "bannedAt" timestamp`);
    await queryRunner.query(`ALTER TABLE "identity"."users" ADD COLUMN "banReason" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all added columns
  }
}

// Phase 2: Migrate data (non-breaking)
export class MigrateUserData1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Sync emailConfirmed -> emailVerified
    await queryRunner.query(`
      UPDATE "identity"."users"
      SET "emailVerified" = "emailConfirmed"
      WHERE "emailVerified" IS NULL OR "emailVerified" != "emailConfirmed"
    `);

    // Sync isActive -> status
    await queryRunner.query(`
      UPDATE "identity"."users"
      SET "status" = CASE WHEN "isActive" THEN 'active' ELSE 'inactive' END
      WHERE "status" IS NULL
    `);

    // Sync isLockedOut -> bannedAt
    await queryRunner.query(`
      UPDATE "identity"."users"
      SET "bannedAt" = NOW()
      WHERE "isLockedOut" = true AND "bannedAt" IS NULL
    `);

    // Populate `name` from firstName + lastName
    await queryRunner.query(`
      UPDATE "identity"."users"
      SET "name" = TRIM(COALESCE("firstName", '') || ' ' || COALESCE("lastName", ''))
      WHERE "name" IS NULL
    `);

    // Populate `image` from biometrics
    await queryRunner.query(`
      UPDATE "identity"."users" u
      SET "image" = COALESCE(b."profileImageUrl", b."defaultProfileImageUrl")
      FROM "identity"."userBiometrics" b
      WHERE b."userId" = u.id AND u."image" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op: data migration is idempotent
  }
}
```

---

## 7. Entity Fixes

### 7.1 Add Missing FK/Relational Decorators

**Entity: `linkedAccount.entity.ts`**

Add imports and decorators:
```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

// Inside class:
@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `searchHistroy.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `publishJob.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';
import { LinkedAccount } from './linkedAccount.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'userId' })
user: User;

@ManyToOne(() => LinkedAccount, { eager: false, onDelete: 'SET NULL', nullable: true })
@JoinColumn({ name: 'linkedAccountId' })
linkedAccount: LinkedAccount;
```

**Entity: `youtubeAccount.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `analyticsEvent.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'SET NULL', nullable: true })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `premiumRollup.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `notification.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'notifyId' })
notifyUser: User;
```

**Entity: `rateLimit.entity.ts`** (optional FK — userId may be null)

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'SET NULL', nullable: true })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `rateLimitLog.entity.ts`** (optional FK)

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'SET NULL', nullable: true })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `dataProtectionKey.entity.ts`** (optional FK)

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './identity/user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE', nullable: true })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `userLogin.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `userRole.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Role } from './role.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'userId' })
user: User;

@ManyToOne(() => Role, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'roleId' })
role: Role;
```

**Entity: `userClaim.entity.ts`**

```typescript
import { ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
@JoinColumn({ name: 'userId' })
user: User;
```

**Entity: `roleClaim.entity.ts`** — Fix inverse type:

```typescript
// Change from:
@ManyToOne(() => Role, (role) => role.roleClaims)
role!: Role[];

// To:
@ManyToOne(() => Role, (role) => role.roleClaims)
@JoinColumn({ name: 'roleId' })
role!: Role;
```

### 7.2 FK Constraint Migration

Create migration `XXXXXX-AddFKConstraints.ts`:

```typescript
export class AddFKConstraints1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const fkStatements = [
      `ALTER TABLE "linkedAccounts" ADD CONSTRAINT "FK_linkedAccounts_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "searchHistories" ADD CONSTRAINT "FK_searchHistories_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "publish_jobs" ADD CONSTRAINT "FK_publishJobs_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "publish_jobs" ADD CONSTRAINT "FK_publishJobs_linkedAccountId" FOREIGN KEY ("linkedAccountId") REFERENCES "linkedAccounts"("id") ON DELETE SET NULL`,
      `ALTER TABLE "youtube_accounts" ADD CONSTRAINT "FK_youtubeAccounts_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "analytics"."analyticsEvents" ADD CONSTRAINT "FK_analyticsEvents_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE SET NULL`,
      `ALTER TABLE "analytics"."premiumRollups" ADD CONSTRAINT "FK_premiumRollups_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "notification"."notifications" ADD CONSTRAINT "FK_notifications_notifyId" FOREIGN KEY ("notifyId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "rateLimits" ADD CONSTRAINT "FK_rateLimits_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE SET NULL`,
      `ALTER TABLE "rateLimitLogs" ADD CONSTRAINT "FK_rateLimitLogs_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE SET NULL`,
      `ALTER TABLE "dataProtectionKeys" ADD CONSTRAINT "FK_dataProtectionKeys_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "identity"."userLogins" ADD CONSTRAINT "FK_userLogins_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "identity"."userRoles" ADD CONSTRAINT "FK_userRoles_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
      `ALTER TABLE "identity"."userRoles" ADD CONSTRAINT "FK_userRoles_roleId" FOREIGN KEY ("roleId") REFERENCES "identity"."roles"("id") ON DELETE CASCADE`,
      `ALTER TABLE "identity"."userClaims" ADD CONSTRAINT "FK_userClaims_userId" FOREIGN KEY ("userId") REFERENCES "identity"."users"("id") ON DELETE CASCADE`,
    ];

    for (const sql of fkStatements) {
      await queryRunner.query(sql);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all FK constraints
  }
}
```

---

## 8. Password Hashing

### 8.1 Current State

The login handler uses `bcrypt.compare` via `user.repository.ts:429`:
```typescript
public async checkPasswordAsync(user: User, password: string): Promise<boolean> {
  return await bcrypt.compare(password, user.passwordHash!);
}
```

Registration hashes with `bcrypt.hash(password, 10)` at `user.repository.ts:79`.

### 8.2 Dual-Hash Support (Argon2id + bcrypt)

If migrating to Argon2id, implement a dual-hash verification strategy:

**File**: `src/infrastructure/repositories/user.repository.ts`

```typescript
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

public async checkPasswordAsync(user: User, password: string): Promise<boolean> {
  if (!user.passwordHash) return false;

  // Detect hash format
  if (user.passwordHash.startsWith('$argon2')) {
    return argon2.verify(user.passwordHash, password);
  }

  // Legacy bcrypt hash
  const isValid = await bcrypt.compare(password, user.passwordHash);

  // Auto-upgrade: rehash with argon2id on successful bcrypt login
  if (isValid) {
    user.passwordHash = await argon2.hash(password);
    await this.userContext.save(user);
  }

  return isValid;
}
```

**New hash on registration**:
```typescript
import * as argon2 from 'argon2';

// In createAsync:
if (password) {
  user.passwordHash = await argon2.hash(password);
}
```

**Dependencies**: Add `argon2` to `package.json`.

---

## 9. Email Normalization

### 9.1 Current State

Multiple normalization approaches are used inconsistently:

| Location | Method | Issue |
|----------|--------|-------|
| `user.entity.ts:145` constructor | `email?.toUpperCase()` → `normalizedEmail` | Sets on construction only |
| `login.handler.ts:75` | `stringUtil.normalizeEmail()` | Used before lookup |
| `forgot-password.handler.ts:67` | `stringUtil.normalizeEmail()` | Used before lookup |
| `user.repository.ts:164` | `email?.toUpperCase()` → `normalizedEmail` | Manual normalization |
| `user.repository.ts:472` | `email?.toUpperCase()` → `normalizedEmail` | Duplicated |

### 9.2 Standardization

**Centralize** all email normalization into a single utility function:

**File**: `src/core/utils/string.util.ts`

```typescript
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

**Remove** `normalizedEmail` column usage. Since `email` column has a unique constraint, query directly:

```typescript
// Before:
const normalizedEmail = email?.toUpperCase();
const user = await this.userContext.findOne({ where: { normalizedEmail } });

// After:
const normalizedEmail = normalizeEmail(email);
const user = await this.userContext.findOne({ where: { email: normalizedEmail } });
```

**Migration**: If `normalizedEmail` column exists in DB:
```sql
UPDATE identity.users SET "email" = LOWER("email");
UPDATE identity.users SET "normalizedEmail" = LOWER("email");
-- Then drop normalizedEmail column after all code references are removed
```

---

## 10. JWT Enhancements

### 10.1 Preserve Required Claims

**File**: `src/core/globals.ts`

The following claims MUST be preserved for frontend compatibility:

| Claim | URI | Frontend Usage |
|-------|-----|---------------|
| `UserId` | `http://gaddr.com/claims/sub` | Primary user identifier |
| `Email` | `http://gaddr.com/claims/email` | Display, API calls |
| `UserName` | `http://gaddr.com/claims/username` | Display, username lookup |
| `GivenName` | `http://gaddr.com/claims/givenname` | Display (first name) |
| `FamilyName` | `http://gaddr.com/claims/familyname` | Display (last name) |
| `FullName` | `http://gaddr.com/claims/fullname` | Display |
| `ProfileImage` | `http://gaddr.com/claims/profile-picture` | Avatar display |
| `SecurityStamp` | `http://gaddr.com/claims/security-stamp` | Account guard validation |
| `ConcurrencyStamp` | `http://gaddr.com/claims/concurrency-stamp` | Account guard refresh detection |
| `UserType` | `http://gaddr.com/claims/usertype` | Admin/User role checks |
| `TwoFARequired` | `http://gaddr.com/claims/2fa-required` | 2FA flow gating |
| `Roles` | `http://gaddr.com/claims/roles` | Role-based access |
| `Permission` | `permission` | Permission-based access |
| `onboardingStep` | `onboardingStep` | Onboarding flow state |

### 10.2 Token Service Rewrite

**File**: `src/infrastructure/services/token.service.ts`

**Current `getClaimsAsync` method** (line 79-106) — Map to updated entity columns:

```typescript
private async getClaimsAsync(user: User): Promise<any> {
  const roles = await this.roleRepository.getByUserAsync(user);
  const roleClaims = roles.map((role) => role.name);
  const permissionClaims = roles.flatMap((role) =>
    role.roleClaims.map((claim) => claim.claimValue),
  );

  const claims = {
    [Globals.ClaimTypes.UserId]: user.id,
    [Globals.ClaimTypes.Email]: user.email,
    [Globals.ClaimTypes.UserName]: user.userName,        // KEEP — frontend requires
    [Globals.ClaimTypes.GivenName]: user.firstName,
    [Globals.ClaimTypes.FamilyName]: user.lastName,
    [Globals.ClaimTypes.SecurityStamp]: user.securityStamp,   // KEEP — account guard
    [Globals.ClaimTypes.ConcurrencyStamp]: user.concurrencyStamp, // KEEP — account guard
    [Globals.ClaimTypes.ProfileImage]:
      user.image ||                                          // NEW — direct column
      user.biometrics?.profileImageUrl ||
      user.biometrics?.defaultProfileImageUrl ||
      null,
    [Globals.ClaimTypes.FullName]: user.name ||              // NEW — use `name` if available
      `${user.lastName} ${user.firstName}`,
    [Globals.ClaimTypes.UserType]: user.isAdmin ? 'Admin' : 'User', // NEW — from boolean
    onboardingStep: user.onboardingStep,
    [Globals.ClaimTypes.Roles]: roleClaims,
    [Globals.ClaimTypes.Permission]: permissionClaims,
  };
  return claims;
}
```

**Current `generate2FAJwt` method** (line 21-46) — Same adaptation:

```typescript
public generate2FAJwt(user: User, ipAddress: string, userAgent: string, deviceId: string): string {
  const claims = {
    ['device-id']: deviceId,
    ['ip-address']: ipAddress,
    ['user-agent']: userAgent,
    [Globals.ClaimTypes.UserId]: user.id,
    [Globals.ClaimTypes.Email]: user.email,
    [Globals.ClaimTypes.TwoFARequired]: true,
    [Globals.ClaimTypes.UserType]: user.isAdmin ? 'Admin' : 'User',
    [Globals.ClaimTypes.UserName]: user.userName,
    [Globals.ClaimTypes.GivenName]: user.firstName,
    [Globals.ClaimTypes.FamilyName]: user.lastName,
    [Globals.ClaimTypes.ProfileImage]:
      user.image || user.biometrics?.profileImageUrl || null,
    [Globals.ClaimTypes.FullName]: user.name || `${user.lastName} ${user.firstName}`,
  };
  return this.generateEncryptedToken(claims, '5m');
}
```

### 10.3 Account Guard Adaptation

**File**: `src/core/passport/account.guard.ts`

The guard currently validates `securityStamp` and `concurrencyStamp` against Redis cache. This mechanism MUST be preserved but adapted:

**Current** (lines 53-78): Reads stamps from JWT, compares to Redis.

**Adaptation**: Keep the stamp comparison logic. Change `UserType` check to work with the new `isAdmin` boolean:

```typescript
// Line 80-88: Current UserType check
if (type && type != undefined) {
  const userType = claimsPrinciple[Globals.ClaimTypes.UserType] as UserType;
  if (userType !== type) {
    throw new ForbiddenException('...');
  }
}
```

This still works because the token service maps `user.isAdmin ? 'Admin' : 'User'` to the `UserType` claim. No change needed in the guard itself.

### 10.4 Refresh Token Handler Adaptation

**File**: `src/features/auth/refresh-token/refresh-token.handler.ts:106`

**Current**:
```typescript
if (user.securityStamp !== HttpContext.user[Globals.ClaimTypes.SecurityStamp]) {
```

**No change needed** — this continues to work because `securityStamp` is still in the entity and JWT.

---

## 11. Code Quality

### 11.1 console.log Removal Checklist

**Priority 1 — Logs sensitive data (rotate credentials first):**

| File | Line(s) | Data Logged | Action |
|------|---------|-------------|--------|
| `tiktok-connect.handler.ts` | 121, 209, 316 | Access token, client IDs, user data | DELETE |
| `linkedin-connect.handler.ts` | 276, 298 | Org error status, user info JSON | DELETE |
| `twitter-connect.handler.ts` | 158, 198-199, 211, 249, 252 | Token value, client IDs, token response, user data | DELETE |
| `pinterest-connect.handler.ts` | 127-128, 254, 276, 279 | User data, access token response | DELETE |
| `facebook-connect.handler.ts` | 92, 94, 210, 221, 283 | State, tokens, user data | DELETE |
| `google-auth.handler.ts` | 110-113, 117, 152, 264-281 | OAuth state, stored keys | DELETE |
| `google-auth.endpoint.ts` | 42-48, 61-62, 74, 104-109 | Headers, configs, state, redirect_uri | DELETE |
| `email.listener.ts` | 36 | SMTP Brevo config (includes API key reference) | DELETE |
| `user.repository.ts` | 812-813 | Biometrics data | DELETE |

**Priority 2 — Debug statements (replace with logger.debug or delete):**

| File | Line(s) | Action |
|------|---------|--------|
| `onboarding.guard.ts` | 19-20, 29, 38, 46-48 | Replace with `logger.debug` |
| `redirectUrl.util.ts` | 18, 26 | Replace with `logger.debug` |
| `permissions.util.ts` | 37 | Replace with `logger.debug` |
| `contentStream.repository.ts` | 86 | Replace with `logger.debug` |
| `linkedAccount.repository.ts` | 22, 88 | Replace with `logger.debug` |
| `userContent.repository.ts` | 176, 233 | Replace with `logger.debug` |
| `update-profile-image.handler.ts` | 44, 84 | Replace with `logger.debug` |
| `update-profile-image.endpoint.ts` | 57-58 | Replace with `logger.debug` |
| `pinterest-import.service.ts` | 84 | Replace with `logger.debug` |
| `enable-youtube-sync.handler.ts` | 40, 61 | Replace with `logger.debug` |
| `youtube-import.handler.ts` | 76 | Replace with `logger.debug` |
| `youtube-import.endpoint.ts` | 44 | Replace with `logger.debug` |
| `tiktok-connect.endpoint.ts` | 86 | Replace with `logger.debug` |
| `youtube-connect.handler.ts` | 132 | Replace with `logger.debug` |
| `youtube-connect.endpoint.ts` | 62, 64, 75, 77 | Replace with `logger.debug` |
| `pinterest-import.handler.ts` | 104, 108, 172 | Replace with `logger.debug` |
| `linkedin-connect.handler.ts` | 163, 171, 341, 346 | Replace with `logger.debug` |
| `twitter-connect.endpoint.ts` | 73 | Replace with `logger.debug` |
| `twitter-import.handler.ts` | 60-61, 64, 68, 70 | Replace with `logger.debug` |
| `tiktok-connect.handler.ts` | 69 | Replace with `logger.debug` |

### 11.2 Dead Code Removal

| File | Dead Code | Action |
|------|-----------|--------|
| `login.handler.ts` | `sendWelcomeEmail()` method (lines 193-206) — never called | DELETE |
| `login.handler.ts` | `emailService` injection (line 68) — unused | REMOVE injection |
| `login.handler.ts` | Commented-out onboarding email (lines 138-140) | DELETE |
| `register.handler.ts` | `sendWelcomeEmail()` method (lines 160-173) — duplicated from login | KEEP (it IS called on line 156) |
| `httpContext.middleware.ts` | Better Auth fallback (lines 87-144) | REMOVE (see Section 6.1) |
| `betterAuthSession.util.ts` | Entire file — only used by httpContext middleware fallback | REMOVE |
| `better-auth.service.ts` | If exists — referenced in v1 but not found in current codebase | Verify and remove |

### 11.3 .env Security

**Add to `.gitignore`**:
```
.env.development
.env.production
.env.staging
.env.local
.env.*.local
```

**Create `.env.example`**:
```env
NODE_ENV=development
PROJECT_NAME=Gaddr Backend
PORT=8080
JWT_SECRET=CHANGE_ME_TO_RANDOM_32_BYTE_BASE64
JWT_ISSUER=http://localhost:5000
JWT_AUDIENCE=http://localhost:5000
JWT_ACCESS_EXPIRATION_MINUTES=7d
JWT_REFRESH_EXPIRATION_HOURS=30d
ENCRYPTION_KEY=CHANGE_ME_32_CHARS
ENCRYPTION_ALGORITHM=AES-256-CBC
ENCRYPTION_IV=CHANGE_ME_16_CHARS
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5433
POSTGRES_USERNAME=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_DATABASE=postgres
FACEBOOK_CLIENT_ID=your_facebook_id
FACEBOOK_CLIENT_SECRET=your_facebook_secret
# ... all other keys with placeholder values
```

---

## 12. Testing Plan

### 12.1 Auth Handler Test Matrix

| Handler | Endpoint | Test Case | Expected |
|---------|----------|-----------|----------|
| Login | `POST /auth/access-token` | Valid email + password, no 2FA | Returns JWT + refresh token |
| Login | `POST /auth/access-token` | Valid email + password, 2FA enabled | Returns 2FA JWT (TwoFARequired=true) |
| Login | `POST /auth/access-token` | Invalid password | Returns `succeeded: false` |
| Login | `POST /auth/access-token` | Unverified email (`emailVerified=false`) | Returns error |
| Login | `POST /auth/access-token` | Locked/banned user (`bannedAt IS NOT NULL`) | Returns lockout message |
| Login | `POST /auth/access-token` | Inactive user (`status != 'active'`) | Returns deactivation message |
| Login | `POST /auth/access-token` | Rate limit exceeded | Returns 429 |
| Login | `POST /auth/access-token` | Invalid Turnstile token | Returns CAPTCHA error |
| Refresh | `POST /auth/refresh-access-token` | Valid refresh token + matching device | Returns new JWT |
| Refresh | `POST /auth/refresh-access-token` | Expired refresh token | Returns error |
| Refresh | `POST /auth/refresh-access-token` | SecurityStamp mismatch | Returns 401 |
| Refresh | `POST /auth/refresh-access-token` | Device mismatch | Returns error |
| Logout | `POST /auth/logout` | Valid device ID | Session invalidated |
| Register | `POST /account/register` | New user, valid data | User created, verification email sent |
| Register | `POST /account/register` | Existing email | Returns `UserAlreadyExistsException` |
| Register | `POST /account/register` | With referral code | Referral tracked |
| Forgot Password | `POST /account/forgot-password` | Registered email | Reset code emailed |
| Forgot Password | `POST /account/forgot-password` | Unregistered email | Silent return (no leak) |
| Reset Password | `POST /account/reset-password` | Valid code + new password | Password updated, sessions invalidated |
| Reset Password | `POST /account/reset-password` | Expired code | Returns error |
| 2FA Setup | `POST /account/2fa/setup` | 2FA not enabled | Returns secret + QR code |
| 2FA Setup | `POST /account/2fa/setup` | 2FA already enabled | Returns error message |
| 2FA Enable | `POST /account/2fa/enable` | Valid OTP + secret | 2FA enabled |
| 2FA Enable | `POST /account/2fa/enable` | Invalid OTP | Returns error |
| 2FA Enable | `POST /account/2fa/enable` | 2FA already enabled | Returns error message |
| 2FA Verify | `POST /account/2fa/verify` | Valid OTP, 2FA enabled | Returns full JWT + refresh |
| 2FA Verify | `POST /account/2fa/verify` | Invalid OTP | Returns error |
| 2FA Verify | `POST /account/2fa/verify` | 2FA NOT enabled | Returns error (fixed logic) |
| 2FA Disable | `POST /account/2fa/disable` | 2FA enabled | 2FA disabled |
| Google OAuth | `GET /auth/google/connect` | Initiate flow | Returns authorize URL |
| Google OAuth | `GET /auth/google/connect-callback` | Valid callback code | Returns JWT |
| Facebook OAuth | `GET /auth/facebook/connect` | Initiate flow | Returns authorize URL |
| Facebook OAuth | `GET /auth/facebook/connect-callback` | Valid callback code | Returns JWT |
| Current User | `GET /auth/current` | Authenticated | Returns user info |
| Current User | `GET /auth/current` | Unauthenticated | Returns 401 |
| Verify Code | `POST /account/verify-code` | Valid code + purpose | Returns `isValid: true` |
| Verify Code | `POST /account/verify-code` | Expired code | Returns `isValid: false` |

### 12.2 Guard Tests

| Guard | Test Case | Expected |
|-------|-----------|----------|
| AccountGuard | Valid JWT + matching Redis stamps | Request proceeds |
| AccountGuard | SecurityStamp mismatch | 401 + `X-Password-Change: true` |
| AccountGuard | ConcurrencyStamp mismatch | Request proceeds + `X-Token-Refresh-Required: true` |
| AccountGuard | TwoFARequired claim + not allowed | 401 |
| AccountGuard | UserType mismatch | 403 |
| OnboardingGuard | Onboarding not completed | Request proceeds |
| OnboardingGuard | Onboarding completed | 403 |
| PermissionsGuard | Has required permission | Request proceeds |
| PermissionsGuard | Missing permission | 403 |

### 12.3 Integration Tests

| Scenario | Steps | Expected |
|----------|-------|----------|
| Full login flow | 1. Register via Project B 2. Verify email 3. Login 4. Access protected resource | All succeed |
| 2FA flow | 1. Login (2FA enabled) 2. Receive 2FA JWT 3. Verify OTP 4. Access protected resource | Full JWT issued |
| Token refresh | 1. Login 2. Token expires 3. Refresh 4. Access protected resource with new token | Seamless |
| Session invalidation | 1. Login on 2 devices 2. Reset password 3. Both devices try refresh | Both invalidated |
| Soft delete | 1. User soft-deleted 2. Login attempt | Rejected with deactivated message |
| FK constraints | 1. Create user with linked accounts 2. Attempt hard delete | Blocked by FK constraint |

### 12.4 Frontend Compatibility Tests

| Test | Method | Expected |
|------|--------|----------|
| JWT payload shape | Decode token, compare to `JwtPayload` type | All required fields present |
| SecurityStamp claim | Verify claim in token matches entity value | Matches |
| ConcurrencyStamp claim | Verify claim in token matches entity value | Matches |
| Onboarding step claim | Verify `onboardingStep` claim present | Present |
| Profile image claim | Verify `ProfileImage` claim | URL or null |
| Admin guard | Admin user accesses admin endpoint | Allowed |
| User guard | Regular user accesses admin endpoint | 403 |

---

## 13. Rollback Procedures

### 13.1 Rollback Plan by Phase

**Phase 1: Security (JWT secret rotation)**
- Rollback: Revert to old `JWT_SECRET` in `.env`
- Impact: All tokens issued with new secret become invalid
- User impact: All users must re-login

**Phase 2: Entity Schema Migration**
- Rollback: Run migration `down()` — drops added columns
- Impact: Code that references new columns will fail
- Safety: New columns are nullable, so existing queries won't break

**Phase 3: 2FA Bug Fix**
- Rollback: Revert handler file
- Impact: Users with 2FA enabled cannot complete verification (current broken state)

**Phase 4: FK Constraints**
- Rollback: Drop FK constraints
- Impact: Orphaned rows may exist

**Phase 5: console.log Removal**
- Rollback: Git revert
- Impact: None (logging-only change)

**Phase 6: Better Auth Removal**
- Rollback: Restore middleware fallback
- Impact: Cross-subdomain session verification may fail

### 13.2 Database Rollback Strategy

All migrations must implement `down()` methods. Before running any migration:

1. Take a full database backup
2. Run migration
3. Verify application starts and all endpoints work
4. If failure, restore from backup

```bash
# Backup
pg_dump -h localhost -U root -d postgres > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore (if needed)
psql -h localhost -U root -d postgres < backup_YYYYMMDD_HHMMSS.sql
```

---

## 14. Risk Assessment

### 14.1 Risk Matrix

| Risk | Probability | Impact | Severity | Mitigation |
|------|------------|--------|----------|------------|
| JWT secret rotation logs out all users | Certain | High | **Critical** | Coordinate with frontend team; display "session expired" message |
| 2FA bug fix changes auth flow behavior | Low | High | **High** | Test all 2FA flows in staging first |
| Missing FK constraint breaks existing data | Medium | High | **High** | Audit existing orphaned rows before adding constraints |
| console.log removal loses debugging info | Low | Low | **Low** | Replace with proper logger calls |
| Entity schema migration fails on production data | Medium | High | **High** | Test migration on staging DB copy first |
| Frontend breaks from JWT claim changes | Low | Critical | **Critical** | No JWT claim removals in this plan |
| New entity columns cause TypeORM sync issues | Low | Medium | **Medium** | Use `synchronize: false`, run migrations manually |
| Better Auth removal breaks cross-subdomain | Medium | Medium | **Medium** | Test cross-subdomain flows before removal |

### 14.2 Critical Dependencies

1. **Frontend MUST NOT CHANGE** — All JWT claim URIs and shapes must remain identical
2. **Database backup required** before any schema migration
3. **All API key rotations** must be coordinated with the team that uses each service
4. **Redis cache flush** required after JWT secret rotation (all cached account stamps become invalid)

---

## 15. Execution Order

### Phase 1 — Security Hardening (Priority: CRITICAL)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| 1.1 | Rotate JWT secret, update `.env.*` files | `.env.development`, `.env.production`, `src/configs.ts` | High — invalidates all tokens |
| 1.2 | Rotate all exposed API keys | External service dashboards | Medium |
| 1.3 | Move secrets out of `.env.development` | `.gitignore`, `.env.example` | Low |
| 1.4 | Remove all console.log statements | 30+ files (see Section 11.1) | Low |
| 1.5 | Add `.env.*` to `.gitignore` | `.gitignore` | Low |

### Phase 2 — Bug Fixes (Priority: HIGH)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| 2.1 | Fix 2FA verify inverted logic | `2fa-verify.handler.ts` | Medium |
| 2.2 | Fix empty error messages in 2FA handlers | `2fa-enable.handler.ts`, `2fa-setup.handler.ts` | Low |
| 2.3 | Fix RoleClaim inverse relation type | `roleClaim.entity.ts` | Low |
| 2.4 | Remove dead code from login handler | `login.handler.ts` | Low |

### Phase 3 — Entity Schema (Priority: HIGH)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| 3.1 | Add missing columns to User entity | `user.entity.ts` | Medium |
| 3.2 | Create DB migration for new columns | `migrations/XXXXXX-AlignUserSchema.ts` | High |
| 3.3 | Create DB migration for data sync | `migrations/XXXXXX-MigrateUserData.ts` | High |
| 3.4 | Adapt BaseEntity column names | `baseEntity.ts` | Medium |

### Phase 4 — Entity Relations (Priority: MEDIUM)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| 4.1 | Add missing `@ManyToOne` decorators | 13 entity files | Medium |
| 4.2 | Create FK constraint migration | `migrations/XXXXXX-AddFKConstraints.ts` | Medium |
| 4.3 | Audit for orphaned rows before applying FKs | SQL queries | Low |

### Phase 5 — JWT & Auth Adaptation (Priority: HIGH)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| 5.1 | Rewrite token service claims mapping | `token.service.ts` | Medium |
| 5.2 | Adapt login handler column checks | `login.handler.ts` | Medium |
| 5.3 | Remove Better Auth fallback from middleware | `httpContext.middleware.ts` | Low |
| 5.4 | Adapt user repository queries | `user.repository.ts` | Medium |
| 5.5 | Adapt mappers | `user.mapper.ts`, `public-profile.mapper.ts`, `profile.mapper.ts` | Low |

### Phase 6 — Code Quality (Priority: LOW)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| 6.1 | Standardize email normalization | `string.util.ts`, `user.repository.ts` | Low |
| 6.2 | Implement dual-hash password support | `user.repository.ts` | Low |
| 6.3 | Add rate limiting to auth endpoints | Auth module, throttler | Low |
| 6.4 | Add Turnstile server-side validation | `login.handler.ts`, `register.handler.ts` | Low |

---

## 16. Files Changed Summary

### 16.1 Files Modified

| File | Changes | Phase |
|------|---------|-------|
| `.env.development` | Rotate all secrets, add placeholders | 1 |
| `.gitignore` | Add `.env.*` patterns | 1 |
| `src/configs.ts` | Add JWT_SECRET min length validation | 1 |
| `src/domain/entities/identity/user.entity.ts` | Add 24+ columns, rename columns | 3 |
| `src/domain/entities/identity/roleClaim.entity.ts` | Fix inverse type + add JoinColumn | 4 |
| `src/domain/entities/identity/userLogin.entity.ts` | Add `@ManyToOne` to User | 4 |
| `src/domain/entities/identity/userRole.entity.ts` | Add `@ManyToOne` to User + Role | 4 |
| `src/domain/entities/identity/userClaim.entity.ts` | Add `@ManyToOne` to User | 4 |
| `src/domain/entities/linkedAccount.entity.ts` | Add `@ManyToOne` to User | 4 |
| `src/domain/entities/searchHistroy.entity.ts` | Add `@ManyToOne` to User | 4 |
| `src/domain/entities/publishJob.entity.ts` | Add `@ManyToOne` to User + LinkedAccount | 4 |
| `src/domain/entities/youtubeAccount.entity.ts` | Add `@ManyToOne` to User | 4 |
| `src/domain/entities/analyticsEvent.entity.ts` | Add `@ManyToOne` to User | 4 |
| `src/domain/entities/premiumRollup.entity.ts` | Add `@ManyToOne` to User | 4 |
| `src/domain/entities/notification/notification.entity.ts` | Add `@ManyToOne` to User | 4 |
| `src/domain/entities/rateLimit.entity.ts` | Add `@ManyToOne` to User (optional) | 4 |
| `src/domain/entities/rateLimitLog.entity.ts` | Add `@ManyToOne` to User (optional) | 4 |
| `src/domain/entities/dataProtectionKey.entity.ts` | Add `@ManyToOne` to User (optional) | 4 |
| `src/domain/baseEntity.ts` | Add `createdAt`/`updatedAt` aliases | 3 |
| `src/infrastructure/services/token.service.ts` | Rewrite claims mapping | 5 |
| `src/features/auth/login/login.handler.ts` | Fix column names, remove dead code | 2, 5 |
| `src/features/auth/2fa/verify/2fa-verify.handler.ts` | Fix inverted logic, add error message | 2 |
| `src/features/auth/2fa/enable/2fa-enable.handler.ts` | Add error message | 2 |
| `src/features/auth/2fa/setup/2fa-setup.handler.ts` | Add error message | 2 |
| `src/core/middlewares/httpContext.middleware.ts` | Remove Better Auth fallback | 5 |
| `src/infrastructure/repositories/user.repository.ts` | Adapt queries, add dual-hash, remove console.log | 5, 6 |
| `src/domain/mappers/user.mapper.ts` | Update field mappings | 5 |
| `src/domain/mappers/public-profile.mapper.ts` | Update field mappings | 5 |
| `src/domain/mappers/profile.mapper.ts` | Update field mappings | 5 |
| 30+ files with console.log | Remove/replace console.log | 1 |

### 16.2 Files Created

| File | Purpose | Phase |
|------|---------|-------|
| `.env.example` | Template with placeholder values | 1 |
| `src/infrastructure/migrations/XXXXXX-AlignUserSchema.ts` | Add missing columns | 3 |
| `src/infrastructure/migrations/XXXXXX-MigrateUserData.ts` | Sync existing data | 3 |
| `src/infrastructure/migrations/XXXXXX-AddFKConstraints.ts` | Add FK constraints | 4 |

### 16.3 Files Deleted

| File | Reason | Phase |
|------|--------|-------|
| `src/core/utils/betterAuthSession.util.ts` | Only used by removed middleware fallback | 5 |

### 16.4 Files NOT Changed (Explicitly Kept)

| File | Reason |
|------|--------|
| `src/features/auth/register/` | Frontend calls these endpoints |
| `src/features/auth/reset-password/` | Frontend calls these endpoints |
| `src/features/auth/forgot-password/` | Frontend calls these endpoints |
| `src/features/auth/2fa/` (all 4 handlers) | Frontend calls these endpoints |
| `src/features/auth/external/google-auth/` | Frontend calls these endpoints |
| `src/features/auth/external/facebook-auth/` | Frontend calls these endpoints |
| `src/features/user/` | Frontend calls these endpoints |
| `src/features/onboarding/` | Frontend calls these endpoints |
| `src/infrastructure/services/email.service.ts` | Project B sends its own emails |
| `src/core/globals.ts` | ClaimTypes URIs are frontend-compatible |
| `src/core/passport/account.guard.ts` | Stamp validation is critical security |
| `src/core/passport/jwtPayload.ts` | Frontend mirrors this interface |

---

## 17. Architecture Decision Records

### ADR-001: Project B Remains Identity Provider

**Status**: Accepted

**Context**: V1 proposed removing auth ownership from Project B and making it a read-only identity consumer. The frontend (`E:\SocialApp`) calls 55+ Project B endpoints directly, including all auth endpoints.

**Decision**: Project B STAYS as the canonical identity provider and primary backend. All auth handlers, entity definitions, and JWT generation remain in Project B.

**Consequences**:
- Project B owns the `identity.users` schema
- Project B handles registration, login, 2FA, password reset, OAuth
- JWT claims must maintain frontend compatibility
- Project A (if it exists) would need to read from Project B's identity schema, not the other way around

### ADR-002: Preserve SecurityStamp/ConcurrencyStamp JWT Claims

**Status**: Accepted

**Context**: V1 proposed removing `securityStamp` and `concurrencyStamp` from JWT claims. The account guard (`account.guard.ts`) validates these stamps against Redis cache on every authenticated request. The refresh token handler (`refresh-token.handler.ts:106`) checks the securityStamp to invalidate sessions on password change.

**Decision**: Both stamps MUST remain in JWT claims and entity. The stamp-based session invalidation mechanism is a core security feature.

**Consequences**:
- Account guard continues to detect concurrent updates and force re-authentication
- Password changes automatically invalidate all sessions (via securityStamp regeneration)
- Frontend `JwtPayload` type remains compatible

### ADR-003: Remove Better Auth Session Fallback

**Status**: Accepted

**Context**: `httpContext.middleware.ts` has a Better Auth session fallback that queries the `session` table and `identity.users` via raw SQL. This fallback queries `u.name` which doesn't exist on the entity (should be `u."userName"`). The system uses JWT-based auth, not Better Auth sessions.

**Decision**: Remove the Better Auth fallback entirely. JWT is the sole authentication mechanism in Project B.

**Consequences**:
- Remove `betterAuthSession.util.ts`
- Remove `tryBetterAuthSession()` method from middleware
- Remove `BETTER_AUTH_SECRET` and `BETTER_AUTH_COOKIE_NAME` from configs (if not used elsewhere)
- Simpler, faster middleware — no database query per request for session lookup

### ADR-004: Dual-Hash Password Migration

**Status**: Proposed (pending decision)

**Context**: Project B currently uses bcrypt for password hashing. Argon2id is the OWASP-recommended algorithm. If migrating, existing bcrypt hashes must continue to work.

**Decision**: Implement dual-hash verification with auto-upgrade on login. New registrations use Argon2id. Existing bcrypt hashes are verified with bcrypt and re-hashed with Argon2id on next login.

**Consequences**:
- Add `argon2` npm dependency
- Slightly slower login for bcrypt users (two hash comparisons)
- All passwords eventually migrated to Argon2id

### ADR-005: BaseEntity Column Naming

**Status**: Pending decision

**Context**: BaseEntity uses `createdOn`/`lastModifiedOn`. Project A convention uses `createdAt`/`updatedAt`. The actual database column names determine which is correct.

**Options**:
1. Rename BaseEntity columns to `createdAt`/`updatedAt` + DB migration
2. Add aliases (`createdAt` as alias for `createdOn`)
3. Leave as-is if DB columns match `createdOn`/`lastModifiedOn`

**Decision**: Pending — verify actual database column names before choosing.

---

## 18. Open Questions

| # | Question | Impact | Decision Needed By |
|---|----------|--------|-------------------|
| 1 | Are the DB columns actually named `createdOn`/`lastModifiedOn` or `createdAt`/`updatedAt`? | Determines BaseEntity change approach | Before Phase 3 |
| 2 | Does Project A exist yet? If so, does it write to `identity.users`? | Determines if dual-write is needed | Before Phase 3 |
| 3 | Should `betterAuth` config keys be removed entirely, or kept for potential future use? | Config cleanup scope | Before Phase 5 |
| 4 | Is the `UserRole` join table still actively used, or has it been superseded by the `role` column on `users`? | Determines if UserRole entity needs updating | Before Phase 4 |
| 5 | What is the production deployment pipeline? Can migrations be run manually or must they auto-run? | Migration safety approach | Before Phase 3 |
| 6 | Should rate limiting use Redis-based (`@nestjs/throttler` with Redis) or in-memory? | Rate limiting implementation | Before Phase 6 |
| 7 | Is there an `.env.production` file, or are production secrets injected via environment variables at deploy time? | Secrets remediation approach | Before Phase 1 |
| 8 | Should the `contentStream.entity.ts` have a `userId` column? It currently has none. | FK constraint completeness | Before Phase 4 |
| 9 | What is the correct ON DELETE behavior for each FK? `CASCADE` vs `RESTRICT` vs `SET NULL`? | FK migration safety | Before Phase 4 |
| 10 | Should the `emailConfirmed` → `emailVerified` rename be a column rename in DB or just an entity alias? | Migration complexity | Before Phase 3 |

---

## Appendix A — Frontend JWT Compatibility Reference

The frontend `E:\SocialApp\src\types\jwtPayload.type.ts` defines:

```typescript
export interface JwtPayload {
  exp: number;
  [key: string]: unknown;
  onboardingStep?: string;
  [ClaimTypes.Email]: string;        // http://gaddr.com/claims/email
  [ClaimTypes.UserId]: string;       // http://gaddr.com/claims/sub
  [ClaimTypes.UserName]: string;     // http://gaddr.com/claims/username
  [ClaimTypes.UserType]: string;     // http://gaddr.com/claims/usertype
  [ClaimTypes.FullName]: string;     // http://gaddr.com/claims/fullname
  [ClaimTypes.GivenName]: string;    // http://gaddr.com/claims/givenname
  [ClaimTypes.FamilyName]: string;   // http://gaddr.com/claims/familyname
  [ClaimTypes.ProfileImage]: string; // http://gaddr.com/claims/profile-picture
  [ClaimTypes.SecurityStamp]: string;     // http://gaddr.com/claims/security-stamp
  [ClaimTypes.ConcurrencyStamp]: string;  // http://gaddr.com/claims/concurrency-stamp
}
```

**ALL** of these claims must be present in every JWT generated by Project B.

## Appendix B — Auth Endpoint Inventory (Frontend → Project B)

| Frontend Service | Endpoint | Method |
|-----------------|----------|--------|
| `token.service.ts` | `/auth/access-token` | POST |
| `token.service.ts` | `/auth/refresh-access-token` | POST |
| `token.service.ts` | `/auth/logout` | POST |
| `token.service.ts` | `/auth/current` | GET |
| `token.service.ts` | `/auth/{platform}/connect` | GET |
| `token.service.ts` | `/auth/{platform}/connect-callback` | GET |
| `account.service.ts` | `/account/register` | POST |
| `account.service.ts` | `/account/email/verify` | POST |
| `account.service.ts` | `/account/email/send-verification` | POST |
| `account.service.ts` | `/account/email/in-use` | POST |
| `account.service.ts` | `/account/username/suggest` | POST |
| `account.service.ts` | `/account/forgot-password` | POST |
| `account.service.ts` | `/account/verify-code` | POST |
| `account.service.ts` | `/account/reset-password` | POST |
| `account.service.ts` | `/account/2fa/setup` | POST |
| `account.service.ts` | `/account/2fa/enable` | POST |
| `account.service.ts` | `/account/2fa/disable` | POST |
| `account.service.ts` | `/account/change-password` | POST |
| `account.service.ts` | `/account/delete` | POST |

## Appendix C — Console.log Complete File List

```
src/core/utils/redirectUrl.util.ts                     (2 instances)
src/core/utils/permissions.util.ts                      (1)
src/infrastructure/background/listeners/email.listener.ts (1)
src/core/passport/onboarding.guard.ts                   (7)
src/features/user/update/profile-image/update-profile-image.handler.ts (2)
src/features/user/update/profile-image/update-profile-image.endpoint.ts (2)
src/infrastructure/services/pinterest/pinterest-import.service.ts (1)
src/features/auth/external/google-auth/google-auth.handler.ts (14+)
src/features/auth/external/google-auth/google-auth.endpoint.ts (8+)
src/features/integrations/youtube/sync/enable-youtube-sync.handler.ts (2)
src/infrastructure/repositories/contentStream.repository.ts (1)
src/infrastructure/repositories/linkedAccount.repository.ts (2)
src/features/integrations/youtube/import/youtube-import.handler.ts (1)
src/features/integrations/youtube/import/youtube-import.endpoint.ts (1)
src/infrastructure/repositories/userContent.repository.ts (2)
src/infrastructure/repositories/user.repository.ts     (2)
src/features/integrations/tiktok/connect/tiktok-connect.handler.ts (4)
src/features/integrations/youtube/connect/youtube-connect.handler.ts (1)
src/features/integrations/pinterest/import/pinterest-import.handler.ts (3)
src/features/integrations/pinterest/connect/pinterest-connect.handler.ts (8)
src/features/integrations/linkedin/connect/linkedin-connect.handler.ts (7)
src/features/integrations/facebook/connect/facebook-connect.handler.ts (11)
src/features/integrations/twitter/connect/twitter-connect.handler.ts (9)
src/features/integrations/twitter/connect/twitter-connect.endpoint.ts (1)
src/features/integrations/twitter/import/twitter-import.handler.ts (5)
src/features/integrations/tiktok/connect/tiktok-connect.endpoint.ts (1)
src/features/integrations/youtube/connect/youtube-connect.endpoint.ts (4)
```

**Total**: ~100+ `console.log` statements across 30+ files.
