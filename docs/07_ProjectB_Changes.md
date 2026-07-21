# 07 — Project B Change Plan

> Session 7 deliverable. Execution plan for Project B adaptation.
> **Constraint**: Project B does not own the identity schema. Project A does.
> **Constraint**: No frontend changes. Backend only.

---

## Table of Contents

1. [Scope & Constraints](#1-scope--constraints)
2. [What Project B Must Stop Doing](#2-what-project-b-must-stop-doing)
3. [Entity Changes](#3-entity-changes)
4. [Column-Level Change Map](#4-column-level-change-map)
5. [Code Removals](#5-code-removals)
6. [Code Adaptations](#6-code-adaptations)
7. [New Code Required](#7-new-code-required)
8. [Files Changed Summary](#8-files-changed-summary)
9. [Execution Order](#9-execution-order)
10. [Verification](#10-verification)

---

## 1. Scope & Constraints

### 1.1 The Rule

Project A owns `identity.users`. Project B reads it. Project B never writes to it, never migrates it, never adds columns to it.

### 1.2 What Project B Keeps

| Concern | Keeps? | Notes |
|---------|--------|-------|
| JWT token generation | Yes | Reads identity columns, builds token |
| Auth guards | Yes | Validates JWT claims |
| Login flow | Yes | Authenticates, creates sessions |
| Registration flow | **No** | Project A owns signup |
| Password reset | **No** | Project A owns password lifecycle |
| Email verification | **No** | Project A owns email lifecycle |
| 2FA setup/verify | **No** | Project A owns 2FA |
| OAuth (Google/Facebook) | **No** | Project A owns OAuth |
| User profile updates | **No** | Project A owns profile writes |
| Onboarding | **No** | Project A owns onboarding |
| User entity definition | **No** | Project A owns the schema |
| FK constraints to `identity.users` | Yes | Project B adds these |
| Feature tables in `public`/`analytics`/`notification` | Yes | Project B owns these |

### 1.3 What Project B Adapts

| Concern | Adapts? | Notes |
|---------|---------|-------|
| User entity columns | Yes | Match Project A's 38-column schema |
| UserRepository queries | Yes | Use Project A's column names |
| JWT token claims | Yes | Read from Project A's columns |
| HttpContext middleware | Yes | Remove Better Auth fallback |
| Mappers | Yes | Map Project A's columns |

---

## 2. What Project B Must Stop Doing

### 2.1 Remove Auth Flows Project A Owns

| Feature | File | Action |
|---------|------|--------|
| Registration | `src/features/auth/register/` | Delete directory |
| Password reset | `src/features/auth/reset-password/` | Delete directory |
| Forgot password | `src/features/auth/forgot-password/` | Delete directory |
| Email verify | `src/features/auth/verify-email/` | Delete directory |
| 2FA setup | `src/features/auth/2fa/setup/` | Delete directory |
| 2FA enable | `src/features/auth/2fa/enable/` | Delete directory |
| 2FA disable | `src/features/auth/2fa/disable/` | Delete directory |
| 2FA verify | `src/features/auth/2fa/verify/` | Delete directory |
| Google OAuth | `src/features/auth/external/google-auth/` | Delete directory |
| Facebook OAuth | `src/features/auth/external/facebook-auth/` | Delete directory |
| User profile update | `src/features/user/update/` | Delete directory |
| Onboarding steps | `src/features/onboarding/` | Delete directory |
| Activate user | `src/features/user/activate-user/` | Delete directory |
| Deactivate user | `src/features/user/deactivate-user/` | Delete directory |

### 2.2 Remove Identity Entity Definitions

| File | Action |
|------|--------|
| `src/domain/entities/identity/user.entity.ts` | Delete — Project A owns this |
| `src/domain/entities/identity/role.entity.ts` | Keep (Project B uses roles for its own features) |
| `src/domain/entities/identity/userRole.entity.ts` | Keep (Project B uses roles) |
| `src/domain/entities/identity/userClaim.entity.ts` | Keep (Project B uses claims) |
| `src/domain/entities/identity/roleClaim.entity.ts` | Keep (Project B uses claims) |
| `src/domain/entities/identity/userLogin.entity.ts` | Keep — Project B manages its own sessions |
| `src/domain/entities/identity/userBiometric.entity.ts` | Delete — Project A owns biometrics |
| `src/domain/entities/identity/userPreference.entity.ts` | Delete — Project A owns preferences |
| `src/domain/entities/userFollow.entity.ts` | Keep (Project B feature) |

### 2.3 Remove Auth Services Project A Owns

| File | Action |
|------|--------|
| `src/infrastructure/services/token.service.ts` | Rewrite — remove column writes, keep reads |
| `src/infrastructure/services/email.service.ts` | Delete — Project A owns email sending |
| `src/infrastructure/services/better-auth.service.ts` | Delete — Project A owns Better Auth |

---

## 3. Entity Changes

### 3.1 User Entity Replacement

Project B currently defines `identity.users` with 30+ columns. This entity must be replaced with a **read-only view** matching Project A's 38-column schema.

**New file**: `src/domain/entities/identity/user.entity.ts`

```typescript
// Read-only entity — Project A owns the schema
// This entity exists ONLY for TypeORM query compatibility
@Entity({ name: 'users', schema: 'identity' })
export class User extends BaseEntity {
  // --- Core Auth (from Better Auth) ---
  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  image: string;

  // --- Additional Fields ---
  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  role: string;

  @Column({ default: false })
  isAdmin: boolean;

  // --- 2FA ---
  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true })
  twoFaVerifiedAt: Date;

  // --- Verification ---
  @Column({ default: false })
  isVerified: boolean;

  // --- Stripe/Billing ---
  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column({ nullable: true })
  stripePriceId: string;

  @Column({ nullable: true })
  stripeSubscriptionId: string;

  @Column({ default: 'none' })
  subscriptionStatus: string;

  @Column({ default: 'free' })
  subscriptionPlan: string;

  @Column({ default: 1 })
  jobPostLimit: number;

  @Column({ default: 0 })
  activeJobPostCount: number;

  // --- Privacy ---
  @Column({ default: false })
  privateSearchMode: boolean;

  @Column('simple-array', { nullable: true })
  blockedEmployers: string[];

  @Column({ default: false })
  aiAnalysisOptOut: boolean;

  // --- Crypto ---
  @Column({ nullable: true })
  walletAddress: string;

  // --- Merger Fields ---
  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true, default: 'not_started' })
  onboardingStep: string;

  @Column({ nullable: true, unique: true })
  referralCode: string;

  @Column({ nullable: true })
  referredBy: string;

  @Column({ nullable: true, default: 'public' })
  profilePrivacy: string;

  @Column({ nullable: true, default: 'jobs' })
  sourceApp: string;

  // --- Soft Delete/GDPR ---
  @Column({ nullable: true, default: 'active' })
  status: string;

  @Column({ nullable: true })
  deletedAt: Date;

  // --- Admin/Ban ---
  @Column({ nullable: true })
  bannedAt: Date;

  @Column({ nullable: true })
  banReason: string;

  // --- Relations (read-only, FK to Project A) ---
  @OneToOne(() => UserBiometric, (biometric) => biometric.user)
  biometrics: UserBiometric;

  @OneToMany(() => UserFollow, (follow) => follow.followed)
  followers: UserFollow[];

  @OneToMany(() => UserFollow, (follow) => follow.follower)
  following: UserFollow[];
}
```

**Columns removed from Project B's current entity** (no longer on `identity.users`):

| Column | Reason |
|--------|--------|
| `passwordHash` | Project A manages via `account` table |
| `securityStamp` | Project A manages via Better Auth |
| `concurrencyStamp` | Project A manages via Better Auth |
| `isLockedOut` | Project A manages via Better Auth |
| `lockoutEnd` | Project A manages via Better Auth |
| `accessFailedCount` | Project A manages via Better Auth |
| `twoFactorSecret` | Project A uses email-based 2FA, not TOTP |
| `newEmail` | Project A manages email lifecycle |
| `lastEmailModifiedAt` | Project A manages email lifecycle |
| `newPhoneNumber` | Project A manages phone lifecycle |
| `lastPhoneNumberModifiedAt` | Project A manages phone lifecycle |
| `lastUserNameModifiedAt` | Project A manages username lifecycle |
| `lastPasswordModifiedAt` | Project A manages password lifecycle |
| `normalizedEmail` | Project A uses `email` (unique constraint) |
| `normalizedUserName` | Project A uses `name` |
| `type` | Project A uses `isAdmin` + `role` |
| `bio` | Project A owns profile data |
| `registeredOn` | Project A uses `createdAt` |

### 3.2 UserBiometric Entity

**Status**: Keep — Project B manages its own profile images.

**File**: `src/domain/entities/identity/userBiometric.entity.ts` — no changes.

### 3.3 UserLogin Entity

**Status**: Keep — Project B manages its own JWT sessions.

**File**: `src/domain/entities/identity/userLogin.entity.ts` — no changes.

### 3.4 UserRole / Role / UserClaim / RoleClaim

**Status**: Keep — Project B manages its own RBAC.

**Files**: No changes.

### 3.5 UserFollow Entity

**Status**: Keep — Project B feature.

**File**: `src/domain/entities/userFollow.entity.ts` — no changes.

---

## 4. Column-Level Change Map

### 4.1 Columns Project B Reads From `identity.users`

| Column | Where Read | Action |
|--------|-----------|--------|
| `id` | JWT sub, all FKs | No change |
| `email` | JWT claim, login, user-facing | No change |
| `name` | JWT fullname claim | **New** — Project A has `name`, Project B had `firstName`+`lastName` |
| `firstName` | JWT givenname claim, display | No change (Project A has this) |
| `lastName` | JWT familyname claim, display | No change (Project A has this) |
| `emailVerified` | Login gate | **Rename** from `emailConfirmed` |
| `image` | Profile display | **New** — replaces `biometrics.profileImageUrl` fallback |
| `role` | JWT roles claim | **New** — Project A uses `role` text, not separate `userRoles` join |
| `isAdmin` | Admin checks | **New** — replaces `type === 'Admin'` |
| `twoFactorEnabled` | 2FA gate | No change (Project A has this) |
| `twoFaVerifiedAt` | 2FA verification window | **New** — replaces `twoFactorSecret` |
| `onboardingStep` | JWT claim, onboarding gate | No change (Project A has this) |
| `profilePrivacy` | Content visibility | No change (Project A has this) |
| `googleId` | Google OAuth lookup | No change (Project A has this) |
| `referralCode` | Referral system | No change (Project A has this) |
| `referredBy` | Referral tracking | No change (Project A has this) |
| `status` | Soft delete check | **New** — replaces `isActive` boolean |
| `deletedAt` | Soft delete | **New** — Project A uses soft delete |
| `bannedAt` | Ban check | **New** — replaces `isLockedOut` |
| `banReason` | Ban display | **New** |
| `createdAt` | Join date | **Rename** from `createdOn` |
| `updatedAt` | Last activity | **Rename** from `lastModifiedOn` |

### 4.2 Columns Project B No Longer Reads

| Column | Was Used For | Now Handled By |
|--------|-------------|----------------|
| `passwordHash` | Login auth | Project A's `account` table |
| `securityStamp` | JWT claim, token invalidation | Project A's session management |
| `concurrencyStamp` | JWT claim, concurrent update detection | Project A's session management |
| `isLockedOut` | Login gate | Project A's `bannedAt` |
| `lockoutEnd` | Lockout expiry | Project A's `bannedAt` |
| `accessFailedCount` | Brute-force protection | Project A's rate limiting |
| `twoFactorSecret` | TOTP secret | Project A uses email-based 2FA |
| `newEmail` | Pending email change | Project A manages |
| `lastEmailModifiedAt` | Rate limit email changes | Project A manages |
| `newPhoneNumber` | Pending phone change | Project A manages |
| `lastPhoneNumberModifiedAt` | Rate limit phone changes | Project A manages |
| `lastUserNameModifiedAt` | Rate limit username changes | Project A manages |
| `lastPasswordModifiedAt` | Password change tracking | Project A manages |
| `normalizedEmail` | Email lookups | Project A uses `email` unique constraint |
| `normalizedUserName` | Username lookups | Project A uses `name` |
| `type` | Role routing | Project A uses `isAdmin` + `role` |
| `bio` | Profile display | Project A owns profile |
| `registeredOn` | Join date | Project A uses `createdAt` |

---

## 5. Code Removals

### 5.1 Auth Feature Directories (Delete Entirely)

| Directory | Reason |
|-----------|--------|
| `src/features/auth/register/` | Project A owns signup |
| `src/features/auth/reset-password/` | Project A owns password reset |
| `src/features/auth/forgot-password/` | Project A owns forgot password |
| `src/features/auth/verify-email/` | Project A owns email verification |
| `src/features/auth/2fa/setup/` | Project A owns 2FA |
| `src/features/auth/2fa/enable/` | Project A owns 2FA |
| `src/features/auth/2fa/disable/` | Project A owns 2FA |
| `src/features/auth/2fa/verify/` | Project A owns 2FA |
| `src/features/auth/external/google-auth/` | Project A owns Google OAuth |
| `src/features/auth/external/facebook-auth/` | Project A owns Facebook OAuth |

### 5.2 User Feature Directories (Delete Entirely)

| Directory | Reason |
|-----------|--------|
| `src/features/user/update/basic-info/` | Project A owns profile |
| `src/features/user/update/privacy-settings/` | Project A owns profile |
| `src/features/user/update/profile-image/` | Project A owns profile |
| `src/features/user/update/username/` | Project A owns username |
| `src/features/user/update/email/` | Project A owns email |
| `src/features/user/phone-number/` | Project A owns phone |
| `src/features/user/activate-user/` | Project A owns activation |
| `src/features/user/deactivate-user/` | Project A owns deactivation |
| `src/features/user/referral/` | Project A owns referrals |
| `src/features/onboarding/` | Project A owns onboarding |

### 5.3 Services (Delete)

| File | Reason |
|------|--------|
| `src/infrastructure/services/email.service.ts` | Project A owns email |
| `src/infrastructure/services/better-auth.service.ts` | Project A owns Better Auth |

### 5.4 Auth Module Wiring (Remove)

| File | Sections to Remove |
|------|-------------------|
| `src/modules/auth.module.ts` | Remove registration, password reset, forgot password, email verify, 2FA, OAuth imports |
| `src/modules/user.module.ts` | Remove profile update, onboarding, activation imports |

---

## 6. Code Adaptations

### 6.1 Token Service Rewrite

**File**: `src/infrastructure/services/token.service.ts`

**Current**: Reads 10+ User columns, writes JWT claims.

**New**: Read-only. Maps Project A's columns to JWT claims.

| Current JWT Claim | Source Column | New Source |
|-------------------|--------------|------------|
| `http://gaddr.com/claims/sub` | `user.id` | `user.id` (no change) |
| `http://gaddr.com/claims/email` | `user.email` | `user.email` (no change) |
| `http://gaddr.com/claims/username` | `user.userName` | `user.name` |
| `http://gaddr.com/claims/givenname` | `user.firstName` | `user.firstName` (no change) |
| `http://gaddr.com/claims/familyname` | `user.lastName` | `user.lastName` (no change) |
| `http://gaddr.com/claims/security-stamp` | `user.securityStamp` | **Remove** |
| `http://gaddr.com/claims/concurrency-stamp` | `user.concurrencyStamp` | **Remove** |
| `http://gaddr.com/claims/profile-picture` | `user.biometrics?.profileImageUrl` | `user.image` |
| `http://gaddr.com/claims/fullname` | `lastName + firstName` | `user.name` |
| `http://gaddr.com/claims/usertype` | `user.type` | `user.isAdmin ? 'Admin' : 'User'` |
| `onboardingStep` | `user.onboardingStep` | `user.onboardingStep` (no change) |
| `http://gaddr.com/claims/roles` | `role.name[]` | `[user.role]` |
| `permission` | `roleClaim.claimValue[]` | `[]` (simplify until RBAC migration) |

### 6.2 Login Handler Rewrite

**File**: `src/features/auth/login/login.handler.ts`

**Current**: Checks `emailConfirmed`, `isLockedOut`, `isActive`, `accessFailedCount`, `twoFactorEnabled`.

**New**: Checks `emailVerified`, `bannedAt`, `status`, `twoFactorEnabled`.

| Current Check | New Check |
|---------------|-----------|
| `user.emailConfirmed === false` | `user.emailVerified === false` |
| `user.isLockedOut === true` | `user.bannedAt !== null` |
| `user.isActive === false` | `user.status !== 'active'` |
| `user.accessFailedCount` increment | Remove — Project A handles |
| `user.twoFactorEnabled` | `user.twoFactorEnabled` (no change) |
| `user.onboardingStep` in JWT | `user.onboardingStep` (no change) |

### 6.3 HttpContext Middleware Simplification

**File**: `src/core/middlewares/httpContext.middleware.ts`

**Current**: Tries Better Auth first, falls back to JWT. Contains raw SQL querying `u.name` (which doesn't exist in current entity).

**New**: JWT only. Remove Better Auth fallback entirely.

```
Remove: Better Auth session lookup (lines ~100-135)
Remove: Raw SQL query to identity.users
Keep: JWT decode and HttpContext population
```

### 6.4 UserRepository Adaptation

**File**: `src/infrastructure/repositories/user.repository.ts`

**Current**: Queries 20+ columns, many of which no longer exist.

**Adaptations**:

| Current Method | Change |
|----------------|--------|
| `getUserByEmailAsync(email)` | Query `user.email` (was `normalizedEmail`) |
| `getUserByNameAsync(userName)` | Query `user.name` (was `normalizedUserName`) |
| `getUserByGoogleIdAsync(googleId)` | No change — `googleId` exists in Project A |
| `updatePassword()` | Delete — Project A manages passwords |
| `updateOnboardingStep()` | Delete — Project A manages onboarding |
| `getReferralCode()` | No change — `referralCode` exists in Project A |
| `searchUsers()` | Adapt to `user.name`, `user.firstName`, `user.lastName` |

### 6.5 Mapper Adaptation

**File**: `src/infrastructure/mappers/user.mapper.ts`

**Current**: Maps `userName`, `firstName`, `lastName`, `bio`, `gender`, `phoneNumber`, `profilePrivacy`, `onboardingStep`.

**New**: Maps `name`, `firstName`, `lastName`, `image`, `profilePrivacy`, `onboardingStep`, `role`, `isAdmin`.

| Current Field | New Field |
|---------------|-----------|
| `userName` | `name` |
| `bio` | Remove — Project A owns |
| `gender` | Keep — Project A has this |
| `phoneNumber` | Keep — Project A has this |
| `profileImageUrl` (from biometrics) | `image` |

### 6.6 Account Guard Adaptation

**File**: `src/core/passport/account.guard.ts`

**Current**: Reads `UserId`, `TwoFARequired`, `SecurityStamp`, `ConcurrencyStamp`, `UserType` from JWT.

**New**: Remove `SecurityStamp`, `ConcurrencyStamp`. Replace `UserType` with `IsAdmin`.

| Current Claim | New Claim |
|---------------|-----------|
| `UserId` | `UserId` (no change) |
| `TwoFARequired` | `TwoFARequired` (no change) |
| `SecurityStamp` | **Remove** |
| `ConcurrencyStamp` | **Remove** |
| `UserType` | `IsAdmin` |

### 6.7 Permissions Guard Adaptation

**File**: `src/core/passport/permissions.guard.ts`

**Current**: Reads `TwoFARequired`, `permission` from JWT.

**New**: Same — no change needed.

---

## 7. New Code Required

### 7.1 Soft Delete Support

Project A uses `status` + `deletedAt` for soft delete. Project B must add soft delete checks to all queries.

**New utility**: `src/core/utils/soft-delete.ts`

```typescript
export function isActiveUser(user: User): boolean {
  return user.status === 'active' && !user.deletedAt;
}

export function isBannedUser(user: User): boolean {
  return user.bannedAt !== null;
}
```

**Impact**: Every query that reads `identity.users` must filter `WHERE status = 'active' AND deletedAt IS NULL`.

### 7.2 FK Constraints to `identity.users`

Project B must add FK constraints from its feature tables to `identity.users`.

**Tables requiring FK**:

| Table | FK Column | Migration |
|-------|-----------|-----------|
| `linkedAccounts` | `userId` | Add FK constraint |
| `userContents` | `userId` | Add FK constraint |
| `contentStreams` | `userId` | Add FK constraint |
| `searchHistories` | `userId` | Add FK constraint |
| `rateLimits` | `identifier` | Add FK constraint (if user-scoped) |
| `publish_jobs` | `userId` | Add FK constraint |
| `youtube_accounts` | `userId` | Add FK constraint |
| `analyticsEvents` | `userId` | Add FK constraint |
| `premiumRollups` | `userId` | Add FK constraint |
| `notifications` | `notifyId` | Add FK constraint |
| `playlists` | `userId` | Add FK constraint |
| `playlistMembers` | `userId` | Add FK constraint |
| `newsletter_subscribers` | (email-based) | No FK needed |

**FK behavior**: `ON DELETE RESTRICT` — prevents user deletion if feature data exists. Project B must implement soft delete cascade or explicit cleanup before hard delete.

### 7.3 Session Bridge

Project A uses Better Auth sessions. Project B uses JWT. A bridge is needed for cross-project session validation.

**Option A (Recommended)**: Project B validates its own JWT. Project A validates its own sessions. No bridge. The two systems are independent.

**Option B**: Project B queries the `session` table (Project A's schema) to validate cross-project sessions. This adds a dependency.

**Decision**: Option A. No bridge code needed.

---

## 8. Files Changed Summary

### 8.1 Files Deleted (32 files)

| File | Reason |
|------|--------|
| `src/features/auth/register/register.handler.ts` | Project A owns |
| `src/features/auth/register/register.command.ts` | Project A owns |
| `src/features/auth/register/register.endpoint.ts` | Project A owns |
| `src/features/auth/reset-password/*.ts` | Project A owns |
| `src/features/auth/forgot-password/*.ts` | Project A owns |
| `src/features/auth/verify-email/*.ts` | Project A owns |
| `src/features/auth/2fa/setup/*.ts` | Project A owns |
| `src/features/auth/2fa/enable/*.ts` | Project A owns |
| `src/features/auth/2fa/disable/*.ts` | Project A owns |
| `src/features/auth/2fa/verify/*.ts` | Project A owns |
| `src/features/auth/external/google-auth/*.ts` | Project A owns |
| `src/features/auth/external/facebook-auth/*.ts` | Project A owns |
| `src/features/user/update/basic-info/*.ts` | Project A owns |
| `src/features/user/update/privacy-settings/*.ts` | Project A owns |
| `src/features/user/update/profile-image/*.ts` | Project A owns |
| `src/features/user/update/username/*.ts` | Project A owns |
| `src/features/user/update/email/*.ts` | Project A owns |
| `src/features/user/phone-number/*.ts` | Project A owns |
| `src/features/user/activate-user/*.ts` | Project A owns |
| `src/features/user/deactivate-user/*.ts` | Project A owns |
| `src/features/user/referral/*.ts` | Project A owns |
| `src/features/onboarding/**/*.ts` | Project A owns |
| `src/domain/entities/identity/userBiometric.entity.ts` | Project A owns |
| `src/domain/entities/identity/userPreference.entity.ts` | Project A owns |
| `src/infrastructure/services/email.service.ts` | Project A owns |
| `src/infrastructure/services/better-auth.service.ts` | Project A owns |
| `prisma.config.ts` | Vestigial |

### 8.2 Files Modified (14 files)

| File | Change |
|------|--------|
| `src/domain/entities/identity/user.entity.ts` | Rewrite — 38-column read-only entity |
| `src/infrastructure/services/token.service.ts` | Rewrite — read-only, map Project A columns |
| `src/features/auth/login/login.handler.ts` | Adapt — new column names |
| `src/core/middlewares/httpContext.middleware.ts` | Simplify — JWT only, remove Better Auth |
| `src/infrastructure/repositories/user.repository.ts` | Adapt — new column names, remove writes |
| `src/infrastructure/mappers/user.mapper.ts` | Adapt — new column names |
| `src/core/passport/account.guard.ts` | Adapt — remove security/concurrency stamps |
| `src/modules/auth.module.ts` | Remove deleted feature imports |
| `src/modules/user.module.ts` | Remove deleted feature imports |
| `src/infrastructure/repositories/userContent.repository.ts` | Adapt — new column names |
| `src/infrastructure/repositories/manualProfile.repository.ts` | Adapt — new column names |
| `src/features/discover/discover-feed.handler.ts` | Adapt — `user.image` instead of biometrics |
| `src/features/profile/get/get-profile.handler.ts` | Adapt — new column names |
| `src/features/profile/public-profile/get-public-profile.handler.ts` | Adapt — new column names |

### 8.3 Files Created (2 files)

| File | Purpose |
|------|---------|
| `src/core/utils/soft-delete.ts` | Soft delete utility functions |
| `src/infrastructure/migrations/XXXXXX-AddFKConstraints.ts` | FK constraint migration |

---

## 9. Execution Order

### Phase 1 — Entity Replacement (No breaking changes)

| Step | Action | Risk |
|------|--------|------|
| 1.1 | Create new `user.entity.ts` with Project A's 38 columns (read-only) | Low — additive |
| 1.2 | Add `soft-delete.ts` utility | Low — additive |
| 1.3 | Run `POSTGRES_MIGRATIONS_RUN=false` to verify entity maps to existing table | Low — read-only |

### Phase 2 — Auth Flow Removal (Breaking — coordinate with frontend)

| Step | Action | Risk |
|------|--------|------|
| 2.1 | Delete registration handlers | Medium — frontend must use Project A |
| 2.2 | Delete password reset handlers | Medium — frontend must use Project A |
| 2.3 | Delete 2FA handlers | Medium — frontend must use Project A |
| 2.4 | Delete OAuth handlers | Medium — frontend must use Project A |
| 2.5 | Delete onboarding handlers | Medium — frontend must use Project A |
| 2.6 | Delete email/phone update handlers | Medium — frontend must use Project A |
| 2.7 | Update auth module imports | Low — compile-time check |
| 2.8 | Update user module imports | Low — compile-time check |

### Phase 3 — Adaptation (Non-breaking)

| Step | Action | Risk |
|------|--------|------|
| 3.1 | Rewrite token service | Medium — JWT payload changes |
| 3.2 | Rewrite login handler | Medium — column name changes |
| 3.3 | Simplify HttpContext middleware | Low — remove dead code |
| 3.4 | Adapt UserRepository | Medium — query changes |
| 3.5 | Adapt mappers | Low — field mapping changes |
| 3.6 | Adapt account guard | Low — claim changes |
| 3.7 | Adapt discover feed | Low — field changes |
| 3.8 | Adapt profile handlers | Low — field changes |

### Phase 4 — FK Constraints (Non-breaking)

| Step | Action | Risk |
|------|--------|------|
| 4.1 | Create FK migration for all feature tables | Low — additive |
| 4.2 | Test cascade behavior | Medium — verify no orphans |
| 4.3 | Add soft delete checks to queries | Low — additive |

### Phase 5 — Cleanup

| Step | Action | Risk |
|------|--------|------|
| 5.1 | Delete `prisma.config.ts` | Low |
| 5.2 | Remove unused TypeORM decorators | Low |
| 5.3 | Update README with new architecture | Low |

---

## 10. Verification

### 10.1 Compile Check

```bash
npm run build
```

All deleted files must not be imported anywhere. All modified files must compile.

### 10.2 Migration Check

```bash
POSTGRES_MIGRATIONS_RUN=false npm run start:dev
```

Entity must map to existing `identity.users` table without errors.

### 10.3 Login Test

1. User registers via Project A (frontend → Project A backend)
2. User logs in via Project B (frontend → Project B backend)
3. JWT token contains correct claims from Project A's `identity.users`
4. Project B guards validate the token

### 10.4 Query Test

1. All Project B feature queries return correct data
2. Soft-deleted users are excluded from results
3. FK constraints prevent orphaned rows

### 10.5 No Frontend Changes

Verify that `E:\SocialApp` has zero modifications. All adaptations are backend-only.

---

## Appendix A — Column Mapping Quick Reference

| Project B (Current) | Project A (Target) | Type Change |
|---------------------|-------------------|-------------|
| `userName` | `name` | Same (text) |
| `normalizedUserName` | — | Removed |
| `normalizedEmail` | — | Removed |
| `emailConfirmed` | `emailVerified` | Same (boolean) |
| `type` | `isAdmin` | enum → boolean |
| `isActive` | `status` | boolean → text |
| `isLockedOut` | `bannedAt` | boolean → timestamp |
| `lockoutEnd` | `bannedAt` | timestamp → timestamp |
| `accessFailedCount` | — | Removed |
| `securityStamp` | — | Removed |
| `concurrencyStamp` | — | Removed |
| `passwordHash` | — | Removed (in `account` table) |
| `twoFactorSecret` | — | Removed (email-based 2FA) |
| `twoFactorEnabled` | `twoFactorEnabled` | Same |
| — | `twoFaVerifiedAt` | New |
| `bio` | — | Removed (Project A profile) |
| `registeredOn` | `createdAt` | Same (timestamp) |
| `lastModifiedOn` | `updatedAt` | Same (timestamp) |
| `profileImageUrl` (biometrics) | `image` | Same (text) |
| — | `name` | New (composed) |
| — | `role` | New (text) |
| — | `isVerified` | New (boolean) |
| — | `stripeCustomerId` | New (text) |
| — | `stripePriceId` | New (text) |
| — | `stripeSubscriptionId` | New (text) |
| — | `subscriptionStatus` | New (text) |
| — | `subscriptionPlan` | New (text) |
| — | `jobPostLimit` | New (integer) |
| — | `activeJobPostCount` | New (integer) |
| — | `walletAddress` | New (text) |
| — | `privateSearchMode` | New (boolean) |
| — | `blockedEmployers` | New (text[]) |
| — | `aiAnalysisOptOut` | New (boolean) |
| — | `dateOfBirth` | New (timestamp) |
| — | `sourceApp` | New (text) |
| — | `deletedAt` | New (timestamp) |
| — | `bannedAt` | New (timestamp) |
| — | `banReason` | New (text) |
