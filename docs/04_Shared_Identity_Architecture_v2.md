# 04 — Shared Identity Architecture v2

> **Status**: DRAFT — v2 incorporating critical blocker decisions from Doc 12
> **Supersedes**: `04_Shared_Identity_Architecture.md` (v1)
> **Created**: 2026-07-19
> **Scope**: Cross-project identity sharing between gaddr-jobs (Project A) and gaddr-backend-api (Project B)

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | ARCH-SHARED-IDENTITY-V2 |
| Author | Architecture Team |
| Version | 2.0 |
| Last Updated | 2026-07-19 |
| Decision Status | Pending stakeholder approval |
| Related Documents | `12_Critical_Blocker_Decisions.md`, `04_Shared_Identity_Architecture.md` (v1) |
| Projects In Scope | gaddr-jobs (Next.js), gaddr-backend-api (NestJS), SocialApp (React Native) |

---

## 1. Executive Summary

This document defines the shared identity architecture for the Gaddr platform, where two independent applications — **Project A** (gaddr-jobs, a Next.js application using Better Auth) and **Project B** (gaddr-backend-api, a NestJS application using custom JWT auth) — must share user identity over a single PostgreSQL database.

The v1 architecture (Doc 04) addressed intra-project concerns (fat user table, FK gaps, dual auth). This v2 extends the design to address **cross-project identity sharing** by resolving 5 critical blockers identified in the Master Architecture Review (Doc 08) and formalized in the Critical Blocker Decisions document (Doc 12).

**Key decisions (from Doc 12, Option A on all 5):**

1. **Project B retains ownership of all auth endpoints.** The frontend exclusively calls Project B's 14 auth controllers. Project A's Better Auth is internal-only.
2. **`identity.users` is the canonical user table** with UUID PK. Project A's `public.user` (text PK) is migrated and dropped.
3. **UUID everywhere.** Project A switches from text PKs to UUID. The `user_id_mapping` table is eliminated.
4. **JWT claims preserved.** `securityStamp` and `concurrencyStamp` remain in the JWT payload. Frontend TypeScript unchanged.
5. **Dual-hash passwords** (bcrypt in Project B + Argon2id in Project A) with rehash-on-login convergence.

**Result**: Zero frontend changes. Zero API contract changes. Both projects read/write the same `identity.users` table. Project A uses Better Auth internally for its Next.js features; Project B serves all external auth via JWT.

---

## 2. Architecture Principles

### 2.1 Identity Provider / Consumer Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    IDENTITY PROVIDER                             │
│                                                                 │
│  Project B (gaddr-backend-api)                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ • Owns all 14 auth controllers (login, register, etc.)  │    │
│  │ • Generates and validates JWT tokens                    │    │
│  │ • Manages password hashing (bcrypt)                     │    │
│  │ • Handles 2FA (TOTP via speakeasy)                      │    │
│  │ • Manages refresh tokens (userLogins table)             │    │
│  │ • Serves the frontend (SocialApp) exclusively           │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │ writes to                             │
│                         ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              identity.users (UUID PK)                    │    │
│  │              identity.userLogins                         │    │
│  │              identity.userBiometrics                     │    │
│  │              identity.userRoles / identity.roles         │    │
│  │              identity.userClaims / identity.roleClaims   │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │ reads from                             │
│                         ▼                                        │
│  Project A (gaddr-jobs)                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ • Uses Better Auth for internal Next.js app features    │    │
│  │ • Reads identity.users for user data                    │    │
│  │ • Verifies passwords against identity.users             │    │
│  │ • Does NOT serve auth endpoints to the frontend         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Principle 1: Single Canonical Identity Source.** `identity.users` is the single source of truth for all user identity data across both projects. No duplicate user tables.

**Principle 2: One Auth Surface.** Project B is the sole external auth provider. All frontend auth calls route to Project B. Project A's Better Auth is scoped to Project A's internal features only (admin panel, server-side rendering auth checks).

**Principle 3: Shared Database, Independent Schemas.** Both projects connect to the same PostgreSQL database but operate within their respective concerns. Project A writes to identity tables it owns; Project B writes to identity tables it owns. Neither project modifies the other's domain tables.

**Principle 4: JWT as the Universal Auth Token.** Project B generates JWT tokens. Project A can verify these tokens (shared secret or public key) for server-side rendering auth checks without hitting Project B's API.

**Principle 5: Backward Compatibility First.** No frontend changes. No API contract changes. No token format changes. All migration is internal.

### 2.2 Shared Database Topology

```
                    ┌──────────────────────┐
                    │   PostgreSQL Server   │
                    │   gaddr_production    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                 │
    ┌─────────▼─────────┐ ┌───▼──────────┐ ┌───▼──────────┐
    │  identity schema   │ │ public schema │ │notification  │
    │                    │ │              │ │analytics     │
    │  users (UUID PK)  │ │ playlists    │ │              │
    │  userLogins       │ │ userContents │ │              │
    │  userBiometrics   │ │ linkedAccts  │ │              │
    │  roles            │ │ manualProfs  │ │              │
    │  userRoles        │ │              │ │              │
    │  userClaims       │ │              │ │              │
    │  roleClaims       │ │              │ │              │
    └────────┬──────────┘ └──────────────┘ └──────────────┘
             │
    ┌────────┴───────────────────────────────────────┐
    │                                                │
    │  Project A reads identity.users,               │
    │  identity.roles (for Better Auth config)       │
    │                                                │
    │  Project B reads/writes all identity tables    │
    │  (primary owner)                               │
    │                                                │
└───┼────────────────────────────────────────────────┘
    │
    │  Both projects use the same DB connection pool
    │  with separate connection limits
```

---

## 3. Current State Analysis

### 3.1 Project A — gaddr-jobs (Next.js + Better Auth)

**File**: `E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts`

**User table**: `public.user`

| Column | Type | PK | Notes |
|--------|------|----|-------|
| `id` | `text` | **YES** | Better Auth default — nanoid-based text string |
| `name` | `text` | | Full name (computed from firstName + lastName) |
| `email` | `text` | UNIQUE | Email address |
| `email_verified` | `boolean` | | Email confirmed flag |
| `image` | `text` | | Profile image URL |
| `created_at` | `timestamp` | | Account creation |
| `updated_at` | `timestamp` | | Last update |
| `first_name` | `text` | NOT NULL | Required by Better Auth additionalFields |
| `last_name` | `text` | NOT NULL | Required by Better Auth additionalFields |
| `role` | `text` | | User role |
| `two_factor_enabled` | `boolean` | | 2FA flag |
| `two_fa_verified_at` | `timestamp` | | 2FA verification timestamp |
| `is_verified` | `boolean` | | Platform verification |
| `is_admin` | `boolean` | | Admin flag |
| `stripe_customer_id` | `text` | | Stripe integration |
| `stripe_price_id` | `text` | | Subscription price |
| `stripe_subscription_id` | `text` | | Subscription ID |
| `subscription_status` | `text` | DEFAULT 'none' | Subscription state |
| `subscription_plan` | `text` | DEFAULT 'free' | Plan name |
| `job_post_limit` | `integer` | DEFAULT 1 | Job posting limit |
| `active_job_post_count` | `integer` | DEFAULT 0 | Active job posts |
| `wallet_address` | `text` | | Crypto wallet |
| `private_search_mode` | `boolean` | | Privacy setting |
| `blocked_employers` | `text[]` | | Blocked employer IDs |
| `ai_analysis_opt_out` | `boolean` | | AI opt-out |
| `google_id` | `text` | UNIQUE | Google OAuth ID |
| `phone_number` | `text` | | Phone number |
| `gender` | `text` | | Gender |
| `date_of_birth` | `timestamp` | | DOB |
| `onboarding_step` | `text` | DEFAULT 'not_started' | Onboarding state |
| `referral_code` | `text` | UNIQUE | Referral tracking |
| `referred_by` | `text` | | Referrer |
| `profile_privacy` | `text` | DEFAULT 'public' | Privacy setting |
| `source_app` | `text` | DEFAULT 'jobs' | Origin app |
| `status` | `text` | DEFAULT 'active' | Account status |
| `deleted_at` | `timestamp` | | Soft delete |
| `banned_at` | `timestamp` | | Ban timestamp |
| `ban_reason` | `text` | | Ban reason |

**Total columns**: 38 (including PK)

**Auth config** (`E:\Github\gaddep\gaddr-jobs\src\server\auth\index.ts`):
- Better Auth v1.5.6 with Drizzle ORM adapter
- `emailAndPassword.enabled: true`, `requireEmailVerification: true`
- Google OAuth via `socialProviders.google`
- Passkey support via `@better-auth/passkey`
- Redis secondary storage via `@better-auth/redis-storage`
- Cross-subdomain cookies in production (`.gaddr.com`)
- Password hashing: **Argon2id** (Better Auth default)
- Email normalization: **None explicit** — relies on Better Auth defaults

**Mapping table** (already exists):
```typescript
export const userIdMapping = pgTable("user_id_mapping", {
  jobsTextId: text("jobs_text_id").primaryKey(),  // Project A's nanoid text ID
  gaddrUuid: text("gaddr_uuid").notNull().unique(), // Project B's UUID
  migratedAt: timestamp("migrated_at").defaultNow().notNull(),
});
```

**Redis**: ioredis client (`E:\Github\gaddep\gaddr-jobs\src\server\redis.ts`), used for Better Auth secondary storage with key prefix `better-auth:`.

### 3.2 Project B — gaddr-backend-api (NestJS + JWT)

**File**: `E:\gaddr-backend-api\src\domain\entities\identity\user.entity.ts`

**User table**: `identity.users`

| Column | Type | PK | Notes |
|--------|------|----|-------|
| `id` | `uuid` | **YES** | `@PrimaryGeneratedColumn('uuid')` via BaseEntity |
| `firstName` | `varchar` | | First name |
| `lastName` | `varchar` | | Last name |
| `isActive` | `boolean` | DEFAULT true | Account active flag |
| `registeredOn` | `timestamp` | | Registration date |
| `userName` | `varchar` | UNIQUE | Username |
| `email` | `varchar` | | Email address |
| `gender` | `varchar` | | Gender |
| `phoneNumber` | `varchar` | | Phone number |
| `bio` | `text` | | Biography |
| `googleId` | `varchar` | UNIQUE | Google OAuth ID |
| `newEmail` | `varchar` | | Pending email change |
| `lastEmailModifiedAt` | `timestamp` | | Email change tracking |
| `newPhoneNumber` | `varchar` | | Pending phone change |
| `lastPhoneNumberModifiedAt` | `timestamp` | | Phone change tracking |
| `lastUserNameModifiedAt` | `timestamp` | | Username change tracking |
| `normalizedEmail` | `varchar` | | `email.toUpperCase()` |
| `normalizedUserName` | `varchar` | | `userName.toUpperCase()` |
| `emailConfirmed` | `boolean` | DEFAULT false | Email verified |
| `twoFactorEnabled` | `boolean` | DEFAULT false | 2FA flag |
| `twoFactorSecret` | `varchar` | | TOTP secret |
| `passwordHash` | `varchar` | | bcrypt hash |
| `lastPasswordModifiedAt` | `timestamp` | | Password change tracking |
| `isLockedOut` | `boolean` | DEFAULT false | Lockout flag |
| `lockoutEnd` | `timestamp` | | Lockout expiry |
| `accessFailedCount` | `integer` | DEFAULT 0 | Failed login count |
| `concurrencyStamp` | `varchar` | | Concurrency token |
| `securityStamp` | `varchar` | | Security token |
| `referralCode` | `varchar` | UNIQUE | Referral tracking |
| `referredBy` | `varchar` | | Referrer |
| `profilePrivacy` | `enum` | DEFAULT 'Public' | Privacy setting |
| `type` | `enum` | DEFAULT 'User' | UserType enum |
| `onboardingStep` | `enum` | DEFAULT 'NotStarted' | Onboarding state |

**Plus BaseEntity columns**: `createdBy`, `createdOn`, `lastModifiedBy`, `lastModifiedOn`, `lastRefreshed`

**Total columns**: 33 + 5 BaseEntity = 38

**Auth endpoints** (14 controllers, from `E:\gaddr-backend-api\src\features\auth\index.ts`):

| # | Controller | Handler |
|---|-----------|---------|
| 1 | `LoginController` | `LoginCommandHandler` — email/password login |
| 2 | `RegisterController` | `RegisterCommandHandler` — new account creation |
| 3 | `LogoutController` | `LogoutCommandHandler` — session invalidation |
| 4 | `RefreshTokenController` | `RefreshTokenCommandHandler` — JWT refresh |
| 5 | `ForgotPasswordController` | `ForgotPasswordCommandHandler` — reset request |
| 6 | `ResetPasswordController` | `ResetPasswordCommandHandler` — reset execution |
| 7 | `VerifyCodeController` | `VerifyCodeCommandHandler` — email verification |
| 8 | `CurrentUserController` | `CurrentUserQuery` — get current user from JWT |
| 9 | `GoogleAuthenticationController` | `GoogleConnectQuery/Callback` — Google OAuth |
| 10 | `FacebookAuthenticationController` | `FacebookConnectQuery/Callback` — Facebook OAuth |
| 11 | `Setup2FAController` | `Setup2FACommandHandler` — generate TOTP secret |
| 12 | `Enable2FAController` | `Enable2FACommandHandler` — activate 2FA |
| 13 | `Verify2FAController` | `Verify2FACommandHandler` — verify 2FA code at login |
| 14 | `Disable2FAController` | `Disbale2FACommandHandler` — deactivate 2FA |

**Password hashing** (`E:\gaddr-backend-api\src\infrastructure\repositories\user.repository.ts`):
- **bcrypt cost 10** — `bcrypt.hash(password, 10)` on create and password change
- **bcrypt.compare** — `bcrypt.compare(password, user.passwordHash)` on login

**Email normalization** (`E:\gaddr-backend-api\src\core\utils\string.util.ts`):
```typescript
normalizeEmail: (email: string): string => {
  return email?.trim().toLowerCase() ?? email;
}
```

**Entity constructor normalization** (`user.entity.ts:145-146`):
```typescript
this.normalizedEmail = request.email?.toUpperCase();
this.normalizedUserName = request.userName?.toUpperCase();
```

### 3.3 JWT Token Format

**File**: `E:\gaddr-backend-api\src\infrastructure\services\token.service.ts`

**Signing**: HS256 via `@nestjs/jwt` with shared secret from `configs.jwt.secret`

**Claims** (14 custom claim URIs from `E:\gaddr-backend-api\src\core\globals.ts`):

| Claim URI | Key | Source |
|-----------|-----|--------|
| `http://gaddr.com/claims/sub` | UserId | `user.id` (UUID) |
| `http://gaddr.com/claims/email` | Email | `user.email` |
| `http://gaddr.com/claims/username` | UserName | `user.userName` |
| `http://gaddr.com/claims/givenname` | GivenName | `user.firstName` |
| `http://gaddr.com/claims/familyname` | FamilyName | `user.lastName` |
| `http://gaddr.com/claims/fullname` | FullName | `user.lastName + ' ' + user.firstName` |
| `http://gaddr.com/claims/security-stamp` | SecurityStamp | `user.securityStamp` |
| `http://gaddr.com/claims/concurrency-stamp` | ConcurrencyStamp | `user.concurrencyStamp` |
| `http://gaddr.com/claims/profile-picture` | ProfileImage | `biometrics.profileImageUrl` |
| `http://gaddr.com/claims/usertype` | UserType | `user.type` |
| `http://gaddr.com/claims/roles` | Roles | Array of role names |
| `permission` | Permission | Array of permission values |
| `onboardingStep` | onboardingStep | `user.onboardingStep` |
| `http://gaddr.com/claims/2fa-required` | TwoFARequired | `true` (2FA login only) |

**Token lifetimes**:
- Access token: from `configs.jwt.accessTokenExpiration`
- Refresh token: from `configs.jwt.refreshTokenExpiration` (stored in `userLogins`)
- 2FA intermediate token: 5 minutes

**Frontend consumption** (`E:\SocialApp\src\types\jwtPayload.type.ts`):
```typescript
export interface JwtPayload {
  exp: number;
  [key: string]: unknown;
  onboardingStep?: string;
  [ClaimTypes.Email]: string;
  [ClaimTypes.UserId]: string;
  [ClaimTypes.UserName]: string;
  [ClaimTypes.UserType]: string;
  [ClaimTypes.FullName]: string;
  [ClaimTypes.GivenName]: string;
  [ClaimTypes.FamilyName]: string;
  [ClaimTypes.ProfileImage]: string;
  [ClaimTypes.SecurityStamp]: string;
  [ClaimTypes.ConcurrencyStamp]: string;
}
```

### 3.4 Critical Incompatibilities

| # | Incompatibility | Impact | Resolution |
|---|----------------|--------|------------|
| 1 | **PK type mismatch**: `public.user.id` is text (nanoid), `identity.users.id` is UUID | FK constraints cannot span tables | Switch Project A to UUID PK (Decision 3, Option A) |
| 2 | **Two user tables**: `public.user` (38 cols) and `identity.users` (38 cols) | Duplicate user data, no shared identity | Merge into `identity.users` as canonical (Decision 2, Option A) |
| 3 | **Password hash algorithms**: Argon2id (A) vs bcrypt (B) | Cross-project password verification fails | Dual-hash with rehash-on-login (Decision 5, Option A) |
| 4 | **Email normalization**: None explicit (A) vs `trim().toLowerCase()` (B) vs `toUpperCase()` (entity constructor) | Email lookup mismatches | Standardize normalization strategy (Section 7) |
| 5 | **Auth ownership**: Frontend calls 14 Project B controllers; Doc 07 proposed removing them | Frontend breakage | Project B retains all auth (Decision 1, Option A) |

---

## 4. Target Architecture Design

### 4.1 Who Is the Identity Provider?

**Project B (gaddr-backend-api) is the identity provider for all external-facing authentication.**

Rationale:
- Frontend exclusively calls Project B's 14 auth controllers (`E:\SocialApp\src\services\api\token.service.ts` routes all `/auth/*` calls to Project B)
- Project B generates JWT tokens consumed by the frontend
- All 55+ non-auth endpoints on Project B validate JWT tokens via `HttpContextMiddleware`
- Zero frontend changes means zero API contract changes

**Project A (gaddr-jobs) is an identity consumer** for its internal Next.js features. Better Auth remains configured in Project A for:
- Server-side rendering auth checks (cookies, not JWT)
- Admin panel access (if applicable)
- Internal API routes that need session validation

Project A reads from `identity.users` for user data. It does NOT serve auth endpoints to the public frontend.

### 4.2 Who Consumes Identity?

| Consumer | Mechanism | Scope |
|----------|-----------|-------|
| **Project B API** (NestJS) | JWT validation via `HttpContextMiddleware` | All 55+ endpoints |
| **Project A Next.js** | Better Auth session cookies + direct DB reads | Internal Next.js pages, SSR |
| **SocialApp (React Native)** | JWT Bearer tokens in Authorization header | All API calls to Project B |

### 4.3 User Table Canonical Choice

**`identity.users` is the canonical user table. UUID PK.**

| Criterion | `identity.users` (UUID PK) | `public.user` (text PK) | Winner |
|-----------|---------------------------|------------------------|--------|
| FK dependencies | 18+ tables reference `identity.users.id` | 0 external FKs | `identity.users` |
| PK type | UUID (globally unique, TypeORM native) | text (nanoid, Better Auth default) | `identity.users` |
| Auth system | JWT (Project B) | Better Auth (Project A) | `identity.users` (frontend uses Project B) |
| Schema placement | `identity` (correct) | `public` (wrong) | `identity.users` |
| Column count | 38 (fat, to be split per v1 Doc 04) | 38 (fat, merge target) | Tie |

**Migration plan**: Project A's `public.user` data (49 rows from merger migration) is merged into `identity.users`. Project A's Better Auth is reconfigured to use `identity.users` with UUID PKs. `public.user` is dropped.

### 4.4 PK Type Decision: UUID Everywhere

**Decision**: All user IDs are UUIDs across both projects.

**Project A changes required**:

1. **Better Auth schema** (`auth-schema.ts`): Change `id: text("id").primaryKey()` to `id: text("id").primaryKey()` — Better Auth generates text IDs internally, but the `user_id_mapping` table provides UUID mapping. With UUID-everywhere, we override Better Auth's ID generation.

   Better Auth does not natively support UUID PKs. The recommended approach:
   - Keep Better Auth's `text("id")` column as-is (Better Auth writes to it internally)
   - Use a database trigger or Better Auth `databaseHooks.user.create.before` to generate a UUID
   - Store the UUID in a separate column OR override the `id` column via a migration

   **Practical approach**: Since Better Auth 1.5.6 generates nanoid text IDs and deeply controls its own schema, the cleanest path is:
   - Keep `public.user.id` as text (Better Auth's nanoid)
   - Keep `identity.users.id` as UUID (Project B's primary key)
   - **Drop** the `user_id_mapping` table
   - Add a `uuid_id` column to `public.user` that references `identity.users.id`
   - Better Auth continues using `text id` internally; Project A reads `uuid_id` for cross-project joins

   **Wait — this defeats the purpose of "UUID everywhere."** The real question is: can Better Auth use UUIDs?

   Better Auth generates IDs via its adapter. With `drizzleAdapter`, the ID generation is handled by Better Auth's core. We can override this with a `before` hook:

   ```typescript
   databaseHooks: {
     user: {
       create: {
         before: async (user) => {
           const { v4: uuid } = await import("uuid");
           return {
             data: {
               ...user,
               id: uuid(), // Override nanoid with UUID
             },
           };
         },
       },
     },
   },
   ```

   However, this only works for new users. Existing text IDs require a data migration.

2. **Migration strategy for existing text IDs**:
   ```sql
   -- 1. Add UUID column to public.user
   ALTER TABLE public.user ADD COLUMN uuid_id UUID;

   -- 2. Generate UUIDs for existing users
   UPDATE public.user SET uuid_id = gen_random_uuid();

   -- 3. Copy to identity.users (if not already there)
   INSERT INTO identity.users (id, email, ...)
   SELECT uuid_id, email, ... FROM public.user
   ON CONFLICT (id) DO NOTHING;

   -- 4. Update all FK references from text id to uuid_id
   -- (Only needed for tables in Project A that reference public.user.id)

   -- 5. Once all Project A code uses uuid_id, drop the text id column
   ```

3. **Better Auth session/account/passkey tables**: These have FKs to `public.user.id` (text). After switching to UUID:
   - `session.user_id`, `account.user_id`, `passkey.userId` all reference `public.user.id`
   - These must be updated to reference the UUID column
   - Or: the `public.user.id` column itself becomes UUID (requires Better Auth schema modification)

**Recommended implementation**:

Given Better Auth's constraints, the pragmatic approach is:
1. **In the short term**: Keep the `user_id_mapping` table as a bridge. Project A writes to `public.user` (text PK) as Better Auth requires. Project B writes to `identity.users` (UUID PK). The mapping table translates.
2. **In the medium term**: Override Better Auth's ID generation via `databaseHooks` to produce UUIDs. Migrate existing text IDs to UUIDs. Drop `user_id_mapping`.
3. **In the long term**: Both projects use `identity.users` (UUID PK) as the single user table. `public.user` is dropped entirely.

### 4.5 Password Hashing Strategy

**Decision**: Dual-hash with rehash-on-login convergence.

| Project | Hash Algorithm | Cost | Library |
|---------|---------------|------|---------|
| Project A (gaddr-jobs) | **Argon2id** | Better Auth defaults (memory: 65536 KB, iterations: 3, parallelism: 4) | Better Auth built-in |
| Project B (gaddr-backend-api) | **bcrypt** | Cost factor 10 | `bcrypt` npm package |

**Storage**: `identity.users.password_hash` stores the bcrypt hash (Project B is the primary auth provider). A second column `identity.users.argon2_hash` stores the Argon2id hash for Project A's Better Auth verification.

**Dual-hash schema**:
```sql
ALTER TABLE identity.users
  ADD COLUMN argon2_hash VARCHAR;  -- Argon2id hash for Project A
-- password_hash remains as bcrypt hash for Project B
```

**Rehash-on-login flow**:

```
User logs in via Project B (bcrypt):
  1. Verify password against bcrypt hash → success
  2. Check if argon2_hash is NULL
  3. If NULL: hash password with Argon2id → store in argon2_hash
  4. Return JWT

User logs in via Project A (Argon2id):
  1. Verify password against argon2_hash → success
  2. Check if password_hash (bcrypt) is NULL
  3. If NULL: hash password with bcrypt → store in password_hash
  4. Return Better Auth session
```

**New user registration** (always via Project B):
```typescript
// In user.repository.ts createAsync():
const bcryptHash = await bcrypt.hash(password, 10);
const argon2Hash = await argon2.hash(password, ARGON2_OPTIONS);
user.passwordHash = bcryptHash;
user.argon2Hash = argon2Hash;
```

**Password change** (always via Project B):
```typescript
// Same dual-hash generation as registration
```

### 4.6 Email Normalization Strategy

**Current state** — three different approaches:

| Project | Function | Output |
|---------|----------|--------|
| Project A (Better Auth) | None explicit | Raw email as provided |
| Project B (stringUtil) | `email.trim().toLowerCase()` | `user@example.com` |
| Project B (User entity constructor) | `request.email?.toUpperCase()` | `USER@EXAMPLE.COM` |

**Problem**: `normalizedEmail` in `identity.users` uses `toUpperCase()` but lookup queries use `toLowerCase()`. This is a latent bug — queries matching `normalizedEmail` would fail for mixed-case emails.

**Standardized strategy**:

1. **Canonical email**: `email` column stores the original email (trimmed, lowercased)
2. **Normalized email**: `normalized_email` column stores `email.toUpperCase()` — used for case-insensitive lookups via a PostgreSQL unique index
3. **Lookup queries**: Always use `WHERE LOWER(email) = LOWER($1)` or `WHERE normalized_email = UPPER($1)`
4. **Both projects normalize identically**: `email.trim().toLowerCase()` before storage

**Migration**:
```sql
-- Fix existing data
UPDATE identity.users
SET normalized_email = UPPER(email),
    email = LOWER(TRIM(email));
```

---

## 5. JWT Token Architecture

### 5.1 Token Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                         TOKEN LIFECYCLE                               │
│                                                                      │
│  ┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────────┐ │
│  │ Login   │────▶│ Access   │────▶│ Refresh  │────▶│ New Access  │ │
│  │ (B)     │     │ Token    │     │ Token    │     │ Token       │ │
│  └─────────┘     └──────────┘     └──────────┘     └─────────────┘ │
│       │               │                │                    │        │
│       │               │                │                    │        │
│       ▼               ▼                ▼                    ▼        │
│  User verifies   JWT signed by    Stored in           New JWT with  │
│  password via    Project B with   userLogins table    fresh claims  │
│  bcrypt          shared secret    (identity schema)                 │
│                                                                      │
│  Project A can verify the same JWT using the shared secret           │
│  (or a separate verification endpoint)                               │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 JWT Signing Configuration

| Parameter | Value | Source |
|-----------|-------|--------|
| Algorithm | HS256 | `@nestjs/jwt` default |
| Secret | `configs.jwt.secret` | Environment variable `JWT_SECRET` |
| Issuer | `configs.jwt.issuer` | Configurable |
| Audience | `configs.jwt.audience` | Configurable |
| Access token TTL | `configs.jwt.accessTokenExpiration` | Configurable |
| Refresh token TTL | `configs.jwt.refreshTokenExpiration` | Stored in `userLogins` |

### 5.3 Project A JWT Verification

Project A needs to verify JWTs issued by Project B for server-side rendering (Next.js middleware, API routes). Two approaches:

**Approach 1: Shared secret (recommended)**
- Project A reads the same `JWT_SECRET` environment variable
- Uses `jsonwebtoken` or Better Auth's JWT verification to decode and validate
- No network call required

**Approach 2: JWKS endpoint**
- Project B exposes a `/.well-known/jwks.json` endpoint
- Project A fetches and caches the public key
- More secure (rotatable keys) but adds complexity

**Recommendation**: Approach 1 (shared secret) for current scale. Migrate to JWKS when rotation becomes necessary.

### 5.4 Claims Preservation

All 14 current JWT claims are preserved. The `securityStamp` and `concurrencyStamp` claims remain because:
- Frontend `JwtPayload` type requires them (`E:\SocialApp\src\types\jwtPayload.type.ts:15-16`)
- Frontend `ClaimTypes` constants reference them (`E:\SocialApp\src\constants\globals.ts:5-6`)
- Removing them violates the "no frontend changes" hard constraint (Decision 4, Option A)

**Security note**: `securityStamp` and `concurrencyStamp` are already exposed to the client in production. This is existing behavior, not a new exposure.

### 5.5 Token Exchange Flow (Project A → Project B)

For Project A to make authenticated API calls to Project B:

```
┌──────────────┐                          ┌──────────────┐
│  Project A   │                          │  Project B   │
│  (Next.js)   │                          │  (NestJS)    │
└──────┬───────┘                          └──────┬───────┘
       │                                         │
       │  1. User logs in via Project B's login  │
       │     endpoint (frontend → Project B)     │
       │────────────────────────────────────────▶│
       │                                         │
       │  2. Project B returns JWT + refresh     │
       │◀────────────────────────────────────────│
       │                                         │
       │  3. Frontend stores JWT in cookie       │
       │     (shared .gaddr.com domain)          │
       │                                         │
       │  4. Project A reads JWT from cookie     │
       │     (cross-subdomain cookie)            │
       │                                         │
       │  5. Project A verifies JWT with shared  │
       │     secret (no network call)            │
       │                                         │
       │  6. Project A can call Project B API    │
       │     using the same JWT                  │
       │────────────────────────────────────────▶│
       │                                         │
```

---

## 6. User Lifecycle

### 6.1 Ownership Matrix

| Lifecycle Event | Owner | Who Executes | Who Is Affected |
|----------------|-------|-------------|-----------------|
| **Create (email/password)** | Project B | `RegisterCommandHandler` | `identity.users` written by B; `public.user` NOT written (A is consumer only) |
| **Create (Google OAuth)** | Project B | `GoogleConnectCallbackQueryHandler` | Same as above |
| **Create (Facebook OAuth)** | Project B | `FacebookConnectCallbackQueryHandler` | Same as above |
| **Login** | Project B | `LoginCommandHandler` | JWT issued by B; `identity.userLogins` row created by B |
| **2FA Setup** | Project B | `Setup2FACommandHandler` | TOTP secret stored in `identity.users` |
| **2FA Verify** | Project B | `Verify2FACommandHandler` | Full JWT issued after 2FA |
| **Password Change** | Project B | `ResetPasswordCommandHandler` | Both `password_hash` and `argon2_hash` updated |
| **Password Reset Request** | Project B | `ForgotPasswordCommandHandler` | Verification token created by B |
| **Password Reset Execution** | Project B | `ResetPasswordCommandHandler` | Both hash columns updated |
| **Email Update** | Project B | `UpdateEmailHandler` | `identity.users.email` updated |
| **Profile Update** | Project B | Various handlers | `identity.users` columns updated by B |
| **Suspend/Deactivate** | Project B | `DeactivateUserHandler` | `identity.users.isActive = false` |
| **Hard Delete** | Project B | Admin operation | Cascade via FK constraints |
| **Session Validation** | Both | A: Better Auth middleware; B: `HttpContextMiddleware` | Both read from `identity.users` |

### 6.2 Create User Flow

```
┌──────────┐     ┌──────────────┐     ┌─────────────────┐
│ Frontend  │────▶│ Project B    │────▶│ identity.users  │
│ (SocialApp)    │ Register     │     │ (write)         │
└──────────┘     │ Handler      │     └─────────────────┘
                 └──────┬───────┘
                        │
                        │ Creates user with:
                        │ - bcrypt hash (password_hash)
                        │ - argon2 hash (argon2_hash)
                        │ - UUID PK
                        │ - All profile columns
                        │
                        │ Returns UserModel to frontend
                        │
                 ┌──────▼───────┐
                 │ Project A    │
                 │ reads from   │
                 │ identity.users│
                 │ for its pages │
                 └──────────────┘
```

**Key point**: Project A does NOT create users in `public.user`. All user creation goes through Project B into `identity.users`. Better Auth in Project A can still manage sessions for users it reads from `identity.users`.

### 6.3 Delete User Flow

```
1. Admin deactivates user via Project B endpoint
   → identity.users.is_active = false
   → identity.user_sessions (if exists) invalidated

2. Background cleanup job:
   a. Transfer owned playlists
   b. Anonymize analytics events
   c. Remove follow relationships
   d. Remove user topics

3. Hard delete (after grace period):
   → FK RESTRICT on feature tables prevents accidental deletion
   → Must explicitly remove feature data first
   → CASCADE on identity sub-tables (profile, security, sessions)

4. Project A Better Auth sessions invalidated on next request
   (session.user_id FK to identity.users cascades)
```

---

## 7. Cross-Project FK Strategy

### 7.1 The Problem

Project A's Better Auth tables (`session`, `account`, `passkey`) have FKs to `public.user.id` (text). Project B's tables have FKs to `identity.users.id` (UUID). Cross-project FK constraints are impossible without matching PK types.

### 7.2 Short-Term: userIdMapping Bridge

Until Project A migrates to UUID PKs, the `user_id_mapping` table serves as the bridge:

```sql
CREATE TABLE user_id_mapping (
  jobs_text_id TEXT PRIMARY KEY,     -- public.user.id (nanoid)
  gaddr_uuid   UUID NOT NULL UNIQUE, -- identity.users.id
  migrated_at  TIMESTAMP DEFAULT NOW()
);
```

**Cross-project query pattern**:
```sql
-- Project A needs to look up a user by Project B's UUID
SELECT u.* FROM public.user u
JOIN user_id_mapping m ON m.jobs_text_id = u.id
WHERE m.gaddr_uuid = $1;

-- Project B needs to look up a user by Project A's text ID
SELECT u.* FROM identity.users u
JOIN user_id_mapping m ON m.gaddr_uuid = u.id
WHERE m.jobs_text_id = $1;
```

### 7.3 Medium-Term: UUID PK on Project A

After Project A switches to UUID PKs:

1. Better Auth's `databaseHooks.user.create.before` generates UUIDs
2. `user_id_mapping` is no longer needed for new users
3. Existing text IDs are migrated via a background job
4. `user_id_mapping` table is dropped

### 7.4 FK Constraint Rules

| Relationship | onDelete | Rationale |
|-------------|----------|-----------|
| Better Auth session → user | CASCADE | Session invalidation on user delete |
| Better Auth account → user | CASCADE | OAuth link removal on user delete |
| Better Auth passkey → user | CASCADE | Passkey removal on user delete |
| identity.userLogins → user | CASCADE | Session cleanup on user delete |
| identity.userBiometrics → user | CASCADE | Profile images cleaned up |
| identity.userRoles → user | CASCADE | Role assignments cleaned up |
| identity.userClaims → user | CASCADE | Permission claims cleaned up |
| public.playlists → user | RESTRICT | Prevent accidental data loss |
| public.userContents → user | RESTRICT | Content preservation |
| public.userFollows → user | RESTRICT | Social graph preservation |

---

## 8. Authentication Flow Diagrams

### 8.1 Email/Password Login

```
┌──────────┐          ┌──────────────┐          ┌──────────────────┐
│ Frontend  │          │ Project B    │          │ identity.users   │
│           │          │ LoginHandler │          │                  │
└─────┬────┘          └──────┬───────┘          └────────┬─────────┘
      │                      │                           │
      │ POST /auth/access-token                         │
      │ {email, password, deviceId,                     │
      │  userAgent, ipAddress}                          │
      │─────────────────────▶│                           │
      │                      │                           │
      │                      │ 1. normalizeEmail(email)  │
      │                      │    → trim().toLowerCase()  │
      │                      │                           │
      │                      │ 2. getUserByEmail()       │
      │                      │──────────────────────────▶│
      │                      │                           │
      │                      │ 3. bcrypt.compare(pwd,    │
      │                      │    user.passwordHash)     │
      │                      │    → true/false            │
      │                      │                           │
      │                      │ 4. Check emailConfirmed   │
      │                      │    Check isActive         │
      │                      │    Check !isLockedOut     │
      │                      │                           │
      │                      │ 5. If 2FA enabled:        │
      │                      │    generate2FAJwt()       │
      │                      │    → 5min intermediate JWT │
      │                      │    {TwoFARequired: true}   │
      │                      │                           │
      │                      │ 6. If no 2FA:             │
      │                      │    generateJwtAsync()     │
      │                      │    → full JWT with claims  │
      │                      │    createLogin()          │
      │                      │    → refresh token row     │
      │                      │    cacheUserAccount()     │
      │                      │    → Redis cache           │
      │                      │                           │
      │ ◀──── TokenResponseModel ──────────────────────│
      │ {access_token, refresh_token,                   │
      │  isTwoFARequired, onboardingCompleted}          │
      │                      │                           │
      │ 7. Store tokens in cookies                      │
      │    (access_token, refresh_token)                 │
      │                      │                           │
```

### 8.2 2FA Login Flow

```
┌──────────┐          ┌──────────────┐          ┌──────────────────┐
│ Frontend  │          │ Project B    │          │ identity.users   │
│           │          │              │          │                  │
└─────┬────┘          └──────┬───────┘          └────────┬─────────┘
      │                      │                           │
      │ [After step 5 above, frontend has 2FA JWT]       │
      │                      │                           │
      │ POST /auth/2fa/verify                           │
      │ Header: Authorization: Bearer <2FA-JWT>         │
      │ Body: {userOTP, deviceId, userAgent, ipAddress}  │
      │─────────────────────▶│                           │
      │                      │                           │
      │                      │ 1. HttpContext extracts    │
      │                      │    userId from 2FA JWT    │
      │                      │                           │
      │                      │ 2. getUserById()          │
      │                      │──────────────────────────▶│
      │                      │                           │
      │                      │ 3. speakeasy.totp.verify() │
      │                      │    with user.twoFactorSecret│
      │                      │                           │
      │                      │ 4. Check deviceId matches  │
      │                      │    2FA JWT's device-id     │
      │                      │                           │
      │                      │ 5. generateJwtAsync()     │
      │                      │    → full JWT              │
      │                      │    createLogin()          │
      │                      │    → refresh token         │
      │                      │    cacheUserAccount()     │
      │                      │                           │
      │ ◀──── TokenResponseModel ──────────────────────│
      │ {access_token, refresh_token, succeeded: true}   │
      │                      │                           │
```

### 8.3 Registration Flow

```
┌──────────┐          ┌──────────────┐          ┌──────────────────┐
│ Frontend  │          │ Project B    │          │ identity.users   │
│           │          │ RegisterHandler│         │                  │
└─────┬────┘          └──────┬───────┘          └────────┬─────────┘
      │                      │                           │
      │ POST /auth/register  │                           │
      │ {email, password,    │                           │
      │  firstName, lastName,│                           │
      │  userAgent, ipAddress,│                          │
      │  referralCode?}      │                           │
      │─────────────────────▶│                           │
      │                      │                           │
      │                      │ 1. normalizeEmail(email)  │
      │                      │ 2. Check existing user    │
      │                      │──────────────────────────▶│
      │                      │                           │
      │                      │ 3. Generate initials avatar│
      │                      │    Upload to Cloudinary    │
      │                      │                           │
      │                      │ 4. Create User entity:    │
      │                      │    - UUID PK (auto-gen)   │
      │                      │    - bcrypt.hash(pwd, 10) │
      │                      │    - argon2.hash(pwd)     │
      │                      │    - securityStamp = random│
      │                      │    - concurrencyStamp = UUID│
      │                      │    - normalizedEmail =     │
      │                      │      email.toUpperCase()   │
      │                      │──────────────────────────▶│
      │                      │                           │
      │                      │ 5. Create UserBiometric   │
      │                      │    (profile image)         │
      │                      │                           │
      │                      │ 6. SendVerificationEmail  │
      │                      │                           │
      │                      │ 7. Apply referralCode     │
      │                      │    if provided             │
      │                      │                           │
      │ ◀──── UserModel ───────────────────────────────│
      │ {id, email, firstName, lastName, ...}           │
      │                      │                           │
```

### 8.4 Token Refresh Flow

```
┌──────────┐          ┌──────────────┐          ┌──────────────────┐
│ Frontend  │          │ Project B    │          │ identity.users   │
│           │          │ RefreshHandler│         │ + userLogins     │
└─────┬────┘          └──────┬───────┘          └────────┬─────────┘
      │                      │                           │
      │ POST /auth/refresh-access-token                 │
      │ Header: Authorization: Bearer <access_token>    │
      │ Body: {refreshToken, deviceId,                  │
      │        userAgent, ipAddress}                    │
      │─────────────────────▶│                           │
      │                      │                           │
      │                      │ 1. HttpContext extracts    │
      │                      │    userId from JWT         │
      │                      │                           │
      │                      │ 2. getUserById()          │
      │                      │──────────────────────────▶│
      │                      │                           │
      │                      │ 3. getByTokenValueAnd     │
      │                      │    DeviceIdAsync()        │
      │                      │    → validate refresh token│
      │                      │──────────────────────────▶│ (userLogins)
      │                      │                           │
      │                      │ 4. Check token not expired│
      │                      │ 5. Validate securityStamp │
      │                      │    matches JWT claim       │
      │                      │                           │
      │                      │ 6. generateJwtAsync()     │
      │                      │    → new access token      │
      │                      │    (includes latest claims)│
      │                      │                           │
      │                      │ 7. Rotate refresh token   │
      │                      │    → new tokenValue        │
      │                      │    → new expiryDate        │
      │                      │──────────────────────────▶│ (update userLogins)
      │                      │                           │
      │ ◀──── TokenResponseModel ──────────────────────│
      │ {access_token, refresh_token,                   │
      │  onboardingCompleted, refreshTokenExpiryTime}    │
      │                      │                           │
```

### 8.5 Google OAuth Flow

```
┌──────────┐          ┌──────────────┐          ┌──────────────────┐
│ Frontend  │          │ Project B    │          │ identity.users   │
│           │          │ GoogleAuth   │          │ + dataProtectKeys │
└─────┬────┘          └──────┬───────┘          └────────┬─────────┘
      │                      │                           │
      │ GET /auth/google/connect                        │
      │ ?deviceId=...&userAgent=...&ipAddress=...       │
      │─────────────────────▶│                           │
      │                      │                           │
      │                      │ 1. Generate state param   │
      │                      │ 2. Store in dataProtection│
      │                      │    Keys (15min expiry)    │
      │                      │──────────────────────────▶│
      │                      │                           │
      │ ◀── {authorizeURL} ──│                           │
      │                      │                           │
      │ [User authenticates with Google]                 │
      │                      │                           │
      │ GET /auth/google/connect-callback               │
      │ ?code=...&state=...  │                           │
      │─────────────────────▶│                           │
      │                      │                           │
      │                      │ 3. Validate state         │
      │                      │ 4. Exchange code for token │
      │                      │ 5. Fetch Google profile   │
      │                      │ 6. normalizeEmail()       │
      │                      │                           │
      │                      │ 7. Find by googleId       │
      │                      │    or by email            │
      │                      │──────────────────────────▶│
      │                      │                           │
      │                      │ 8. If not found: create   │
      │                      │    new user with:         │
      │                      │    - UUID PK              │
      │                      │    - bcrypt rand password │
      │                      │    - argon2 rand password │
      │                      │    - emailConfirmed: true │
      │                      │    - googleId set         │
      │                      │──────────────────────────▶│
      │                      │                           │
      │                      │ 9. handleSuccessfulLogin()│
      │                      │    → JWT + refresh token   │
      │                      │                           │
      │ ◀── GoogleCallbackTokenResponse ───────────────│
      │ {access_token, refresh_token,                   │
      │  googleAccessToken, googleAccessTokenExpiresIn}  │
      │                      │                           │
```

---

## 9. Data Synchronization Strategy

### 9.1 Real-Time vs Eventual Consistency

| Data Type | Consistency Model | Rationale |
|-----------|------------------|-----------|
| User identity (email, name) | **Strong** (single DB) | Both projects read/write the same row |
| Password hash | **Strong** (single DB) | Dual columns updated atomically |
| JWT claims | **Eventual** (token lifetime) | Claims are snapshot at token creation; new login produces fresh claims |
| Redis cache | **Eventual** (TTL-based) | `cacheUserAccountAsync` TTL-based invalidation |
| Session state | **Strong** (single DB) | `userLogins` rows are source of truth |
| Profile data | **Strong** (single DB) | Same row, same table |

### 9.2 Cache Invalidation

```
┌─────────────────────────────────────────────────────────────────┐
│                    CACHE INVALIDATION FLOW                       │
│                                                                 │
│  User updates profile via Project B                             │
│       │                                                         │
│       ▼                                                         │
│  Project B writes to identity.users                             │
│       │                                                         │
│       ▼                                                         │
│  Project B invalidates Redis cache:                             │
│  - user:{userId}:account → DELETE                               │
│  - user:{userId}:profile → DELETE                               │
│       │                                                         │
│       ▼                                                         │
│  Next request from frontend:                                    │
│  - Project B reads fresh data from DB                           │
│  - Rebuilds Redis cache                                         │
│  - Returns updated data                                         │
│                                                                 │
│  Project A reads from DB directly (no Redis dependency)         │
│  - Better Auth uses its own Redis for session storage           │
│  - Better Auth sessions are independent of JWT cache            │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Conflict Resolution

Since both projects share the same PostgreSQL database, there are no write-write conflicts at the DB level. However, logical conflicts can arise:

| Scenario | Resolution |
|----------|-----------|
| User changes email via Project B; Project A has stale cache | Project B invalidates Redis; Project A reads fresh from DB |
| User changes password via Project B; Project A has old Argon2 hash | Dual-hash update ensures both columns are current |
| User deletes account via Project B; Project A still has session | Better Auth session FK cascades → session invalidated |
| Both projects try to update `securityStamp` simultaneously | Last-write-wins (acceptable; stamp changes are infrequent) |

---

## 10. Security Considerations

### 10.1 Token Security

| Threat | Mitigation |
|--------|-----------|
| **Token theft (XSS)** | Tokens stored in httpOnly cookies (`.gaddr.com` cross-subdomain); not accessible via JavaScript |
| **Token theft (MITM)** | HTTPS only in production; HSTS headers |
| **Replay attacks** | Refresh token rotation on every use; old refresh tokens invalidated |
| **Token expiry** | Short-lived access tokens; refresh tokens have configurable TTL |
| **JWT secret compromise** | Rotate secret; invalidate all existing tokens; force re-login |

### 10.2 Cross-Project Security

| Threat | Mitigation |
|--------|-----------|
| **Project A reads Project B's JWT secret** | Shared secret via environment variable; same trust boundary |
| **Project A's Better Auth bypasses Project B's auth** | Project A does NOT serve auth endpoints to the frontend; internal use only |
| **Cross-subdomain cookie hijacking** | `.gaddr.com` domain scope; SameSite=Lax; httpOnly; Secure flags |
| **Password hash leakage** | bcrypt and Argon2id hashes are non-reversible; even with DB access, passwords cannot be recovered |

### 10.3 CSRF Protection

| Project | Protection |
|---------|-----------|
| Project A (Better Auth) | Better Auth's built-in CSRF protection (origin checking via `trustedOrigins`) |
| Project B (NestJS) | Custom CSRF protection via `x-turnstile-token` header on login/register |

### 10.4 Rate Limiting

| Project | Mechanism |
|---------|----------|
| Project A (Better Auth) | `rateLimit.enabled: !isTest` — Better Auth built-in rate limiting |
| Project B (NestJS) | `rateLimits` and `rateLimitLogs` tables in public schema |

---

## 11. Migration Plan

### 11.1 Phase Overview

| Phase | Scope | Risk | Effort | Duration |
|-------|-------|------|--------|----------|
| **Phase 0** | Environment setup, shared secrets | LOW | 1 day | Week 1 |
| **Phase 1** | Add `argon2_hash` column to `identity.users` | LOW | 1 day | Week 1 |
| **Phase 2** | Project A reads from `identity.users` (read-only) | LOW | 2 days | Week 1-2 |
| **Phase 3** | Dual-hash password generation on registration | MEDIUM | 2 days | Week 2 |
| **Phase 4** | Rehash-on-login for existing users | MEDIUM | 2 days | Week 2-3 |
| **Phase 5** | Migrate `public.user` data to `identity.users` | HIGH | 3 days | Week 3-4 |
| **Phase 6** | Override Better Auth ID generation (UUID) | HIGH | 3 days | Week 4-5 |
| **Phase 7** | Drop `public.user` table, drop `user_id_mapping` | HIGH | 1 day | Week 5 |
| **Phase 8** | Consolidate email normalization | LOW | 1 day | Week 5 |
| **Phase 9** | Monitoring and rollback readiness | LOW | Ongoing | Week 5+ |

### 11.2 Phase 0: Environment Setup

```bash
# Shared environment variables (both projects)
JWT_SECRET=<shared-secret>
DB_URL=<shared-postgres-url>

# Project A additions
ARGON2_MEMORY=65536
ARGON2_ITERATIONS=3
ARGON2_PARALLELISM=4
```

### 11.3 Phase 1: Add Argon2 Hash Column

```sql
-- Migration: Add argon2_hash column to identity.users
ALTER TABLE identity.users
  ADD COLUMN argon2_hash VARCHAR;

-- Add index for Argon2 verification
-- (no index needed — only used during password verification)
```

**Zero downtime**: Additive change. No existing code breaks.

### 11.4 Phase 2: Project A Reads from identity.users

Configure Better Auth to read from `identity.users` instead of `public.user`:

```typescript
// E:\Github\gaddep\gaddr-jobs\src\server\auth\index.ts
// Change drizzleAdapter to use identity.users schema
database: drizzleAdapter(db, {
  provider: "pg",
  schema: {
    user: identityUser,    // ← identity.users
    session: identitySession,
    account: identityAccount,
    verification: identityVerification,
    passkey: identityPasskey,
  },
}),
```

**Note**: This requires mapping Better Auth's expected columns to `identity.users` columns. Some columns exist in both tables (email, name); some exist only in one (stripeCustomerId in `public.user` only).

**Approach**: Use a PostgreSQL VIEW that joins `identity.users` with the Stripe columns from `public.user`:

```sql
CREATE OR REPLACE VIEW public.user_view AS
SELECT
  iu.id,
  iu.email,
  iu.user_name AS "name",
  iu.first_name AS "first_name",
  iu.last_name AS "last_name",
  iu.email_confirmed AS "email_verified",
  iu.google_id AS "google_id",
  pu.stripe_customer_id,
  pu.stripe_price_id,
  pu.stripe_subscription_id,
  pu.subscription_status,
  pu.subscription_plan,
  pu.job_post_limit,
  pu.active_job_post_count
FROM identity.users iu
LEFT JOIN public.user pu ON pu.id = iu.id;
```

### 11.5 Phase 3-4: Dual-Hash Migration

**Phase 3** — New users get both hashes:
```typescript
// In user.repository.ts createAsync():
import * as argon2 from '@node-rs/argon2';

const bcryptHash = await bcrypt.hash(password, 10);
const argon2Hash = await argon2.hash(password, ARGON2_OPTIONS);

user.passwordHash = bcryptHash;
user.argon2Hash = argon2Hash;
```

**Phase 4** — Existing users get Argon2 hash on next login:
```typescript
// In user.repository.ts checkPasswordAsync():
if (user.argon2Hash === null) {
  // First login after migration — generate Argon2 hash
  const argon2Hash = await argon2.hash(password, ARGON2_OPTIONS);
  await this.userContext.update(user.id, { argon2Hash });
}
return await bcrypt.compare(password, user.passwordHash);
```

### 11.6 Phase 5-7: Data Migration and Table Consolidation

**Phase 5** — Merge `public.user` into `identity.users`:
```sql
-- Copy Stripe columns from public.user to identity.users
ALTER TABLE identity.users
  ADD COLUMN stripe_customer_id VARCHAR,
  ADD COLUMN stripe_price_id VARCHAR,
  ADD COLUMN stripe_subscription_id VARCHAR,
  ADD COLUMN subscription_status VARCHAR DEFAULT 'none',
  ADD COLUMN subscription_plan VARCHAR DEFAULT 'free',
  ADD COLUMN job_post_limit INTEGER DEFAULT 1,
  ADD COLUMN active_job_post_count INTEGER DEFAULT 0,
  ADD COLUMN wallet_address VARCHAR,
  ADD COLUMN private_search_mode BOOLEAN DEFAULT false,
  ADD COLUMN blocked_employers TEXT[] DEFAULT '{}',
  ADD COLUMN ai_analysis_opt_out BOOLEAN DEFAULT false,
  ADD COLUMN source_app VARCHAR DEFAULT 'jobs',
  ADD COLUMN status VARCHAR DEFAULT 'active',
  ADD COLUMN deleted_at TIMESTAMP,
  ADD COLUMN banned_at TIMESTAMP,
  ADD COLUMN ban_reason VARCHAR;

-- Copy data from public.user to identity.users
UPDATE identity.users iu
SET
  stripe_customer_id = pu.stripe_customer_id,
  stripe_price_id = pu.stripe_price_id,
  stripe_subscription_id = pu.stripe_subscription_id,
  subscription_status = pu.subscription_status,
  subscription_plan = pu.subscription_plan,
  job_post_limit = pu.job_post_limit,
  active_job_post_count = pu.active_job_post_count,
  wallet_address = pu.wallet_address,
  private_search_mode = pu.private_search_mode,
  blocked_employers = pu.blocked_employers,
  ai_analysis_opt_out = pu.ai_analysis_opt_out,
  source_app = pu.source_app,
  status = pu.status,
  deleted_at = pu.deleted_at,
  banned_at = pu.banned_at,
  ban_reason = pu.ban_reason
FROM public.user pu
WHERE pu.id::uuid = iu.id;
```

**Phase 6** — Override Better Auth ID generation:
```typescript
// databaseHooks.user.create.before now generates UUID
databaseHooks: {
  user: {
    create: {
      before: async (user) => {
        const { v4: uuid } = await import("uuid");
        return {
          data: {
            ...user,
            id: uuid(),
          },
        };
      },
    },
  },
},
```

**Phase 7** — Drop `public.user` and `user_id_mapping`:
```sql
-- After all Project A code uses identity.users
DROP TABLE IF EXISTS public.user;
DROP TABLE IF EXISTS user_id_mapping;
```

### 11.7 Phase 8: Email Normalization Consolidation

```sql
-- Ensure all emails are lowercase and normalized_email is uppercase
UPDATE identity.users
SET
  email = LOWER(TRIM(email)),
  normalized_email = UPPER(TRIM(email))
WHERE email != LOWER(TRIM(email))
   OR normalized_email != UPPER(TRIM(email));

-- Update Project A's Better Auth config if needed
```

---

## 12. Risk Assessment

### 12.1 Risk Matrix

| Risk ID | Risk Description | Likelihood | Impact | Severity | Mitigation |
|---------|-----------------|-----------|--------|----------|-----------|
| R-001 | Project A Better Auth breaks after DB switch | MEDIUM | HIGH | **HIGH** | Use VIEW as adapter; gradual migration; rollback plan |
| R-002 | Existing users can't login after migration | LOW | CRITICAL | **HIGH** | Dual-hash ensures bcrypt still works; rollback to Phase 1 |
| R-003 | UUID migration corrupts existing data | LOW | HIGH | **MEDIUM** | UUID migration only affects new users initially; background job for existing |
| R-004 | Cross-subdomain cookie domain mismatch | LOW | HIGH | **MEDIUM** | Test cookie domain in staging; `.gaddr.com` confirmed in Better Auth config |
| R-005 | JWT secret rotation causes mass logout | LOW | MEDIUM | **LOW** | Coordinate rotation; use old secret as fallback during transition |
| R-006 | Redis cache inconsistency between projects | MEDIUM | LOW | **LOW** | TTL-based invalidation; eventual consistency acceptable |
| R-007 | Argon2id dependency installation fails | LOW | MEDIUM | **LOW** | Test in CI/CD; fallback to bcrypt-only temporarily |
| R-008 | Email normalization mismatch causes duplicate accounts | LOW | HIGH | **MEDIUM** | UNIQUE constraint on normalized_email; migration script to fix |
| R-009 | Performance degradation from dual-hash verification | LOW | LOW | **LOW** | Argon2id is ~100ms; acceptable for login frequency |
| R-010 | Better Auth schema incompatibility with identity.users | MEDIUM | HIGH | **HIGH** | Thorough column mapping; use VIEW if direct mapping fails |

### 12.2 Rollback Strategy

| Phase | Rollback Action | Data Loss Risk |
|-------|----------------|---------------|
| Phase 0 | Remove env vars | None |
| Phase 1 | `ALTER TABLE DROP COLUMN argon2_hash` | None |
| Phase 2 | Revert Better Auth config to `public.user` | None |
| Phase 3-4 | Stop dual-hash generation; existing hashes remain | None |
| Phase 5 | Truncate identity.users additions from public.user | None (original data in public.user) |
| Phase 6-7 | **Point of no return** — restore from DB backup | Possible if backup not taken |

**Critical**: Full database backup before Phase 5. Phase 7 (table drop) is the point of no return.

---

## 13. ADR (Architecture Decision Records)

### ADR-001: Project B Retains Auth Ownership

**Status**: Accepted (Doc 12, Decision 1, Option A)

**Context**: Doc 07 proposed removing auth endpoints from Project B. However, the frontend exclusively calls Project B's 14 auth controllers for all auth flows.

**Decision**: Project B retains all 14 auth controllers. Project A's Better Auth is internal-only.

**Consequences**:
- Positive: Zero frontend changes. All API contracts preserved.
- Positive: Minimal migration risk.
- Negative: Two auth systems coexist (Better Auth in A, JWT in B).
- Negative: Project B carries auth complexity.

### ADR-002: identity.users Is Canonical

**Status**: Accepted (Doc 12, Decision 2, Option A)

**Context**: Two user tables exist — `public.user` (text PK, 38 columns) and `identity.users` (UUID PK, 38 columns). 18+ tables have FK dependencies on `identity.users`.

**Decision**: `identity.users` is the single source of truth. `public.user` is migrated and dropped.

**Consequences**:
- Positive: 18+ FK constraints remain intact.
- Positive: UUID PK is globally unique and TypeORM-native.
- Negative: Project A must change its Better Auth config.
- Negative: Data migration required for ~49 users.

### ADR-003: UUID Everywhere

**Status**: Accepted (Doc 12, Decision 3, Option A)

**Context**: Project A uses text PKs (nanoid), Project B uses UUID PKs. FK constraints cannot span both.

**Decision**: All user IDs are UUIDs. Project A overrides Better Auth's ID generation.

**Consequences**:
- Positive: Eliminates `user_id_mapping` table.
- Positive: Consistent FK constraints across projects.
- Negative: Better Auth does not natively support UUID PKs — requires `databaseHooks` override.
- Negative: Existing text IDs require migration.

### ADR-004: JWT Claims Preserved

**Status**: Accepted (Doc 12, Decision 4, Option A)

**Context**: Frontend reads `securityStamp` and `concurrencyStamp` from JWT. Removing them breaks TypeScript compilation.

**Decision**: Keep all 14 JWT claims. No frontend changes.

**Consequences**:
- Positive: Zero frontend changes.
- Positive: No TypeScript compilation breaks.
- Negative: Security stamps exposed to client (existing behavior, not new).

### ADR-005: Dual-Hash Password Strategy

**Status**: Accepted (Doc 12, Decision 5, Option A)

**Context**: Project A uses Argon2id, Project B uses bcrypt. Passwords created in one project cannot be verified by the other.

**Decision**: Dual-hash with rehash-on-login. Both `password_hash` (bcrypt) and `argon2_hash` (Argon2id) columns stored.

**Consequences**:
- Positive: Both projects work immediately.
- Positive: No forced password resets.
- Negative: Two hash columns in the user table.
- Negative: Two verification paths in code.

---

## 14. Assumptions and Constraints

### 14.1 Assumptions

| # | Assumption | Validation |
|---|-----------|-----------|
| A-1 | Both projects connect to the same PostgreSQL instance | Confirmed: same DB URL in env configs |
| A-2 | `identity.users` has ~49 rows from the merger migration | Confirmed: Doc 12 references 49 rows |
| A-3 | Better Auth 1.5.6 supports `databaseHooks.user.create.before` for ID override | Confirmed: `auth/index.ts:114-163` shows working hook |
| A-4 | Frontend exclusively calls Project B for auth | Confirmed: `E:\SocialApp\src\services\api\token.service.ts` routes all `/auth/*` to Project B |
| A-5 | Frontend `JwtPayload` type requires `SecurityStamp` and `ConcurrencyStamp` | Confirmed: `jwtPayload.type.ts:15-16` |
| A-6 | Project B has 14 auth controllers | Confirmed: `features/auth/index.ts:79-94` lists 14 controllers |
| A-7 | Project B has 55+ total endpoints | Confirmed: glob shows 100+ endpoint files |
| A-8 | bcrypt cost 10 is used for password hashing | Confirmed: `user.repository.ts:79` |
| A-9 | Argon2id is Better Auth's default hasher | Confirmed: Better Auth documentation |
| A-10 | Both projects share the `.gaddr.com` domain | Confirmed: `auth/index.ts:31` — `trustedOrigins` includes `gaddr.com` |

### 14.2 Constraints

| # | Constraint | Source |
|---|-----------|--------|
| C-1 | **No frontend changes.** SocialApp TypeScript code must not be modified. | Hard constraint from Doc 12 |
| C-2 | **No API contract changes.** All existing endpoints and request/response shapes remain identical. | Hard constraint from Doc 12 |
| C-3 | **No downtime.** All migrations must be zero-downtime. | Operational requirement |
| C-4 | **Rollback at every phase.** Each migration phase must be reversible (except Phase 7+). | Risk mitigation |
| C-5 | **Single PostgreSQL database.** Both projects share one DB instance. | Architectural decision |
| C-6 | **Project B is the sole external auth provider.** All frontend auth flows go through Project B. | Decision 1 (Option A) |

---

## 15. Open Questions

| # | Question | Impact | Proposed Resolution |
|---|---------|--------|-------------------|
| Q-1 | Should Project A use the same JWT secret as Project B, or a separate verification key? | Security scope | Use same secret initially; migrate to asymmetric keys (RS256) when rotation is needed |
| Q-2 | How should Better Auth handle the Argon2id ↔ bcrypt dual-hash when Project A needs to verify passwords? | Auth flow | Project A reads `argon2_hash` column; does not attempt bcrypt verification |
| Q-3 | Should the `user_id_mapping` table be kept during Phase 2-6 as a safety net? | Migration safety | Yes — keep until Phase 7 confirms all references updated |
| Q-4 | What happens to existing Better Auth sessions when the DB switch occurs in Phase 2? | Session continuity | Sessions are invalidated; users must re-login once. acceptable for ~49 users |
| Q-5 | Should email verification be unified? Both projects have independent verification flows. | User experience | Keep separate for now; both write to `identity.users.email_confirmed` |
| Q-6 | Should Project A's passkey support be disabled after the migration? | Feature scope | No — passkeys remain but now reference `identity.users.id` (UUID) |
| Q-7 | How should `source_app` column be handled? Project A defaults to 'jobs', Project B doesn't use it. | Data model | Add `source_app` to `identity.users` with default 'gaddr'; set on registration |
| Q-8 | Should the dual-hash strategy include a background job to pre-hash all existing users? | Migration speed | Optional — rehash-on-login is sufficient for 49 users; pre-hashing is a nice-to-have |

---

## Appendix A: File Reference Index

### Project A (gaddr-jobs)

| File | Purpose | v2 Impact |
|------|---------|-----------|
| `src/server/auth/index.ts` | Better Auth config | Phase 2: Switch to identity.users; Phase 6: UUID override |
| `src/server/db/auth-schema.ts` | Drizzle schema (user, session, account, verification, passkey, userIdMapping) | Phase 6-7: Modify PK type; Phase 7: Drop userIdMapping |
| `src/server/redis.ts` | ioredis client | No change |
| `src/server/db/schema.ts` | Full DB schema | Phase 2: Add identity.users mapping |

### Project B (gaddr-backend-api)

| File | Purpose | v2 Impact |
|------|---------|-----------|
| `src/domain/entities/identity/user.entity.ts` | User entity (38 columns) | Phase 1: Add argon2Hash column |
| `src/domain/baseEntity.ts` | BaseEntity with UUID PK | No change |
| `src/infrastructure/services/token.service.ts` | JWT generation (14 claims) | No change — all claims preserved |
| `src/infrastructure/repositories/user.repository.ts` | bcrypt hash/verify | Phase 3: Add argon2 dual-hash |
| `src/core/globals.ts` | ClaimTypes URIs | No change — all 14 URIs preserved |
| `src/core/utils/string.util.ts` | normalizeEmail | Phase 8: Ensure consistent normalization |
| `src/core/passport/jwtPayload.ts` | JwtPayload interface | No change |
| `src/features/auth/index.ts` | 14 auth controllers | No change — all retained per Decision 1 |
| `src/features/auth/login/login.handler.ts` | Login flow | No change |
| `src/features/auth/register/register.handler.ts` | Registration flow | Phase 3: Dual-hash on create |
| `src/features/auth/refresh-token/refresh-token.handler.ts` | Token refresh | No change |
| `src/features/auth/2fa/verify/2fa-verify.handler.ts` | 2FA verification | No change |
| `src/features/auth/external/google-auth/google-auth.handler.ts` | Google OAuth | Phase 3: Dual-hash on OAuth create |

### Frontend (SocialApp) — READ ONLY

| File | Purpose | v2 Impact |
|------|---------|-----------|
| `src/services/api/token.service.ts` | Auth API calls | **NONE** — no changes |
| `src/types/jwtPayload.type.ts` | JWT type definition | **NONE** — all claims preserved |
| `src/constants/globals.ts` | ClaimTypes constants | **NONE** — all URIs preserved |

### Documentation

| File | Purpose |
|------|---------|
| `docs/04_Shared_Identity_Architecture.md` | v1 architecture (superseded) |
| `docs/04_Shared_Identity_Architecture_v2.md` | This document |
| `docs/12_Critical_Blocker_Decisions.md` | Decision matrix for 5 blockers |

---

## Appendix B: Column Mapping (public.user → identity.users)

| public.user Column | identity.users Column | Migration Action |
|-------------------|----------------------|-----------------|
| `id` (text/nanoid) | `id` (uuid) | Map via userIdMapping; override with UUID in Phase 6 |
| `name` | `first_name` + `last_name` | Split or use `user_name` |
| `email` | `email` | Direct copy |
| `email_verified` | `email_confirmed` | Direct copy |
| `image` | → `userBiometrics.profileImageUrl` | Move to biometrics table |
| `created_at` | `created_on` | Direct copy |
| `updated_at` | `last_modified_on` | Direct copy |
| `first_name` | `first_name` | Direct copy |
| `last_name` | `last_name` | Direct copy |
| `role` | → `identity.roles` + `identity.userRoles` | Create role assignment |
| `two_factor_enabled` | `two_factor_enabled` | Direct copy |
| `is_admin` | → `identity.roles` (Admin role) | Create role assignment |
| `stripe_customer_id` | `stripe_customer_id` | Add column; copy |
| `stripe_price_id` | `stripe_price_id` | Add column; copy |
| `stripe_subscription_id` | `stripe_subscription_id` | Add column; copy |
| `subscription_status` | `subscription_status` | Add column; copy |
| `subscription_plan` | `subscription_plan` | Add column; copy |
| `job_post_limit` | `job_post_limit` | Add column; copy |
| `active_job_post_count` | `active_job_post_count` | Add column; copy |
| `wallet_address` | `wallet_address` | Add column; copy |
| `private_search_mode` | `private_search_mode` | Add column; copy |
| `blocked_employers` | `blocked_employers` | Add column; copy |
| `ai_analysis_opt_out` | `ai_analysis_opt_out` | Add column; copy |
| `google_id` | `google_id` | Direct copy |
| `phone_number` | `phone_number` | Direct copy |
| `gender` | `gender` | Direct copy |
| `date_of_birth` | (no equivalent) | Add column if needed |
| `onboarding_step` | `onboarding_step` | Direct copy |
| `referral_code` | `referral_code` | Direct copy |
| `referred_by` | `referred_by` | Direct copy |
| `profile_privacy` | `profile_privacy` | Direct copy (enum mapping) |
| `source_app` | `source_app` | Add column; copy |
| `status` | `status` | Add column; copy |
| `deleted_at` | `deleted_at` | Add column; copy |
| `banned_at` | `banned_at` | Add column; copy |
| `ban_reason` | `ban_reason` | Add column; copy |
