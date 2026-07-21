# 06 — Project A Change Plan

> **Scope**: Every file, service, repository, DTO, validator, middleware, migration, env var, auth component, FK, and build impact in `E:\Github\gaddep` (gaddr-jobs / packages/shared-schema).
> **Derived from**: Sessions 01-05 architecture decisions (identity split, FK cleanup, auth consolidation, migration strategy).
> **Date**: 2026-07-19
> **Status**: Plan only — no code.

---

## Table of Contents

1. [Decision Summary](#1-decision-summary)
2. [Every Affected File](#2-every-affected-file)
3. [Every Service](#3-every-service)
4. [Every Repository (Drizzle Schema)](#4-every-repository-drizzle-schema)
5. [Every DTO / Type](#5-every-dto--type)
6. [Every Validator](#6-every-validator)
7. [Every Middleware](#7-every-middleware)
8. [Every Migration](#8-every-migration)
9. [Every Environment Variable](#9-every-environment-variable)
10. [Every Auth Component](#10-every-auth-component)
11. [Every Foreign Key](#11-every-foreign-key)
12. [Every Build Impact](#12-every-build-impact)

---

## 1. Decision Summary

| Decision | Source | Impact |
|----------|--------|--------|
| **Vertical split of `user` table** into `users` + `user_profiles` + `user_security` + `user_preferences` | Session 04 | Schema, all queries, auth config, shared-schema |
| **New `user_oauth_providers` table** replacing `googleId` column | Session 04 | Auth schema, OAuth flow, migration |
| **New `sessions` table** replacing `userLogins` + Better Auth `session` | Session 04 | Auth config, middleware, session handling |
| **New `verification_tokens` table** replacing `dataProtectionKeys` | Session 04 | Auth schema, OTP code, password reset |
| **Better Auth retirement** (consolidate to JWT) | Session 04 §6 | Auth library removal, middleware rewrite, cookie changes |
| **FK behavior: RESTRICT for feature → identity** | Session 04 §4 | Drizzle schema FK definitions |
| **FK behavior: CASCADE within identity aggregate** | Session 04 §4 | Drizzle schema FK definitions |
| **Shared-schema drift resolution** (add 9 missing columns) | Session 01 §7 | packages/shared-schema/src/auth.ts |
| **Add missing FK constraints** to 12+ tables | Session 03 §10 | Drizzle schema relations |
| **5-phase migration** (schema → data → code → column drop → auth retirement) | Session 05 | Migration files, feature flags |

---

## 2. Every Affected File

### 2A. Auth Core (8 files — ALL affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 1 | `gaddr-jobs/src/server/auth/index.ts` | 178 | **MAJOR REWRITE** | Remove Better Auth entirely. Replace with custom JWT + session management. Remove `drizzleAdapter`, `emailAndPassword`, `socialProviders`, `passkey`, `crossSubDomainCookies`, `databaseHooks`, `rateLimit`. New auth config points to `identity.*` tables. |
| 2 | `gaddr-jobs/src/server/auth/auth-api.ts` | 55 | **DELETE** | `postToAuthApi()` invokes Better Auth in-process. No longer needed. |
| 3 | `gaddr-jobs/src/server/auth/auth-error.ts` | 18 | **DELETE** | Better Auth error parser. No longer needed. |
| 4 | `gaddr-jobs/src/server/auth/auth-error.test.ts` | 24 | **DELETE** | Tests for deleted file. |
| 5 | `gaddr-jobs/src/server/auth/verification-code.ts` | 52 | **REFACTOR** | OTP generation is retained. `storeEmailVerificationCode()` and `verifyAndConsumeEmailCode()` change storage target from Redis to `identity.verification_tokens` table (purpose: `email_verify`). Redis fallback optional. |
| 6 | `gaddr-jobs/src/server/auth/password-reset-code.ts` | 59 | **REFACTOR** | Storage target changes from Redis to `identity.verification_tokens` table (purpose: `password_reset`). Better Auth `resetToken` retrieval removed. |
| 7 | `gaddr-jobs/src/server/auth/rate-limit.ts` | 77 | **NO CHANGE** | Redis-based rate limiting is independent of Better Auth. Retained as-is. |
| 8 | `gaddr-jobs/src/server/auth/require-session.ts` | 39 | **REWRITE** | Currently uses `auth.api.getSession()`. Replace with direct JWT validation from `identity.sessions` table. 2FA enforcement logic retained but reads from `identity.user_security.two_factor_enabled` and `identity.user_security.two_fa_verified_at`. |
| 9 | `gaddr-jobs/src/server/auth/trigger-verification-email.ts` | 20 | **REWRITE** | Currently calls `postToAuthApi("send-verification-email")`. Replace with direct email service call. |

### 2B. Auth Client (1 file — affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 10 | `gaddr-jobs/src/lib/auth-client.ts` | 17 | **DELETE or REWRITE** | Currently creates `better-auth/react` client. Remove Better Auth dependency. Replace with custom auth client using `fetch`/`restfit` for login/register/token-refresh endpoints. |

### 2C. Middleware (1 file — affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 11 | `gaddr-jobs/src/middleware.ts` | 96 | **REWRITE** | Currently checks for `better-auth.session_token` cookie. Replace with JWT Bearer token validation. Public routes list retained. Cookie name changes from `better-auth.session_token` to `access_token`. |

### 2D. Database Connection (1 file — affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 12 | `gaddr-jobs/src/server/db/index.ts` | 26 | **NO CHANGE** | postgres.js + Drizzle connection is ORM-level. Retained. |

### 2E. Database Schema — Auth (1 file — MAJOR rewrite)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 13 | `gaddr-jobs/src/server/db/auth-schema.ts` | 174 | **MAJOR REWRITE** | Currently defines `user` (38 columns), `session`, `account`, `verification`, `passkey`, `userIdMapping`, `usedFreeLimit`. Rewrite: split `user` into `user` (lean auth anchor) + new `userProfile`, `userSecurity`, `userPreference`, `userOAuthProvider`, `verificationToken` tables. Replace `session`/`account` with unified `identity.sessions`. Remove Better Auth `passkey`, `usedFreeLimit`. Add FK constraints. |

### 2F. Database Schema — All Other Schemas (49 files — 12 affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 14 | `gaddr-jobs/src/server/db/schema.ts` | 72 | **MODIFY** | Barrel export. Add new schema modules (userProfile, userSecurity, etc.). Remove deleted modules (passkey). |
| 15 | `gaddr-jobs/src/server/db/gdpr-schema.ts` | ~30 | **MODIFY** | `accountDeletionLog.userId` has no FK constraint. Add FK to `identity.users.id`. |
| 16 | `gaddr-jobs/src/server/db/notification-schema.ts` | ~40 | **MODIFY** | `notification.userId` / `notifyId` — add FK to `identity.users.id`. |
| 17 | `gaddr-jobs/src/server/db/analytics-schema.ts` | ~60 | **MODIFY** | `analyticsEvent.userId`, `premiumRollup.userId` — add FK to `identity.users.id`. |
| 18 | `gaddr-jobs/src/server/db/merger-schema.ts` | ~80 | **REVIEW** | Merger tables may reference user columns that move to split tables. Audit required. |
| 19 | `gaddr-jobs/src/server/db/activity-feed-schema.ts` | ~30 | **REVIEW** | Has `userId` but NO FK constraint. Add FK. |
| 20 | `gaddr-jobs/src/server/db/admin-ai-key-schema.ts` | ~20 | **REVIEW** | Has `userId` — add FK. |
| 21 | `gaddr-jobs/src/server/db/ai-audit-schema.ts` | ~20 | **REVIEW** | Has `userId` — add FK. |
| 22-60 | Remaining 39 schema files | varies | **AUDIT** | Every schema file that references `user.id` must be checked for FK alignment with the new split-table structure. Files with no user FK (`endorsement-schema.ts`, `external-job-schema.ts`, `issuer-registry-schema.ts`, `smart-account-schema.ts`, `university-schema.ts`) are unaffected. |

### 2G. Shared Schema Package (5 files — 3 affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 61 | `packages/shared-schema/src/auth.ts` | 104 | **MAJOR REWRITE** | Currently defines `user` with drift (missing 9 columns vs gaddr-jobs). Replace with new split-table definitions: `user` (lean), `userProfile`, `userSecurity`, `userPreference`, `userOAuthProvider`, `verificationToken`. This is the **Schema Owner** — gaddr.com will consume these definitions. |
| 62 | `packages/shared-schema/src/profiles.ts` | 59 | **REVIEW** | `linkedAccounts` references `user.id`. Verify FK alignment with new `user` table. |
| 63 | `packages/shared-schema/src/social.ts` | 63 | **REVIEW** | `youtubeAccounts`, `youtubeVideos`, `contentStreams` — verify FK alignment. |
| 64 | `packages/shared-schema/src/content.ts` | 57 | **REVIEW** | `userContents`, `playlists`, `playlistMembers`, `playlistContent` — verify FK alignment. FK behavior changes from CASCADE to RESTRICT for user references. |
| 65 | `packages/shared-schema/src/index.ts` | 21 | **MODIFY** | Barrel export. Add new schema modules. |

### 2H. tRPC Auth Router (1 file — MAJOR rewrite)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 66 | `gaddr-jobs/src/server/trpc/routers/auth.ts` | 805 | **MAJOR REWRITE** | 18 procedures. Every procedure touches auth tables that change. Specific impacts listed in §3. |

### 2I. Validation (4 files — 2 affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 67 | `gaddr-jobs/src/lib/validation/auth-schemas.ts` | 37 | **NO CHANGE** | Zod schemas for OTP, email, reset password are format-level. Retained. |
| 68 | `gaddr-jobs/src/lib/validation/password.ts` | 18 | **NO CHANGE** | Password strength validation is format-level. Retained. |
| 69 | `gaddr-jobs/src/lib/constants/auth.ts` | 8 | **NO CHANGE** | Constants are format-level. Retained. |
| 70 | `gaddr-jobs/src/lib/email/normalize.ts` | 21 | **NO CHANGE** | Email normalization is format-level. Retained. |

### 2J. Auth UI Components (3 files — 1 affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 71 | `gaddr-jobs/src/components/auth/auth-form.tsx` | 798 | **REWRITE** | `SignInForm` uses `authClient.signIn.email()` and `authClient.signIn.social()`. Replace with custom API calls. `SignUpForm` uses `authClient.signUp.email()`. Replace with custom API calls. 2FA flow uses `api.auth.request2faCode` / `api.auth.verify2faLogin`. These tRPC calls are retained. Post-login redirect logic retained. |
| 72 | `gaddr-jobs/src/components/auth/auth-footer.tsx` | 84 | **NO CHANGE** | Static footer component. |
| 73 | `gaddr-jobs/src/components/auth/otp-input.tsx` | 87 | **NO CHANGE** | Generic OTP input component. |

### 2K. Auth Pages (7 files — 3 affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 74 | `gaddr-jobs/src/app/(auth)/login/page.tsx` | 23 | **REVIEW** | May reference Better Auth client directly. |
| 75 | `gaddr-jobs/src/app/(auth)/register/page.tsx` | 17 | **REVIEW** | May reference Better Auth client directly. |
| 76 | `gaddr-jobs/src/app/(auth)/forgot-password/page.tsx` | varies | **REVIEW** | May reference `requestPasswordReset` tRPC. |
| 77 | `gaddr-jobs/src/app/(auth)/reset-password-code/page.tsx` | 282 | **REVIEW** | May reference Better Auth password reset. |
| 78 | `gaddr-jobs/src/app/(auth)/verify-email/page.tsx` | 164 | **REVIEW** | May reference Better Auth email verification. |
| 79 | `gaddr-jobs/src/app/(auth)/verify-email-code/page.tsx` | 152 | **REVIEW** | Uses `verifyEmailWithCode` tRPC — retained. |
| 80 | `gaddr-jobs/src/app/(auth)/account-created/page.tsx` | 27 | **NO CHANGE** | Static confirmation page. |

### 2L. Environment / Config (3 files — 2 affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 81 | `.env.development` | varies | **MODIFY** | Remove `BETTER_AUTH_SECRET`, `BETTER_AUTH_COOKIE_NAME`. Add `JWT_SECRET`, `JWT_AUDIENCE`, `JWT_ISSUER`, `JWT_ACCESS_EXPIRATION_MINUTES`, `JWT_REFRESH_EXPIRATION_HOURS` (if not already present). Add `FRONTEND_URL`. |
| 82 | `gaddr-jobs/src/env.ts` or equivalent | varies | **MODIFY** | Remove Better Auth env vars from schema. Add JWT env vars. |
| 83 | `gaddr-jobs/auth.config.ts` | varies | **DELETE** | Better Auth CLI config for schema generation. |

### 2M. Test Files (3 files — 1 affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 84 | `gaddr-jobs/src/server/auth/auth-error.test.ts` | 24 | **DELETE** | Tests for deleted file. |
| 85 | `gaddr-jobs/src/lib/validation/auth-schemas.test.ts` | 37 | **NO CHANGE** | Validation tests retained. |
| 86 | `gaddr-jobs/src/lib/validation/password.test.ts` | 42 | **NO CHANGE** | Password tests retained. |

### 2N. Fix / Backup Scripts (6 files — 0 affected)

| # | File | Lines | Change Type | Summary |
|---|------|-------|-------------|---------|
| 87-92 | `fix-all.js`, `fix-governance.js`, `fix-governance2.js`, `fix-mentorship.js`, `fix-tables.js`, `fix-vote-table.js` | varies | **NO CHANGE** | One-time data fix scripts. Unrelated. |
| 93 | `backups/user_backup_1784300813041.json` | varies | **NO CHANGE** | Migration backup. Unrelated. |

### **Total Affected Files: 48**

| Category | Total | Major Rewrite | Rewrite | Modify | Review | Delete | No Change |
|----------|-------|---------------|---------|--------|--------|--------|-----------|
| Auth Core | 9 | 1 | 3 | 0 | 0 | 3 | 1 |
| Auth Client | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| Middleware | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| DB Schema | 48 | 1 | 0 | 4 | 5 | 0 | 38 |
| Shared Schema | 5 | 1 | 0 | 2 | 2 | 0 | 0 |
| tRPC Router | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| Validation | 4 | 0 | 0 | 0 | 0 | 0 | 4 |
| Auth UI | 3 | 0 | 1 | 0 | 0 | 0 | 2 |
| Auth Pages | 7 | 0 | 0 | 0 | 6 | 0 | 1 |
| Env/Config | 3 | 0 | 0 | 2 | 0 | 1 | 0 |
| Tests | 3 | 0 | 0 | 0 | 0 | 1 | 2 |
| **TOTAL** | **94** | **3** | **6** | **8** | **13** | **5** | **48** |

---

## 3. Every Service

### 3A. Better Auth Service Layer (removed/replaced)

| # | Current Service | File | Action | Replacement |
|---|----------------|------|--------|-------------|
| 1 | Better Auth `auth.api.getSession()` | `auth/index.ts` | **REMOVE** | Custom JWT validation service |
| 2 | Better Auth `auth.api.signIn()` | `auth/auth-api.ts` | **REMOVE** | Custom login handler |
| 3 | Better Auth `auth.api.signUp()` | `auth/auth-api.ts` | **REMOVE** | Custom register handler |
| 4 | Better Auth `auth.api.requestPasswordReset()` | `auth/auth-api.ts` | **REMOVE** | Direct `verification_tokens` write |
| 5 | Better Auth `auth.api.resetPassword()` | `auth/auth-api.ts` | **REMOVE** | Direct `account` table password hash update |
| 6 | Better Auth `auth.api.changePassword()` | `auth/auth-api.ts` | **REMOVE** | Direct password hash update |
| 7 | Better Auth `auth.api.verifyEmail()` | `auth/auth-api.ts` | **REMOVE** | Direct `user.emailVerified` update |
| 8 | Better Auth `drizzleAdapter(db)` | `auth/index.ts` | **REMOVE** | Custom repository pattern |

### 3B. New/Modified Service Requirements

| # | New Service | Purpose | Tables Accessed |
|---|-------------|---------|-----------------|
| 1 | `TokenService` (new) | JWT access/refresh token creation, validation, refresh | `identity.sessions`, `identity.users` |
| 2 | `SessionService` (new) | Session CRUD (create on login, invalidate on logout, list active) | `identity.sessions` |
| 3 | `UserProfileService` (new) | Profile CRUD (firstName, lastName, bio, gender, phone, etc.) | `identity.user_profiles` |
| 4 | `UserSecurityService` (new) | 2FA enable/disable, lockout management, email change | `identity.user_security` |
| 5 | `OAuthProviderService` (new) | Link/unlink OAuth providers, Google/Facebook token exchange | `identity.user_oauth_providers` |
| 6 | `VerificationTokenService` (new) | Generate, store, verify OTP tokens for email/2FA/reset | `identity.verification_tokens` |
| 7 | `PasswordService` (new) | Hash (Argon2id), verify, update password | `identity.users` (passwordHash column) |
| 8 | `AuthService` (new) | Orchestrate register/login/logout/refresh flows | All identity tables |
| 9 | `VerificationCodeService` (modified) | OTP generation retained, storage moves to `verification_tokens` | `identity.verification_tokens` |
| 10 | `EmailService` (existing, modified) | Send verification/welcome/password-reset emails | No schema change |

### 3C. Affected Existing Services (tRPC procedures in `auth.ts`)

| # | Procedure | Lines | Change Required |
|---|-----------|-------|-----------------|
| 1 | `me` | ~30 | Currently queries `user` table directly. Must JOIN `user_profiles` + `user_biometrics`. |
| 2 | `updateProfileImage` | ~20 | Currently updates `user.image`. Move to `user_biometrics.profileImageUrl`. |
| 3 | `updatePrivacyPreferences` | ~15 | Currently updates `user.privateSearchMode`, `aiAnalysisOptOut`, `blockedEmployers`. Move to `user_profiles` or `user_security`. |
| 4 | `getUserById` | ~10 | Must JOIN split tables. |
| 5 | `isEmailAvailable` | ~10 | Query `user.email` — unchanged (email stays on `user`). |
| 6 | `validatePasswordForSignup` | ~5 | Format-only — unchanged. |
| 7 | `verifyEmailWithCode` | ~25 | Verify code from `verification_tokens`, update `user.emailVerified`. |
| 8 | `requestPasswordReset` | ~20 | Write to `verification_tokens`, send email. No Better Auth API. |
| 9 | `resetPasswordWithCode` | ~25 | Verify code from `verification_tokens`, update password hash directly. |
| 10 | `changePassword` | ~20 | Verify old password, update hash, revoke other sessions. |
| 11 | `setRole` | ~10 | Update `user.role`. Unchanged. |
| 12 | `getRole` | ~5 | Read `user.role`. Unchanged. |
| 13 | `resendVerificationCode` | ~15 | Rate-limited, write to `verification_tokens`, send email. |
| 14 | `check2fa` | ~10 | Read `user_security.two_factor_enabled`. |
| 15 | `request2faCode` | ~15 | Write OTP to `verification_tokens`, send email. |
| 16 | `verify2faLogin` | ~15 | Verify from `verification_tokens`, update `user_security.two_fa_verified_at`. |
| 17 | `enable2fa` | ~15 | Verify code, set `user_security.two_factor_enabled = true`. |
| 18 | `disable2fa` | ~10 | Set `user_security.two_factor_enabled = false`. |
| 19 | `deleteSelf` | ~30 | GDPR deletion across split tables. RESTRICT FKs require explicit cleanup first. |
| 20 | `exportMyData` | ~40 | Export from split tables. |
| 21 | `requestAccountDeletion` | ~20 | Soft delete across split tables. |

---

## 4. Every Repository (Drizzle Schema)

### 4A. Identity Schema Tables (modified)

| # | Current Table | File | Change | Target Table(s) |
|---|--------------|------|--------|-----------------|
| 1 | `user` (38 columns) | `auth-schema.ts` | **SPLIT** | `user` (lean, ~14 columns) + `userProfile` + `userSecurity` + `userPreference` |
| 2 | `session` | `auth-schema.ts` | **REPLACE** | `sessions` (unified, with `provider` column) |
| 3 | `account` | `auth-schema.ts` | **REMOVE** | Password hash moves to `user.passwordHash`. OAuth tokens move to `userOAuthProvider`. |
| 4 | `verification` | `auth-schema.ts` | **REMOVE** | Replaced by `verificationTokens`. |
| 5 | `passkey` | `auth-schema.ts` | **REMOVE** | Passkeys not supported after Better Auth removal. If needed later, recreate without Better Auth dependency. |
| 6 | `userIdMapping` | `auth-schema.ts` | **REVIEW** | Merger table. May be retained if gaddr.com migration still needed. |
| 7 | `usedFreeLimit` | `auth-schema.ts` | **REMOVE** | Free limit tracking — unclear if still used. Audit required. |

### 4B. New Identity Tables (created)

| # | New Table | File (new) | Columns | FKs |
|---|-----------|-----------|---------|-----|
| 8 | `identity.user_profiles` | `userProfile-schema.ts` (NEW) | userId (PK, FK→users.id CASCADE), firstName, lastName, bio, gender, phoneNumber, profilePrivacy, onboardingStep, referralCode, referredBy, createdOn, lastModifiedOn | FK → identity.users ON DELETE CASCADE |
| 9 | `identity.user_security` | `userSecurity-schema.ts` (NEW) | userId (PK, FK→users.id CASCADE), twoFactorEnabled, twoFactorSecret, isLockedOut, lockoutEnd, accessFailedCount, newEmail, lastEmailModifiedAt, newPhoneNumber, lastPhoneNumberModifiedAt, lastUserNameModifiedAt, lastPasswordModifiedAt, createdOn, lastModifiedOn | FK → identity.users ON DELETE CASCADE |
| 10 | `identity.user_oauth_providers` | `userOAuthProvider-schema.ts` (NEW) | id (PK), userId (FK→users.id CASCADE), provider, providerUid, email, name, avatarUrl, addedOn. UNIQUE(provider, providerUid), UNIQUE(userId, provider) | FK → identity.users ON DELETE CASCADE |
| 11 | `identity.verification_tokens` | `verificationToken-schema.ts` (NEW) | id (PK), userId (FK→users.id CASCADE), purpose, token (UNIQUE), data (JSONB), expiresAt, usedAt, createdOn | FK → identity.users ON DELETE CASCADE |

### 4C. Modified Identity Tables (FK additions)

| # | Table | File | Change |
|---|-------|------|--------|
| 12 | `identity.user_roles` | existing schema | Add FK: userId → users.id ON DELETE CASCADE, roleId → roles.id ON DELETE CASCADE |
| 13 | `identity.user_claims` | existing schema | Add FK: userId → users.id ON DELETE CASCADE |
| 14 | `identity.role_claims` | existing schema | Verify FK: roleId → roles.id (existing). Consider ON DELETE CASCADE. |

### 4D. Feature Tables (FK behavior change: CASCADE → RESTRICT)

| # | Table | Current FK | Current onDelete | Target onDelete |
|---|-------|-----------|------------------|-----------------|
| 15 | `user_topics` | userId → users.id | CASCADE | **RESTRICT** |
| 16 | `user_follows` | followerId → users.id | CASCADE | **RESTRICT** |
| 17 | `user_follows` | followedId → users.id | CASCADE | **RESTRICT** |
| 18 | `user_contents` | userId → users.id | CASCADE | **RESTRICT** |
| 19 | `playlists` | userId → users.id (owner) | CASCADE | **RESTRICT** |
| 20 | `playlist_members` | userId → users.id | CASCADE | **RESTRICT** |
| 21 | `manual_profiles` | userId → users.id | NO ACTION | **RESTRICT** |

### 4E. Feature Tables (FK additions — new constraints)

| # | Table | Add FK | References |
|---|-------|--------|-----------|
| 22 | `linked_accounts` | userId → users.id | ON DELETE CASCADE |
| 23 | `search_histories` | userId → users.id | ON DELETE CASCADE |
| 24 | `content_streams` | (no user FK) | N/A |
| 25 | `notification` | notifyId → users.id | ON DELETE NO ACTION |
| 26 | `analytics_events` | userId → users.id | ON DELETE NO ACTION |
| 27 | `premium_rollups` | userId → users.id | ON DELETE NO ACTION |
| 28 | `youtube_accounts` | userId → users.id | ON DELETE RESTRICT |
| 29 | `youtube_videos` | accountId → youtube_accounts.id | ON DELETE CASCADE |
| 30 | `upload_jobs` | videoId → youtube_videos.id | ON DELETE SET NULL |
| 31 | `publish_jobs` | userId → users.id | ON DELETE CASCADE |
| 32 | `publish_jobs` | linkedAccountId → linked_accounts.id | ON DELETE CASCADE |
| 33 | `publish_jobs` | uploadId → upload_jobs.id | ON DELETE SET NULL |
| 34 | `rate_limits` | userId → users.id (optional) | ON DELETE SET NULL |
| 35 | `rate_limit_logs` | userId → users.id (optional) | ON DELETE SET NULL |
| 36 | `data_protection_keys` | (replaced by verification_tokens) | DROP TABLE |
| 37 | `newsletter_subscribers` | (standalone) | N/A |

### 4F. Analytics Tables (FK additions)

| # | Table | Add FK |
|---|-------|--------|
| 38 | `youtube_channel_analytics` | userId → users.id ON DELETE NO ACTION |
| 39 | `youtube_video_analytics` | userId → users.id ON DELETE NO ACTION |
| 40 | `youtube_video_analytics` | videoId → youtube_videos.id ON DELETE CASCADE |
| 41 | `facebook_page_analytics` | userId → users.id ON DELETE NO ACTION |
| 42 | `facebook_post_analytics` | userId → users.id ON DELETE NO ACTION |
| 43 | `facebook_video_analytics` | userId → users.id ON DELETE NO ACTION |

---

## 5. Every DTO / Type

### 5A. Auth Types (modified)

| # | Type | File | Change |
|---|------|------|--------|
| 1 | `Session` (inferred from Better Auth) | `auth/index.ts` | **REMOVE**. Replace with custom session type: `{ user: User, session: SessionRow }`. |
| 2 | `AuthUser` / `AuthUserType` | frontend types | Add `onboardingStep`, `type`, `userName` to base `UserType`. Currently split across `UserType` and `AuthUserType`. |
| 3 | `UserType` | `src/types/account/user.type.ts` | Add missing fields: `userName`, `type`, `onboardingStep`, `profilePrivacy`, `isActive`. Currently missing from frontend `UserType`. |
| 4 | `AuthUserType` | `src/types/account/user.type.ts` | Merge into `UserType` or clarify contract. |
| 5 | `JwtPayload` / `ClaimTypes` | `src/types/auth/jwt.types.ts` | Add `onboardingStep` claim. Currently missing from frontend. |

### 5B. Request/Response Types (modified)

| # | Type | File | Change |
|---|------|------|--------|
| 6 | `RegisterRequestType` | `src/types/auth/signup.type.ts` | Uncomment `userName`. Add `deviceId`. Remove Better Auth-specific fields. |
| 7 | `TokenRequestType` (Login) | `src/types/auth/token.types.ts` | No change — already matches backend. |
| 8 | `TokenResponseType` | `src/types/auth/token.types.ts` | Add `success: boolean` field (backend currently relies on HTTP status, frontend expects in body). |
| 9 | `RefreshTokenRequestType` | `src/types/auth/token.types.ts` | No change — already has all 4 fields. |
| 10 | `Notification` (websocket) | `src/types/websocket.types.ts` | Add `link: string | null`. Add `isRead: boolean`. Rename `createdAt` handling for `lastModifiedOn`. |

### 5C. Profile Types (modified)

| # | Type | File | Change |
|---|------|------|--------|
| 11 | `UserProfileType` | frontend types | Add `isGuestView: boolean`. Currently missing from backend `ProfileModel`. |
| 12 | `PublicProfileModel` | frontend types | Rename `DisplayName` to `displayName` (PascalCase → camelCase). |
| 13 | `LinkedAccountType` | frontend types | Add `isImported: boolean`. Fix `profileImage` nullability. |

### 5D. New Types (created)

| # | New Type | Purpose |
|---|----------|---------|
| 14 | `UserSession` | `{ id, userId, provider, tokenValue, deviceId, ipAddress, userAgent, isValid, addedDate, expiryDate }` |
| 15 | `UserProfile` | `{ userId, firstName, lastName, bio, gender, phoneNumber, profilePrivacy, onboardingStep, referralCode, referredBy }` |
| 16 | `UserSecurity` | `{ userId, twoFactorEnabled, isLockedOut, lockoutEnd, accessFailedCount }` |
| 17 | `UserOAuthProvider` | `{ id, userId, provider, providerUid, email, name, avatarUrl }` |
| 18 | `VerificationToken` | `{ id, userId, purpose, token, data, expiresAt, usedAt }` |

---

## 6. Every Validator

| # | Validator | File | Change | Details |
|---|-----------|------|--------|---------|
| 1 | `sixDigitCodeSchema` | `auth-schemas.ts` | **NO CHANGE** | Format-only: 6-digit regex. |
| 2 | `emailOnlySchema` | `auth-schemas.ts` | **NO CHANGE** | Format-only: Zod email. |
| 3 | `verifyEmailWithCodeSchema` | `auth-schemas.ts` | **NO CHANGE** | Format-only: email + code. |
| 4 | `resetPasswordWithCodeSchema` | `auth-schemas.ts` | **NO CHANGE** | Format-only: email + code + password. |
| 5 | `passwordStrengthError` | `password.ts` | **NO CHANGE** | Format-only: length, case, digit, special. |
| 6 | `PASSWORD_MIN_LENGTH` | `constants/auth.ts` | **NO CHANGE** | Constant: 8. |
| 7 | `AUTH_CODE_TTL_SEC` | `constants/auth.ts` | **NO CHANGE** | Constant: 900. |
| 8 | `TWO_FA_CODE_TTL_SEC` | `constants/auth.ts` | **NO CHANGE** | Constant: 300. |
| 9 | `normalizeEmail` | `email/normalize.ts` | **NO CHANGE** | Gmail dot/plus canonicalization. |

**All validators are format-level and unaffected by schema changes.**

---

## 7. Every Middleware

| # | Middleware | File | Change | Details |
|---|-----------|------|--------|---------|
| 1 | Edge Middleware | `src/middleware.ts` | **REWRITE** | Currently: checks `better-auth.session_token` cookie presence. Replace: validate JWT Bearer token or `access_token` cookie. Cookie name changes. Auth check becomes JWT validation (decode + expiry check) instead of mere cookie presence. |
| 2 | Better Auth `nextCookies()` plugin | `auth/index.ts` | **REMOVE** | Better Auth middleware plugin. No longer needed. |
| 3 | `requireSession()` | `auth/require-session.ts` | **REWRITE** | Currently: `auth.api.getSession({ headers })`. Replace: decode JWT, query `identity.sessions` for validity, load user + profile + security. 2FA enforcement retained. |

### New Middleware Requirements

| # | New Middleware | Purpose |
|---|---------------|---------|
| 4 | `JwtValidationMiddleware` (NEW) | Validate JWT on every request. Extract from `Authorization: Bearer` header or `access_token` cookie. Decode, verify signature, check expiry. Attach user to request context. |
| 5 | `SessionValidationMiddleware` (NEW) | After JWT validation, verify session exists in `identity.sessions` and `isValid = true`. Supports device-level session management. |

---

## 8. Every Migration

### 8A. Phase 1 — Additive Schema (non-breaking)

| # | Migration Name | SQL Operations | Risk |
|---|----------------|----------------|------|
| M1 | `CreateUserProfiles` | `CREATE TABLE identity.user_profiles (...)` | Low — new table only |
| M2 | `CreateUserSecurity` | `CREATE TABLE identity.user_security (...)` | Low — new table only |
| M3 | `CreateUserOAuthProviders` | `CREATE TABLE identity.user_oauth_providers (...)` | Low — new table only |
| M4 | `CreateVerificationTokens` | `CREATE TABLE identity.verification_tokens (...)` | Low — new table only |
| M5 | `CreateIdentitySessions` | `CREATE TABLE identity.sessions (...)` | Low — new table only |
| M6 | `AddUserFKConstraints` | `ALTER TABLE identity.user_roles ADD CONSTRAINT ...`, `ALTER TABLE identity.user_claims ADD CONSTRAINT ...` | Low — add constraints to existing tables |
| M7 | `AddFeatureFKConstraints` | `ALTER TABLE linkedAccounts ADD CONSTRAINT ...` for all 12+ tables missing FK | Low — add constraints, verify no orphans first |

### 8B. Phase 2 — Data Migration (background)

| # | Migration Name | SQL Operations | Risk |
|---|----------------|----------------|------|
| M8 | `MigrateUserProfileData` | `INSERT INTO identity.user_profiles SELECT id, firstName, lastName, bio, ... FROM identity.users` | Medium — data copy |
| M9 | `MigrateUserSecurityData` | `INSERT INTO identity.user_security SELECT id, twoFactorEnabled, twoFactorSecret, ... FROM identity.users` | Medium — data copy |
| M10 | `MigrateOAuthProviders` | `INSERT INTO identity.user_oauth_providers SELECT ..., 'google', googleId, ... FROM identity.users WHERE googleId IS NOT NULL` | Medium — column to row conversion |
| M11 | `MigrateVerificationTokens` | Migrate `dataProtectionKeys` rows to `verification_tokens` with purpose mapping | Medium — table migration |
| M12 | `MigrateSessions` | Migrate `userLogins` rows to `identity.sessions` with `provider = 'jwt'` | Medium — table migration |

### 8C. Phase 3 — Feature-Flagged Code Switch

| # | Migration Name | Operations | Risk |
|---|----------------|------------|------|
| M13 | `CreateCompatibilityViews` | Create views exposing old column names alongside new ones for dual-read period | Low — views are additive |
| M14 | `AddIdentityIndexes` | `CREATE INDEX CONCURRENTLY` on new table FKs and query-critical columns | Low — index only |

### 8D. Phase 4 — Column Drop (after 14-day monitoring)

| # | Migration Name | SQL Operations | Risk |
|---|----------------|----------------|------|
| M15 | `DropFatUserColumns` | `ALTER TABLE identity.users DROP COLUMN firstName, lastName, bio, gender, ...` (21 columns) | **HIGH** — point of no return |
| M16 | `DropOldAuthTables` | `DROP TABLE identity.userLogins`, `DROP TABLE identity.dataProtectionKeys` | **HIGH** — after Better Auth retirement |

### 8E. Phase 5 — Better Auth Retirement

| # | Migration Name | Operations | Risk |
|---|----------------|------------|------|
| M17 | `DropBetterAuthTables` | `DROP TABLE auth.session`, `DROP TABLE auth.account`, `DROP TABLE auth.verification`, `DROP TABLE auth.passkey`, `DROP TABLE auth.usedFreeLimit` | **HIGH** — after custom auth is proven |

---

## 9. Every Environment Variable

### 9A. Variables to REMOVE (Better Auth)

| # | Variable | File | Reason |
|---|----------|------|--------|
| 1 | `BETTER_AUTH_SECRET` | `.env.development`, `.env.docker` | Better Auth HMAC secret. Replaced by `JWT_SECRET`. |
| 2 | `BETTER_AUTH_COOKIE_NAME` | `.env.development`, `.env.docker` | Cookie name. Replaced by `access_token` / `refresh_token`. |
| 3 | `BETTER_AUTH_URL` | `.env.development`, `.env.docker` | Better Auth base URL. No longer needed. |
| 4 | `NEXT_PUBLIC_BETTER_AUTH_URL` | `.env.development` | Client-side Better Auth URL. Remove. |

### 9B. Variables to ADD (JWT Auth)

| # | Variable | File | Purpose |
|---|----------|------|---------|
| 5 | `JWT_SECRET` | `.env.development` | HMAC signing secret for JWT access/refresh tokens |
| 6 | `JWT_AUDIENCE` | `.env.development` | JWT audience claim |
| 7 | `JWT_ISSUER` | `.env.development` | JWT issuer claim |
| 8 | `JWT_ACCESS_EXPIRATION_MINUTES` | `.env.development` | Access token TTL (e.g., `60` or `7d`) |
| 9 | `JWT_REFRESH_EXPIRATION_HOURS` | `.env.development` | Refresh token TTL (e.g., `720` or `30d`) |
| 10 | `ENCRYPTION_KEY` | `.env.development` | If custom auth encrypts tokens at rest |
| 11 | `ENCRYPTION_ALGORITHM` | `.env.development` | Algorithm for encryption |
| 12 | `ENCRYPTION_IV` | `.env.development` | IV for encryption |

### 9C. Variables to VERIFY (existing — used by auth flow)

| # | Variable | Status | Notes |
|---|----------|--------|-------|
| 13 | `GOOGLE_CLIENT_ID` | Retain | Used by new OAuth flow |
| 14 | `GOOGLE_CLIENT_SECRET` | Retain | Used by new OAuth flow |
| 15 | `REDIS_URL` | Retain | Session cache, rate limiting, OTP storage (if retained) |
| 16 | `DATABASE_URL` | Retain | PostgreSQL connection |
| 17 | `NEXT_PUBLIC_APP_URL` | Retain | App origin for JWT `iss` and CORS |
| 18 | `FRONTEND_URL` | Retain | CORS allowed origin |
| 19 | `NODE_ENV` | Retain | Controls dev/prod behavior |
| 20 | `PASSWORD_MIN_LENGTH` | Retain | Auth constant (may move to env) |

### 9D. Variable Count Summary

| Action | Count |
|--------|-------|
| Remove | 4 |
| Add | 8 |
| Verify (no change) | 8 |
| **Net change** | +4 env vars |

---

## 10. Every Auth Component

### 10A. Components to REMOVE (Better Auth)

| # | Component | File | Reason |
|---|-----------|------|--------|
| 1 | Better Auth `auth` instance | `auth/index.ts` | Replaced by custom auth service |
| 2 | Better Auth `authClient` | `lib/auth-client.ts` | Replaced by custom fetch-based client |
| 3 | Better Auth `nextCookies()` plugin | `auth/index.ts` | No longer needed |
| 4 | Better Auth `passkey` plugin | `auth/index.ts` | Passkey support removed with Better Auth |
| 5 | Better Auth `drizzleAdapter` | `auth/index.ts` | No longer needed |
| 6 | Better Auth `redisStorage` | `auth/index.ts` | No longer needed |
| 7 | Better Auth `crossSubDomainCookies` | `auth/index.ts` | Replaced by custom cookie management |
| 8 | Better Auth `databaseHooks` | `auth/index.ts` | Replaced by custom pre-insert logic |
| 9 | Better Auth API caller (`postToAuthApi`) | `auth/auth-api.ts` | No longer needed |
| 10 | Better Auth error parser | `auth/auth-error.ts` | No longer needed |
| 11 | `auth.config.ts` (CLI config) | root | No longer needed |

### 10B. Components to REWRITE (Custom Auth)

| # | New Component | Replaces | Purpose |
|---|---------------|----------|---------|
| 12 | `JwtTokenService` (new) | Better Auth session management | Create, validate, refresh JWT access/refresh tokens |
| 13 | `SessionStore` (new) | Better Auth session table | CRUD operations on `identity.sessions` |
| 14 | `AuthMiddleware` (new) | Better Auth `nextCookies()` + edge middleware | JWT validation on every request |
| 15 | `PassportStrategy` (existing, modify) | Better Auth `getSession()` | Use `@nestjs/passport` JWT strategy if migrating backend too, or custom JWT decode |
| 16 | `customAuthClient` (new) | Better Auth `authClient` | `fetch`-based client for login/register/refresh/logout endpoints |

### 10C. Components to RETAIN (unchanged)

| # | Component | File | Reason |
|---|-----------|------|--------|
| 17 | `generateSixDigitCode()` | `auth/verification-code.ts` | Format-level, independent of auth library |
| 18 | `storeEmailVerificationCode()` | `auth/verification-code.ts` | Retained (storage target may change to DB) |
| 19 | `verifyAndConsumeEmailCode()` | `auth/verification-code.ts` | Retained (storage target may change to DB) |
| 20 | `storePasswordResetCode()` | `auth/password-reset-code.ts` | Retained |
| 21 | `verifyAndConsumePasswordResetCode()` | `auth/password-reset-code.ts` | Retained |
| 22 | `enforceVerificationResendLimit()` | `auth/rate-limit.ts` | Redis-based, independent |
| 23 | `enforcePasswordResetRequestLimit()` | `auth/rate-limit.ts` | Redis-based, independent |
| 24 | `enforceChangePasswordLimit()` | `auth/rate-limit.ts` | Redis-based, independent |
| 25 | `passwordStrengthError()` | `lib/validation/password.ts` | Format-level |
| 26 | `normalizeEmail()` | `lib/email/normalize.ts` | Format-level |
| 27 | `OtpInput` component | `components/auth/otp-input.tsx` | UI-only |
| 28 | `AuthFooter` component | `components/auth/auth-footer.tsx` | UI-only |

### 10D. Auth Flow Migration Matrix

| Current Flow | Current Implementation | Target Implementation |
|-------------|----------------------|----------------------|
| **Register** | `authClient.signUp.email()` → Better Auth creates user + account rows | Custom tRPC `register` mutation → insert into `identity.users` + `identity.user_profiles` + `identity.user_security` |
| **Login** | `authClient.signIn.email()` → Better Auth creates session row | Custom tRPC `login` mutation → verify password, insert into `identity.sessions`, return JWT |
| **Logout** | Better Auth session revocation | `UPDATE identity.sessions SET isValid = false WHERE userId = ?` |
| **Token Refresh** | Better Auth session refresh | Verify refresh token → issue new access token pair |
| **OAuth (Google)** | `authClient.signIn.social({ provider: "google" })` | Custom OAuth redirect → callback handler → insert into `identity.user_oauth_providers` |
| **Password Reset** | Better Auth `request-password-reset` + custom OTP | Custom tRPC mutation → `verification_tokens` row + email |
| **Email Verification** | Better Auth `send-verification-email` + custom OTP | Custom tRPC mutation → `verification_tokens` row + email |
| **2FA Setup** | Custom tRPC `enable2fa` + Better Auth session | Custom tRPC `enable2fa` → `user_security` update |
| **Passkey** | Better Auth `passkey` plugin | **REMOVED** — not supported without Better Auth |
| **Session Validation** | `auth.api.getSession({ headers })` | JWT decode + `identity.sessions` lookup |

---

## 11. Every Foreign Key

### 11A. Current FK State (from Session 01 audit)

| Metric | Count |
|--------|-------|
| Tables referencing `user.id` | 113 |
| Tables with formal FK constraints | ~20 |
| Tables with NO FK at all | ~93 |

### 11B. FK Changes Required

#### Identity → Identity (CASCADE)

| # | Source Table | Source Column | Target Table | Target Column | onDelete | Change |
|---|-------------|---------------|-------------|---------------|----------|--------|
| 1 | `user_profiles` | `userId` | `users` | `id` | CASCADE | **NEW** |
| 2 | `user_security` | `userId` | `users` | `id` | CASCADE | **NEW** |
| 3 | `user_oauth_providers` | `userId` | `users` | `id` | CASCADE | **NEW** |
| 4 | `verification_tokens` | `userId` | `users` | `id` | CASCADE | **NEW** |
| 5 | `sessions` | `userId` | `users` | `id` | CASCADE | **NEW** (replaces userLogins) |
| 6 | `user_roles` | `userId` | `users` | `id` | CASCADE | **ADD** (missing) |
| 7 | `user_roles` | `roleId` | `roles` | `id` | CASCADE | **ADD** (missing) |
| 8 | `user_claims` | `userId` | `users` | `id` | CASCADE | **ADD** (missing) |
| 9 | `role_claims` | `roleId` | `roles` | `id` | CASCADE | **VERIFY** (may exist from migration) |

#### Feature → Identity (RESTRICT)

| # | Source Table | Source Column | Target Table | Target Column | onDelete | Change |
|---|-------------|---------------|-------------|---------------|----------|--------|
| 10 | `user_topics` | `userId` | `users` | `id` | **RESTRICT** | **CHANGE** (from CASCADE) |
| 11 | `user_follows` | `followerId` | `users` | `id` | **RESTRICT** | **CHANGE** (from CASCADE) |
| 12 | `user_follows` | `followedId` | `users` | `id` | **RESTRICT** | **CHANGE** (from CASCADE) |
| 13 | `user_contents` | `userId` | `users` | `id` | **RESTRICT** | **CHANGE** (from CASCADE) |
| 14 | `playlists` | `ownerId` | `users` | `id` | **RESTRICT** | **CHANGE** (from CASCADE) |
| 15 | `playlist_members` | `userId` | `users` | `id` | **RESTRICT** | **CHANGE** (from CASCADE) |
| 16 | `manual_profiles` | `userId` | `users` | `id` | **RESTRICT** | **CHANGE** (from NO ACTION) |
| 17 | `linked_accounts` | `userId` | `users` | `id` | **CASCADE** | **ADD** (missing) |

#### Feature → Identity (CASCADE — social graph, owned data)

| # | Source Table | Source Column | Target Table | Target Column | onDelete | Change |
|---|-------------|---------------|-------------|---------------|----------|--------|
| 18 | `youtube_accounts` | `userId` | `users` | `id` | CASCADE | **ADD** (missing) |
| 19 | `publish_jobs` | `userId` | `users` | `id` | CASCADE | **ADD** (missing) |
| 20 | `publish_jobs` | `linkedAccountId` | `linked_accounts` | `id` | CASCADE | **ADD** (missing) |
| 21 | `upload_jobs` | `videoId` | `youtube_videos` | `id` | SET NULL | **ADD** (missing) |
| 22 | `publish_jobs` | `uploadId` | `upload_jobs` | `id` | SET NULL | **ADD** (missing) |
| 23 | `youtube_videos` | `accountId` | `youtube_accounts` | `id` | CASCADE | **ADD** (missing) |

#### Analytics / Audit → Identity (NO ACTION)

| # | Source Table | Source Column | Target Table | Target Column | onDelete | Change |
|---|-------------|---------------|-------------|---------------|----------|--------|
| 24 | `analytics_events` | `userId` | `users` | `id` | NO ACTION | **ADD** (missing) |
| 25 | `premium_rollups` | `userId` | `users` | `id` | NO ACTION | **ADD** (missing) |
| 26 | `youtube_channel_analytics` | `userId` | `users` | `id` | NO ACTION | **ADD** (missing) |
| 27 | `youtube_video_analytics` | `userId` | `users` | `id` | NO ACTION | **ADD** (missing) |
| 28 | `facebook_page_analytics` | `userId` | `users` | `id` | NO ACTION | **ADD** (missing) |
| 29 | `facebook_post_analytics` | `userId` | `users` | `id` | NO ACTION | **ADD** (missing) |
| 30 | `facebook_video_analytics` | `userId` | `users` | `id` | NO ACTION | **ADD** (missing) |

#### Notification → Identity (NO ACTION)

| # | Source Table | Source Column | Target Table | Target Column | onDelete | Change |
|---|-------------|---------------|-------------|---------------|----------|--------|
| 31 | `notifications` | `notifyId` | `users` | `id` | NO ACTION | **ADD** (missing) |

#### Rate Limit / Search (SET NULL)

| # | Source Table | Source Column | Target Table | Target Column | onDelete | Change |
|---|-------------|---------------|-------------|---------------|----------|--------|
| 32 | `rate_limits` | `userId` | `users` | `id` | SET NULL | **ADD** (missing) |
| 33 | `rate_limit_logs` | `userId` | `users` | `id` | SET NULL | **ADD** (missing) |
| 34 | `search_histories` | `userId` | `users` | `id` | SET NULL | **ADD** (missing) |

#### Tables to DROP

| # | Table | Reason |
|---|-------|--------|
| 35 | `data_protection_keys` | Replaced by `verification_tokens` |
| 36 | `session` (Better Auth) | Replaced by `identity.sessions` |
| 37 | `account` (Better Auth) | Split into `users.passwordHash` + `user_oauth_providers` |
| 38 | `verification` (Better Auth) | Replaced by `identity.verification_tokens` |
| 39 | `passkey` (Better Auth) | Removed with Better Auth |
| 40 | `used_free_limit` | Audit if still used; likely remove |

### 11C. FK Summary

| Category | Count | onDelete Pattern |
|----------|-------|------------------|
| New identity FKs (CASCADE) | 5 | CASCADE |
| Existing identity FKs (add constraints) | 4 | CASCADE |
| Feature FKs (change to RESTRICT) | 7 | RESTRICT |
| Feature FKs (add, CASCADE) | 7 | CASCADE |
| Feature FKs (add, SET NULL) | 6 | SET NULL |
| Analytics/Audit FKs (add, NO ACTION) | 8 | NO ACTION |
| Notification FK (add, NO ACTION) | 1 | NO ACTION |
| Tables to DROP | 6 | N/A |
| **Total FK changes** | **38** | |

---

## 12. Every Build Impact

### 12A. Package Dependencies

| # | Package | Action | Reason |
|---|---------|--------|--------|
| 1 | `better-auth` | **REMOVE** from `package.json` | Core dependency removal |
| 2 | `@better-auth/react` | **REMOVE** from `package.json` | Client SDK removal |
| 3 | `@better-auth/passkey` | **REMOVE** from `package.json` | Passkey plugin removal |
| 4 | `@better-auth/redis-storage` | **REMOVE** from `package.json` | Secondary storage removal |
| 5 | `@node-rs/argon2` | **KEEP or ADD to server** | Password hashing still needed. Currently handled by Better Auth internally — must now be explicit. |
| 6 | `jose` or `jsonwebtoken` | **ADD** | JWT creation/verification library (currently handled by Better Auth) |
| 7 | `next-cookies` | **REMOVE** | Better Auth plugin |
| 8 | `zod` | **KEEP** | Validation (unchanged) |

### 12B. TypeScript Compilation

| # | Impact | Affected Files | Mitigation |
|---|--------|---------------|------------|
| 1 | `Session` type from `auth/index.ts` disappears | All files importing `Session` from `auth` | Replace with new custom `Session` type |
| 2 | `authClient` methods change signature | `auth-form.tsx`, all files using `authClient.signIn.*`, `authClient.signUp.*` | Rewrite to custom API calls |
| 3 | New entity types for split tables | All tRPC handlers, all Drizzle queries | Create new type definitions |
| 4 | Import paths change for split schemas | `schema.ts` barrel, all query files | Update barrel exports |
| 5 | `inferAdditionalFields` plugin type disappears | `auth-client.ts`, `auth-form.tsx` | Manual type definitions |

### 12C. Bundle Size

| # | Impact | Est. Change |
|---|--------|-------------|
| 1 | Remove `better-auth` + plugins | **-150-300 KB** (server-side only, not in client bundle) |
| 2 | Add `jose`/`jsonwebtoken` | **+30-50 KB** |
| 3 | Remove `@better-auth/react` | **-20-40 KB** (client bundle) |
| 4 | Custom auth client (fetch-based) | **+5-10 KB** |
| **Net bundle impact** | | **-135-280 KB** reduction |

### 12D. Build Configuration

| # | Config File | Change |
|---|-------------|--------|
| 1 | `next.config.js` / `next.config.ts` | Remove any Better Auth transpile packages. Add `argon2` to `serverExternalPackages` if using native binding. |
| 2 | `tsconfig.json` | No change expected — import path updates are handled by file renames. |
| 3 | `drizzle.config.ts` | Update `schema` path to point to new barrel export. |
| 4 | `auth.config.ts` | **DELETE** — Better Auth CLI config. |

### 12E. Test Infrastructure

| # | Test File | Change |
|---|-----------|--------|
| 1 | `auth-error.test.ts` | **DELETE** — tests deleted module |
| 2 | `auth-schemas.test.ts` | **NO CHANGE** — format-level tests |
| 3 | `password.test.ts` | **NO CHANGE** — format-level tests |
| 4 | New: `jwt-token.service.test.ts` | **CREATE** — tests for JWT creation/validation |
| 5 | New: `session.service.test.ts` | **CREATE** — tests for session CRUD |
| 6 | New: `auth.service.test.ts` | **CREATE** — tests for register/login/refresh flows |

### 12F. CI/CD Pipeline

| # | Pipeline Step | Change |
|---|--------------|--------|
| 1 | `npm install` | Will no longer install `better-auth` packages. Install `jose`/`jsonwebtoken`. |
| 2 | `npm run build` | Must pass with new import structure. No circular import introduction. |
| 3 | `npm run lint` | Must pass with removed/added imports. |
| 4 | `npm run test` | Must pass. 1 file deleted, 3 new test files added. |
| 5 | `drizzle-kit generate` | Must produce correct migrations for new tables. |
| 6 | `drizzle-kit push` | Must be idempotent for staging deployments. |

### 12G. Deployment Impact

| # | Aspect | Impact |
|---|--------|--------|
| 1 | **Database migration order** | Phase 1 (new tables) must deploy BEFORE application code changes. Feature flag (`USE_CUSTOM_AUTH`) controls which code path is active. |
| 2 | **Rolling deploy safety** | Old code (Better Auth) and new code (custom auth) must coexist during deploy window. Both must work with the new schema. |
| 3 | **Redis flush** | After migration, existing Better Auth session keys (`better-auth:*`) must be flushed or ignored. |
| 4 | **Cookie domain** | If cookie name changes from `better-auth.session_token` to `access_token`, all logged-in users will be logged out on deploy. Plan for this. |
| 5 | **Environment variables** | New JWT vars must be set in all environments BEFORE code deployment. Remove Better Auth vars AFTER code deployment. |

---

## Appendix A: Complete Change Count

| Category | Files | New Files | Deleted Files | Modified Files | Unchanged Files |
|----------|-------|-----------|---------------|----------------|-----------------|
| Auth Core | 9 | 0 | 4 | 5 | 0 |
| Auth Client | 1 | 0 | 0 | 1 | 0 |
| Middleware | 1 | 0 | 0 | 1 | 0 |
| DB Connection | 1 | 0 | 0 | 0 | 1 |
| DB Schema (auth) | 1 | 0 | 0 | 1 | 0 |
| DB Schema (other) | 48 | 0 | 0 | 6 | 42 |
| Shared Schema | 5 | 0 | 0 | 3 | 2 |
| tRPC Routers | 1 | 0 | 0 | 1 | 0 |
| Validation | 4 | 0 | 0 | 0 | 4 |
| Auth UI | 3 | 0 | 0 | 1 | 2 |
| Auth Pages | 7 | 0 | 0 | 0 | 7 |
| Env/Config | 3 | 0 | 1 | 2 | 0 |
| Tests | 3 | 3 | 1 | 0 | 2 |
| Types | 5 | 3 | 0 | 2 | 0 |
| **TOTAL** | **94** | **3** | **6** | **23** | **62** |

## Appendix B: Execution Order

| Phase | Depends On | Duration Est. | Reversible |
|-------|-----------|---------------|------------|
| **Phase 0**: Backup | None | 1 hour | N/A (backup only) |
| **Phase 1**: New tables (M1-M7) | Phase 0 | 2-3 days | YES |
| **Phase 2**: Data migration (M8-M12) | Phase 1 | 3-5 days | YES (with backup) |
| **Phase 3**: Feature-flagged code switch (M13-M14) | Phase 2 | 5-7 days | YES (toggle flag) |
| **Phase 4**: Column drop (M15-M16) | Phase 3 + 14 days monitoring | 1 day | **NO** (point of no return) |
| **Phase 5**: Better Auth retirement (M17) | Phase 4 + stability confirmation | 1 day | YES (reinstall package) |
| **Total** | | **~3-4 weeks** | |

## Appendix C: Risk Register

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | Cookie name change logs out all users on deploy | HIGH | CERTAIN | Plan for it. Notify users. Or use dual-cookie detection during transition. |
| R2 | Data loss during column split migration | CRITICAL | LOW | Phase 0 backup. Staging-first. Row count verification. |
| R3 | 2FA enforcement remains broken | HIGH | CERTAIN | Fix in new `requireSession()` implementation. Gate session creation on 2FA. |
| R4 | Better Auth `passkey` users lose access | HIGH | MEDIUM | Audit passkey usage. If < 5 users, notify and provide alternative login. If 0, ignore. |
| R5 | Shared-schema drift causes gaddr.com query failures | HIGH | LOW | Fix drift BEFORE deploying. Verify all columns present. |
| R6 | RESTRICT FKs block user deletion in production | MEDIUM | MEDIUM | Implement deletion protocol (Phase 2 of Session 04 §4.4) BEFORE deploying RESTRICT. |
| R7 | In-flight BullMQ jobs reference old PK types | MEDIUM | LOW | Ensure job payloads are UUID-compatible before migration. |
| R8 | Circular imports from split schema modules | LOW | LOW | Enforce strict barrel export pattern. No cross-schema imports outside barrel. |

---

*Generated: 2026-07-19*
*Source sessions: 01 (Project A Audit), 02 (Project B Audit), 03 (Schema Comparison), 04 (Shared Identity Architecture), 05 (Migration Strategy)*
*Total entities analyzed: 38 TypeORM + 59 Drizzle = 97*
*Total FK relationships: 38 changes across 34 tables*
*Total file changes: 23 modified, 6 deleted, 3 created = 32 file operations*
