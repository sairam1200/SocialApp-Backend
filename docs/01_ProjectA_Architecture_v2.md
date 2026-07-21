# 01 — Project A (gaddr-jobs) Architecture Review v2

> **Scope**: `E:\Github\gaddep\gaddr-jobs` — Full-stack Next.js application
> **Date**: 2026-07-19
> **Status**: DRAFT
> **Purpose**: Comprehensive architecture review for cross-project integration. Establishes this project as the Schema Owner for the `user` table and auth-related schemas.
> **Reviewer**: opencode (automated)
> **Review History**:
>
> | Version | Date | Author | Changes |
> |---------|------|--------|---------|
> | 1.0 | 2026-07-19 | opencode | Initial architecture audit |
> | 2.0 | 2026-07-19 | opencode | Full v2 rewrite with corrected counts, ADRs, new sections, validated against live codebase |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Database Schema](#3-database-schema)
4. [Authentication Architecture](#4-authentication-architecture)
5. [Authorization / RBAC](#5-authorization--rbac)
6. [API Layer](#6-api-layer)
7. [Redis / Caching Infrastructure](#7-redis--caching-infrastructure)
8. [File Storage](#8-file-storage)
9. [Email System](#9-email-system)
10. [Key Findings](#10-key-findings)
11. [Architecture Decision Records (ADRs)](#11-architecture-decision-records-adrs)
12. [Assumptions and Constraints](#12-assumptions-and-constraints)
13. [Open Questions](#13-open-questions)

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| **Project** | gaddr-jobs — Next.js App Router (v16) |
| **Runtime** | Node.js >= 20 |
| **Language** | TypeScript 5.x |
| **Total Drizzle Tables** | **151** |
| **tRPC Sub-Routers** | **76** (in `_app.ts` registration) |
| **API Route Handlers** | **15** |
| **SQL Migrations** | **85** files |
| **Schema Files** | **60** `*-schema.ts` + 1 `auth-schema.ts` = 61 total |
| **Auth Methods** | Email+Password, Google OAuth, Passkey (WebAuthn) |
| **Database** | PostgreSQL (Neon cloud), postgres.js driver |
| **Redis** | ioredis (primary) + Upstash (rate limiting) |

### Overall Readiness Score: **6.5 / 10**

The application is feature-rich and architecturally sound in many areas (Better Auth integration, dual Redis strategy, comprehensive rate limiting). However, several critical issues reduce the score:

- **CRITICAL**: 2FA bypass vulnerability (documented in code, not fixed)
- **HIGH**: shared-schema drift (9 missing columns vs. auth-schema)
- **HIGH**: Migration journal tracks only 14 of 85 files
- **MEDIUM**: 6 dead fix scripts and backup file in repo root
- **MEDIUM**: Duplicate migration numbering at 0069 and 0078
- **LOW**: Inconsistent FK naming conventions across tables

---

## 2. Technology Stack

### Core Dependencies (from `package.json`)

| Layer | Package | Version | Notes |
|-------|---------|---------|-------|
| **Framework** | `next` | `16.2.1` | App Router |
| **React** | `react` / `react-dom` | `19.2.4` | React 19 |
| **Language** | `typescript` | `^5` | TypeScript 5.x |
| **Auth** | `better-auth` | `^1.5.6` | Runtime auth library |
| **Auth Passkey** | `@better-auth/passkey` | `1.5.6` | Pinned version |
| **Auth Redis** | `@better-auth/redis-storage` | `^1.5.6` | Secondary session storage |
| **ORM** | `drizzle-orm` | `^0.45.2` | |
| **DB Driver** | `postgres` | `^3.4.8` | postgres.js |
| **tRPC** | `@trpc/server` + `@trpc/client` + `@trpc/react-query` | `^11.16.0` | |
| **Validation** | `zod` | `^4.3.6` | |
| **Redis (primary)** | `ioredis` | `^5.10.1` | Pub/sub, OTP store, rate limit (auth) |
| **Redis (Upstash)** | `@upstash/redis` + `@upstash/ratelimit` | `^1.38.0` / `^2.0.8` | Rate limiting (API) |
| **Email** | `nodemailer` | `^9.0.1` | SMTP via Brevo relay |
| **Email (备用)** | `resend` | `^6.14.0` | Available but not in primary transport |
| **Email Templates** | `@react-email/components` + `react-email` | `^1.0.12` / `^6.6.5` | |
| **File Upload** | `cloudinary` | `^2.10.0` | Image/file storage |
| **Payments** | `stripe` + `@stripe/stripe-js` | `^22.2.3` / `^9.8.0` | |
| **Analytics** | `posthog-js` + `posthog-node` + `@posthog/react` | | Product analytics |
| **Monitoring** | `@sentry/nextjs` | `^10.59.0` | Error tracking |
| **Web3** | `viem` + `wagmi` + `@rainbow-me/rainbowkit` | | Wallet connect |
| **Blockchain** | `hardhat` + `ethers` + `@openzeppelin/contracts` | | Smart contracts (dev) |
| **UI** | shadcn, lucide-react, motion, recharts, tiptap | | Component library |
| **Env Validation** | `@t3-oss/env-nextjs` | `^0.13.11` | Type-safe env vars |
| **Linter** | `@biomejs/biome` | `2.2.0` | |
| **Testing** | `vitest` + `@playwright/test` | `^4.1.2` / `^1.61.0` | Unit, integration, E2E |
| **Other** | `pgvector` | `^0.3.0` | Vector embeddings |
| **Other** | `pusher` + `pusher-js` | `^5.3.4` / `^8.5.0` | Real-time events |
| **Other** | `pdf-parse` | `^2.4.5` | PDF parsing |

### Dev Dependencies

| Package | Version | Notes |
|---------|---------|-------|
| `@node-rs/argon2` | `^2.0.2` | Password hashing (Rust native) |
| `drizzle-kit` | `^0.31.10` | Migration tooling |
| `pg` | `^8.22.0` | PostgreSQL client (used by drizzle-kit) |
| `babel-plugin-react-compiler` | `1.0.0` | React Compiler |
| `tailwindcss` | `^4` | CSS framework |

---

## 3. Database Schema

### 3.1 Overview

| Metric | Value |
|--------|-------|
| **Total Tables** | **151** (across 61 schema files) |
| **Driver** | postgres.js (`postgres` ^3.4.8) |
| **Connection** | `drizzle-orm/postgres-js` |
| **Dialect** | PostgreSQL |
| **Primary Key Type** | `text` (UUID) for auth tables; `serial` for most others |

### 3.2 Schema Organization

**File**: `src/server/db/schema.ts` — Master barrel export (72 lines)
- Re-exports all 61 sub-schema files via `export *`
- Special handling for `milestone-dispute-schema.ts` (selective exports to avoid naming conflicts with `dispute-schema.ts`)

**File**: `src/server/db/index.ts` — DB client (26 lines)
```typescript
const client = postgres(env.DATABASE_URL, {
  max: poolMax,           // 1 on Vercel, env.DATABASE_POOL_MAX otherwise
  prepare: !isVercel,     // Prepared statements disabled on Vercel
  ssl: needsSsl ? "require" : false,
  connect_timeout: 10,
  idle_timeout: 30,
});
export const db = drizzle(client, { schema });
```

### 3.3 Table Count by Schema File

| Schema File | Table Count | Tables |
|-------------|-------------|--------|
| `auth-schema.ts` | 7 | user, userIdMapping, session, account, verification, passkey, usedFreeLimit |
| `merger-schema.ts` | 18 | profiles, relationships, linkedAccounts, userTopics, notificationEvents, notificationTemplates, newsletterSubscribers, userContents, playlists, playlistMembers, playlistContent, socialAnalytics, youtubeAccounts, youtubeVideos, contentStreams, uploadJobs, searchHistories, premiumRollups |
| `community-schema.ts` | 7 | community, communityMember, communityPost, communityEvent, communityEventAttendee, communityPoll, communityPollVote |
| `passport-schema.ts` | 8 | passport, passportEmploymentHistory, passportEducation, passportCertifications, passportReferences, passportVolunteering, passportAssessments, passportVerifiedMilestones |
| `notification-schema.ts` | 6 | notificationPreference, notification, conversation, conversationParticipant, message, outreachUnsubscribe |
| `recruiter-crm-schema.ts` | 6 | (6 CRM tables) |
| `project-schema.ts` | 5 | project, proposal, dispute (project), milestone, timeEntry |
| `profile-schema.ts` | 4 | jobSeekerProfile, freelancerProfile, freelancerAvailability, businessProfile |
| `interview-intelligence-schema.ts` | 4 | interviewTranscript, interviewSummary, interviewEvidence, interviewFeedbackQuality |
| `scam-detection-schema.ts` | 4 | (4 scam detection tables) |
| `career-memory-schema.ts` | 3 | journalEntry, achievement, careerGoal |
| `community-fund-schema.ts` | 3 | communityFund, fundContribution, fundPayout |
| `mentorship-schema.ts` | 3 | mentorProfile, mentorshipSession, mentorRating |
| `milestone-dispute-schema.ts` | 3 | dispute (milestone), disputeEvidence, disputeMessage |
| `project-room-schema.ts` | 3 | (3 project room tables) |
| `skill-schema.ts` | 3 | (3 skill tables) |
| `talent-schema.ts` | 3 | (3 talent tables) |
| `team-schema.ts` | 3 | (3 team tables) |
| `trust-schema.ts` | 3 | (3 trust tables) |
| `bounty-schema.ts` | 2 | bounty, bountyApplication |
| `cofounder-schema.ts` | 2 | cofounderListing, cofounderMatch |
| `company-schema.ts` | 2 | company, companyFollow |
| `contribution-schema.ts` | 1 | contributionRecord |
| `credential-schema.ts` | 2 | credentialIssuer, issuedCredential |
| `credit-schema.ts` | 2 | creditBalance, creditTransaction |
| `dispute-schema.ts` | 2 | stripeDispute, paymentRefund |
| `external-job-schema.ts` | 2 | externalJob, scrapeSource |
| `governance-schema.ts` | 2 | governanceProposal, governanceVote |
| `interview-kit-schema.ts` | 2 | interviewKit, interviewScorecard |
| `internal-marketplace-schema.ts` | 2 | internalOpportunity, marketplaceListing |
| `network-schema.ts` | 2 | connection, connectionRequest |
| `partner-reward-schema.ts` | 2 | partner, partnerReward |
| `token-schema.ts` | 2 | (2 token tables) |
| `university-schema.ts` | 2 | (2 university tables) |
| `smart-account-schema.ts` | 2 | (2 smart account tables) |
| `activity-feed-schema.ts` | 1 | activityFeed |
| `admin-ai-key-schema.ts` | 1 | adminAiKey |
| `ai-audit-schema.ts` | 1 | aiAuditLog |
| `ai-settings-schema.ts` | 1 | aiSetting |
| `analytics-schema.ts` | 1 | analyticsEvent |
| `application-schema.ts` | 1 | application |
| `audit-schema.ts` | 1 | auditLog |
| `cal-user-schema.ts` | 1 | calUser |
| `contract-schema.ts` | 1 | contract |
| `crypto-payment-schema.ts` | 1 | cryptoPayment |
| `employer-verification-schema.ts` | 1 | employerVerification |
| `endorsement-schema.ts` | 1 | endorsement |
| `gdpr-schema.ts` | 1 | accountDeletionLog |
| `invoice-schema.ts` | 1 | invoice |
| `issuer-registry-schema.ts` | 1 | trustedIssuer |
| `meeting-schema.ts` | 1 | meeting |
| `milestone-validation-schema.ts` | 1 | milestoneValidation |
| `opportunity-schema.ts` | 1 | opportunity |
| `proof-of-contribution-schema.ts` | 1 | proofOfContribution |
| `review-schema.ts` | 1 | review |
| `saved-jobs-schema.ts` | 1 | savedJob |
| `saved-search-schema.ts` | 1 | savedSearch |
| `selective-disclosure-schema.ts` | 1 | disclosurePolicy |

### 3.4 User Table — Complete Column Reference (38 columns)

**File**: `src/server/db/auth-schema.ts:12-57`
**DB table name**: `"user"` | **PK**: `text` (UUID, generated by Better Auth)

| # | Field | DB Column | Type | Nullable | Default | Unique |
|---|-------|-----------|------|----------|---------|--------|
| 1 | `id` | `id` | text | NOT NULL | — | PK |
| 2 | `name` | `name` | text | NOT NULL | — | No |
| 3 | `email` | `email` | text | NOT NULL | — | UNIQUE |
| 4 | `emailVerified` | `email_verified` | boolean | NOT NULL | `false` | No |
| 5 | `image` | `image` | text | NULLABLE | null | No |
| 6 | `createdAt` | `created_at` | timestamp | NOT NULL | `now()` | No |
| 7 | `updatedAt` | `updated_at` | timestamp | NOT NULL | `now()` + onUpdate | No |
| 8 | `firstName` | `first_name` | text | NOT NULL | — | No |
| 9 | `lastName` | `last_name` | text | NOT NULL | — | No |
| 10 | `role` | `role` | text | NULLABLE | null | No |
| 11 | `twoFactorEnabled` | `two_factor_enabled` | boolean | NULLABLE | `false` | No |
| 12 | `twoFaVerifiedAt` | `two_fa_verified_at` | timestamp | NULLABLE | null | No |
| 13 | `isVerified` | `is_verified` | boolean | NOT NULL | `false` | No |
| 14 | `isAdmin` | `is_admin` | boolean | NOT NULL | `false` | No |
| 15 | `stripeCustomerId` | `stripe_customer_id` | text | NULLABLE | null | No |
| 16 | `stripePriceId` | `stripe_price_id` | text | NULLABLE | null | No |
| 17 | `stripeSubscriptionId` | `stripe_subscription_id` | text | NULLABLE | null | No |
| 18 | `subscriptionStatus` | `subscription_status` | text | NOT NULL | `"none"` | No |
| 19 | `subscriptionPlan` | `subscription_plan` | text | NOT NULL | `"free"` | No |
| 20 | `jobPostLimit` | `job_post_limit` | integer | NOT NULL | `1` | No |
| 21 | `activeJobPostCount` | `active_job_post_count` | integer | NOT NULL | `0` | No |
| 22 | `walletAddress` | `wallet_address` | text | NULLABLE | null | No |
| 23 | `privateSearchMode` | `private_search_mode` | boolean | NULLABLE | `false` | No |
| 24 | `blockedEmployers` | `blocked_employers` | text[] | NULLABLE | `'{}'::text[]` | No |
| 25 | `aiAnalysisOptOut` | `ai_analysis_opt_out` | boolean | NULLABLE | `false` | No |
| 26 | `googleId` | `google_id` | text | NULLABLE | null | UNIQUE |
| 27 | `phoneNumber` | `phone_number` | text | NULLABLE | null | No |
| 28 | `gender` | `gender` | text | NULLABLE | null | No |
| 29 | `dateOfBirth` | `date_of_birth` | timestamp | NULLABLE | null | No |
| 30 | `onboardingStep` | `onboarding_step` | text | NULLABLE | `"not_started"` | No |
| 31 | `referralCode` | `referral_code` | text | NULLABLE | null | UNIQUE |
| 32 | `referredBy` | `referred_by` | text | NULLABLE | null | No |
| 33 | `profilePrivacy` | `profile_privacy` | text | NULLABLE | `"public"` | No |
| 34 | `sourceApp` | `source_app` | text | NULLABLE | `"jobs"` | No |
| 35 | `status` | `status` | text | NULLABLE | `"active"` | No |
| 36 | `deletedAt` | `deleted_at` | timestamp | NULLABLE | null | No |
| 37 | `bannedAt` | `banned_at` | timestamp | NULLABLE | null | No |
| 38 | `banReason` | `ban_reason` | text | NULLABLE | null | No |

#### Column Groups by Origin

| Group | Columns | Origin |
|-------|---------|--------|
| **Core Auth** (Better Auth) | id, name, email, emailVerified, image, createdAt, updatedAt | Better Auth managed |
| **Additional Fields** | firstName, lastName, role, isAdmin | Better Auth `additionalFields` config |
| **2FA** | twoFactorEnabled, twoFaVerifiedAt | Custom email-based 2FA |
| **Verification** | isVerified | Platform verification badge |
| **Stripe/Billing** | stripeCustomerId, stripePriceId, stripeSubscriptionId, subscriptionStatus, subscriptionPlan, jobPostLimit, activeJobPostCount | Stripe integration |
| **Privacy** | privateSearchMode, blockedEmployers, aiAnalysisOptOut | Privacy controls |
| **Crypto** | walletAddress | Blockchain integration |
| **gaddr.com Merger** | googleId, phoneNumber, gender, dateOfBirth, onboardingStep, referralCode, referredBy, profilePrivacy, sourceApp | Migration 0063 |
| **Soft Delete/GDPR** | status, deletedAt | Migration 0083 |
| **Admin/Ban** | bannedAt, banReason | Migration 0084 |

### 3.5 Auth-Related Tables

#### Session Table (`auth-schema.ts:65-82`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | text | PK | |
| `expiresAt` | timestamp | NOT NULL | |
| `token` | text | NOT NULL | UNIQUE — opaque, not JWT |
| `createdAt` | timestamp | NOT NULL | `now()` |
| `updatedAt` | timestamp | NOT NULL | onUpdate |
| `ipAddress` | text | NULLABLE | |
| `userAgent` | text | NULLABLE | |
| `userId` | text | NOT NULL | FK → user.id CASCADE |

**Index**: `session_userId_idx` on `userId`

#### Account Table (`auth-schema.ts:84-106`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | text | PK | |
| `accountId` | text | NOT NULL | Provider-specific ID |
| `providerId` | text | NOT NULL | "email" or "google" |
| `userId` | text | NOT NULL | FK → user.id CASCADE |
| `accessToken` | text | NULLABLE | OAuth token |
| `refreshToken` | text | NULLABLE | OAuth refresh |
| `idToken` | text | NULLABLE | OAuth ID token |
| `accessTokenExpiresAt` | timestamp | NULLABLE | |
| `refreshTokenExpiresAt` | timestamp | NULLABLE | |
| `scope` | text | NULLABLE | |
| `password` | text | NULLABLE | Argon2id hash (email provider) |
| `createdAt` | timestamp | NOT NULL | |
| `updatedAt` | timestamp | NOT NULL | |

**Index**: `account_userId_idx` on `userId`

#### Verification Table (`auth-schema.ts:108-122`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | text | PK | |
| `identifier` | text | NOT NULL | |
| `value` | text | NOT NULL | |
| `expiresAt` | timestamp | NOT NULL | |
| `createdAt` | timestamp | NOT NULL | |
| `updatedAt` | timestamp | NOT NULL | |

**Index**: `verification_identifier_idx` on `identifier`

#### Passkey Table (`auth-schema.ts:124-145`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | text | PK | |
| `name` | text | NULLABLE | |
| `publicKey` | text | NOT NULL | |
| `userId` | text | NOT NULL | FK → user.id CASCADE |
| `credentialID` | text | NOT NULL | UNIQUE INDEX |
| `counter` | integer | NOT NULL | default 0 |
| `deviceType` | text | NOT NULL | |
| `backedUp` | boolean | NOT NULL | default false |
| `transports` | text | NULLABLE | |
| `createdAt` | timestamp | NOT NULL | |
| `aaguid` | text | NULLABLE | |

**Indexes**: `passkey_credential_id_idx` (unique), `passkey_user_idx`

> **Note**: Passkey table uses camelCase column names (`publicKey`, `credentialID`, etc.) unlike all other tables which use snake_case. This is because Better Auth's passkey plugin manages this table.

#### UserIdMapping Table (`auth-schema.ts:59-63`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `jobsTextId` | text | PK | gaddr-jobs text ID |
| `gaddrUuid` | text | NOT NULL | UNIQUE — gaddr.com UUID |
| `migratedAt` | timestamp | NOT NULL | |

#### UsedFreeLimit Table (`auth-schema.ts:167-174`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `email` | text | PK | Normalized email |
| `consumedAt` | timestamp | NOT NULL | |

**Index**: `used_free_limit_email_idx` on `email`

### 3.6 Foreign Key Dependency Map

**49 schema files** import `user` from `auth-schema` and create FK references.

**113 FK columns** reference `user.id` across the database (including auth tables).

#### onDelete Behavior Summary

| Behavior | Count | Percentage |
|----------|-------|------------|
| `cascade` | ~107 | ~94.7% |
| `set null` | 7 | ~6.2% |
| Not specified (NO ACTION) | 4 | ~3.5% |

**SET NULL columns** (preserve data when user is deleted):
1. `aiAuditLog.userId` — audit trail preserved
2. `analyticsEvent.userId` — analytics preserved
3. `newsletterSubscribers.userId` — newsletter preserved
4. `opportunity.createdBy` — opportunities preserved
5. `pipelineCandidate.movedBy` — CRM history preserved
6. `referral.candidateId` — referral preserved
7. `milestoneValidation.reviewedBy` — validation preserved

**Missing onDelete (defaults to PostgreSQL NO ACTION)**:

| Table | Column | Risk |
|-------|--------|------|
| `stripe_dispute` | `userId` | Orphaned dispute records |
| `refund` | `userId` | Orphaned refund records |
| `invoice` | `userId` | Orphaned invoices |
| `time_entry` | `approvedBy` | Orphaned approval reference |

Additionally, `account_deletion_log.userId` in `gdpr-schema.ts` has **no FK constraint at all** (just `text("user_id").notNull()`).

---

## 4. Authentication Architecture

### 4.1 Better Auth Configuration

**File**: `src/server/auth/index.ts` (178 lines)

| Config Key | Value | Notes |
|------------|-------|-------|
| `secret` | `env.BETTER_AUTH_SECRET` | Server-side HMAC secret (min 32 chars) |
| `baseURL` | `env.NEXT_PUBLIC_APP_URL` | Canonical app URL |
| `trustedOrigins` | Dev: localhost variants; Prod: NEXT_PUBLIC_APP_URL, BETTER_AUTH_URL, https://gaddr.com | |
| `crossSubDomainCookies` | Enabled in prod on `.gaddr.com` | Cross-subdomain session sharing |
| `database` | `drizzleAdapter(db, { provider: "pg", schema })` | All Drizzle schema passed |
| `secondaryStorage` | Redis via `@better-auth/redis-storage` (prefix `better-auth:`) | Optional, fails gracefully if REDIS_URL unset |
| `emailAndPassword.enabled` | `true` | |
| `emailAndPassword.requireEmailVerification` | `true` | Must verify email before access |
| `emailAndPassword.minPasswordLength` | `8` | From `PASSWORD_MIN_LENGTH` constant |
| `emailAndPassword.resetPasswordTokenExpiresIn` | `300` (5 min) | `TWO_FA_CODE_TTL_SEC` |
| `rateLimit.enabled` | `!isTest` | Disabled in test env |
| `emailVerification.expiresIn` | `86400` (24 hours) | Better Auth link token TTL |
| `plugins` | `nextCookies()`, `passkey({ rpName: "Gaddr", rpID, origin })` | |

**Custom user fields** (additionalFields):
- `firstName`: string, required, input=true
- `lastName`: string, required, input=true
- `role`: string, required=false, input=false (server-controlled)
- `isAdmin`: boolean, required=false, input=false (server-controlled)

### 4.2 Auth Methods

1. **Email + Password** (primary) — Argon2id hashing via `@node-rs/argon2`
2. **Google OAuth** — Social provider via `socialProviders.google`
3. **Passkey / WebAuthn** — `@better-auth/passkey` plugin

### 4.3 Session Model

Better Auth uses **database-backed sessions** with opaque tokens. There are **NO JWTs**, **NO refresh tokens**.

| Aspect | Detail |
|--------|--------|
| **Storage** | PostgreSQL `session` table |
| **Token** | Random opaque string (not JWT) |
| **Cookie** | `better-auth.session_token` (HTTP-only, secure) |
| **Secure Variant** | `__Secure-better-auth.session_token` |
| **Cross-subdomain** | `.gaddr.com` domain in production |
| **Secondary Cache** | Redis (`better-auth:` prefix) — optional |
| **Revocation** | Delete session row (immediate) |
| **Expiry** | Configurable per session; checked on each request |

**Session type** (exported from `src/server/auth/index.ts:178`):
```typescript
type Session = {
  user: { id, email, emailVerified, image, firstName, lastName, name, role, isAdmin };
  session: { id, userId, expiresAt, token, ipAddress, userAgent };
};
```

### 4.4 Password Rules

**File**: `src/lib/validation/password.ts` (client) + `src/lib/constants/auth.ts` (shared)

```
1. >= 8 characters (PASSWORD_MIN_LENGTH)
2. At least one lowercase letter
3. At least one uppercase letter
4. At least one digit
5. At least one special character (!@$%^&*()_+-=[]{};':"\\|,<>/?`~)
```

**Server-side hashing**: Argon2id via `@node-rs/argon2` (Rust native binding, listed in `devDependencies` and `trustedDependencies`).

### 4.5 Email Normalization

**File**: `src/lib/email/normalize.ts`

- Trim + lowercase
- Gmail: strips dots (`.`) and plus suffix (`+...`)
- Gmail: normalizes `@googlemail.com` to `@gmail.com`
- Applied to all email-based lookups and OTP storage keys

### 4.6 Authentication Flows

#### Signup Flow

```
1. User fills form (firstName, lastName, email, password)
2. Client-side validation:
   - email format (z.email())
   - password strength (passwordStrengthError)
   - password confirmation match
   - terms acceptance checkbox
   - real-time email availability check (tRPC isEmailAvailable)
3. authClient.signUp.email({ email, password, firstName, lastName })
4. Better Auth databaseHook user.create.before:
   - Block duplicate email (queries user table)
   - Split Google's name into firstName/lastName if missing
   - Compose name from firstName + lastName
5. Better Auth creates: user row + account row (provider: email)
6. sendVerificationEmail hook:
   - Generates 6-digit OTP via randomInt(0, 999999)
   - Stores SHA-256 hash in Redis (gaddr:email-verify:{email}, TTL 15min)
   - Sends branded HTML email with verification LINK + CODE
7. Client redirects to /verify-email?email=...
```

#### Login Flow

```
1. User enters email + password
2. Client checks if 2FA is enabled (api.auth.request2faCode)
   - If 2FA enabled → shows 2FA code input
   - If not → proceed to step 3
3. authClient.signIn.email({ email, password })
4. Better Auth:
   - Verifies Argon2id password hash
   - Creates session row in PostgreSQL
   - Optionally writes to Redis secondary storage
   - Sets better-auth.session_token cookie
5. If 2FA enabled:
   - Client calls api.auth.verify2faLogin({ email, code })
   - Server verifies OTP from Redis, sets twoFaVerifiedAt on user
   - Then proceeds with signIn.email
6. Client reads session → routes by role:
   - business_owner → /recruiter
   - freelancer → /freelancer
   - job_seeker → /job-seeker
   - no role → /role-selection
```

#### Email Verification

**Two parallel mechanisms**:

| Mechanism | Flow | TTL |
|-----------|------|-----|
| **Link** (Better Auth built-in) | Token → callback URL → `/api/auth/verify-email` → `emailVerified = true` | 24 hours |
| **Code** (custom OTP) | 6-digit code → Redis hash → tRPC `verifyEmailWithCode` → `emailVerified = true` | 15 minutes |

Both the link AND the 6-digit code are included in the same verification email.

**OTP Security**:
- SHA-256 hash with email + secret before Redis storage
- Atomic Redis GET+DEL via Lua script
- Timing-safe comparison (`crypto.timingSafeEqual`)
- Cryptographically uniform random generation (`crypto.randomInt`)

#### Password Reset Flow

```
1. User enters email on /forgot-password
2. tRPC: requestPasswordReset (rate-limited: 5/hour per email+IP)
3. Better Auth generates reset token + sendResetPassword hook fires
4. Hook generates 6-digit OTP, stores hash+token in Redis (gaddr:pwd-reset:{email}, 15min TTL)
5. Sends branded email with link + code
6. User enters code + new password on /reset-password-code
7. tRPC: resetPasswordWithCode
   - Atomic Redis GET+DEL, timing-safe comparison
   - Returns stored reset token
   - Calls Better Auth API: reset-password with token + newPassword
8. Better Auth updates account.password hash
```

#### Two-Factor Authentication (2FA)

**Type**: Email-based OTP (NOT TOTP/authenticator app)

| Step | Detail |
|------|--------|
| Enable | `/settings/two-factor` → `enable2fa` mutation → code sent to email → verify → `twoFactorEnabled = true` |
| Login | After email+password → `request2faCode` → if 2FA enabled, show code input → `verify2faLogin` → `twoFaVerifiedAt = new Date()` |
| Enforcement | `requireSession()` checks `twoFactorEnabled` + `twoFaVerifiedAt` — redirects if >5 minutes old |
| Code TTL | 5 minutes (`TWO_FA_CODE_TTL_SEC = 300`) |

### 4.7 Rate Limiting

**Two-tier system**:

#### Tier 1: Custom Redis Rate Limiting (ioredis)

**File**: `src/server/auth/rate-limit.ts` (77 lines)

| Rule | Prefix | Max | TTL | Scope |
|------|--------|-----|-----|-------|
| Verification resend | `gaddr:verify-resend:` | 5 | 3600s (1hr) | email+IP |
| Password reset request | `gaddr:pwd-reset-req:` | 5 | 3600s (1hr) | email+IP |
| Password change | `gaddr:change-pwd:` | 5 | 3600s (1hr) | userId+IP |

**Implementation**: Redis Lua `INCR` + `EXPIRE` script (atomic)

#### Tier 2: Upstash Rate Limiting

**File**: `src/server/rate-limit.ts` (82 lines)

| Limiter | Config | Usage |
|---------|--------|-------|
| `authRateLimit` | 50 req / 10 min sliding window | Better Auth catch-all POST endpoint |
| `apiRateLimit` | 30 req / 1 min sliding window | General API rate limiting |

**Fallback**: In-memory `Map`-based rate limiter when Upstash is unavailable.

### 4.8 Middleware / Route Protection

**File**: `src/middleware.ts` (96 lines)

- Edge middleware checks for session cookie presence
- **Does NOT validate session** — only checks cookie exists
- Server-side validation in `requireSession()` + `auth.api.getSession()`
- 43 public routes (no auth required)
- All other routes redirect to `/login?callbackURL=...`

### 4.9 Key Auth Files

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
| `src/lib/constants/auth.ts` | 8 | PASSWORD_MIN_LENGTH=8, AUTH_CODE_TTL=15min, 2FA_TTL=5min |
| `src/lib/validation/password.ts` | 18 | Password strength validation |
| `src/lib/validation/auth-schemas.ts` | 37 | Zod schemas for OTP, email, reset password |
| `src/lib/email/normalize.ts` | 21 | Gmail dot/plus canonicalization |
| `src/middleware.ts` | 96 | Route protection (cookie presence check) |

---

## 5. Authorization / RBAC

### 5.1 Role Hierarchy

| Role | Value | Description |
|------|-------|-------------|
| `admin` | `isAdmin: true` | Full platform access |
| `business_owner` | `role: "business_owner"` | Employer/recruiter |
| `freelancer` | `role: "freelancer"` | Independent contractor |
| `job_seeker` | `role: "job_seeker"` | Job applicant |
| (none) | `role: null` | Must select role via `/role-selection` |

### 5.2 Role Assignment

- Roles are set via the `/role-selection` page after first login
- `role` field is `input: false` in Better Auth config — cannot be set during signup
- `isAdmin` is `input: false` — server-controlled only
- Role is stored in the `user` table and included in session data

### 5.3 Permission Enforcement

- **tRPC middleware**: `requireSession()` extracts role from session
- **Server components**: Direct `requireSession()` call
- **Admin routes**: Check `isAdmin` flag in tRPC procedures
- **No formal permission matrix** — permissions are checked ad-hoc in each tRPC procedure

### 5.4 Admin Access

- Admin routes in `src/server/trpc/routers/admin.ts`
- Admin panel at `/admin` (if it exists)
- `isAdmin` flag checked at procedure level, not via middleware
- Admin bypass for 2FA documented as broken (see Finding F-1)

---

## 6. API Layer

### 6.1 tRPC Routers

**File**: `src/server/trpc/routers/_app.ts` (158 lines)
**Total sub-routers**: **76** (registered in `appRouter`)

| Category | Routers |
|----------|---------|
| **Core** | auth, admin, profiles, dashboard, stats |
| **Jobs/Opportunities** | opportunities, applications, savedJobs, savedSearches, employerPages, externalJobs, listingQuality |
| **Talent** | talent, skills, skillsGap, endorsements, passport |
| **Projects** | projects, projectRoom, contracts, disputes, milestoneEscrow, milestoneValidation |
| **AI** | ai, aiAudit, aiCv, aiEnhanced, aiInterview, aiMatch, aiSearch, aiSettings, aiSummary |
| **Community** | communities, communityFund, governance, mentorship, teams |
| **Economy** | credits, crypto, cryptoPayments, token, stripeConnect, subscription, invoices, partnerRewards |
| **CRM/Recruiting** | recruiterCrm, recruiterAnalytics, booking, meetings |
| **Interview** | interviewIntelligence, interviewKits |
| **Credentials** | credentials, credentialVerify, issuerRegistry, selectiveDisclosure, proofOfContribution |
| **Network** | network, reviews, notifications, activityFeed |
| **Analytics** | analytics, aggregation |
| **Bounties** | bounties, cofounder, contributions |
| **Scam/Trust** | scamDetection, trust, employerVerification |
| **Other** | esco, explore, smartAccount, universities, internalMarketplace |

### 6.2 API Routes (Next.js App Router)

**15 route handlers** across 10 directories:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/[...all]` | GET, POST | Better Auth catch-all (with Upstash rate limiting on POST) |
| `/api/trpc/[trpc]` | GET, POST | tRPC HTTP handler |
| `/api/analytics/track` | POST | Event tracking |
| `/api/analytics/ab` | POST | A/B test analytics |
| `/api/analytics/vitals` | POST | Web vitals |
| `/api/cron/keep-alive` | GET | Keep-alive ping |
| `/api/cron/refresh-jobs` | GET | Job listing refresh |
| `/api/cv-download` | GET | CV PDF download (Cloudinary-hosted) |
| `/api/pusher/auth` | POST | Pusher channel auth |
| `/api/pusher/typing` | POST | Typing indicator broadcast |
| `/api/setup/admin` | POST | Admin setup endpoint |
| `/api/stripe/checkout` | POST | Stripe checkout session |
| `/api/stripe/webhook` | POST | Stripe webhook handler |
| `/api/upload-image` | POST | Image upload (Cloudinary) |
| `/api/upload` | POST | General file upload (Cloudinary) |

---

## 7. Redis / Caching Infrastructure

### 7.1 Dual Redis Architecture

The application uses **two separate Redis services** for different purposes:

| Service | Client Library | Purpose | Config |
|---------|---------------|---------|--------|
| **Primary Redis** | ioredis ^5.10.1 | OTP storage, rate limiting (auth), Better Auth secondary storage | `REDIS_URL` |
| **Upstash Redis** | @upstash/redis ^1.38.0 | API rate limiting, auth rate limiting | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |

**File**: `src/server/redis.ts` (8 lines) — ioredis client
```typescript
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});
```

**File**: `src/server/rate-limit.ts` (82 lines) — Upstash client + rate limiters

### 7.2 Redis Key Patterns

| Pattern | Purpose | TTL | Client |
|---------|---------|-----|--------|
| `better-auth:*` | Better Auth secondary session storage | Managed by Better Auth | ioredis |
| `gaddr:email-verify:{email}` | Email verification OTP hash | 15 min (900s) | ioredis |
| `gaddr:pwd-reset:{email}` | Password reset OTP + token | 15 min (900s) | ioredis |
| `gaddr:verify-resend:{email}:{ip}` | Verification resend rate limit | 1 hr (3600s) | ioredis |
| `gaddr:pwd-reset-req:{email}:{ip}` | Password reset request rate limit | 1 hr (3600s) | ioredis |
| `gaddr:change-pwd:{userId}:{ip}` | Password change rate limit | 1 hr (3600s) | ioredis |
| `auth:{identifier}` | Upstash auth rate limit counter | 10 min sliding window | Upstash |
| `api:{identifier}` | Upstash API rate limit counter | 1 min sliding window | Upstash |

### 7.3 Redis Lua Scripts

**Atomic verification (OTP)**:
```lua
local stored = redis.call("GET", KEYS[1])
if not stored then return "" end
redis.call("DEL", KEYS[1])
return stored
```

**Atomic rate limit increment**:
```lua
local n = redis.call("INCR", KEYS[1])
if n == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return n
```

### 7.4 Failover Behavior

| Scenario | Behavior |
|----------|----------|
| ioredis unavailable | Auth continues without secondary storage (in-memory sessions) |
| Upstash unavailable | Falls back to in-memory `Map`-based rate limiter |
| Both unavailable | Application still works; sessions are ephemeral per-process |

---

## 8. File Storage

### 8.1 Cloudinary Integration

**Not S3/R2** — the application uses **Cloudinary** for file/image storage.

**Config**: `src/env.ts` — `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

| Route | Purpose |
|-------|---------|
| `/api/upload-image` | Profile images, general images |
| `/api/upload` | General file uploads |
| `/api/cv-download` | CV PDF downloads (validates Cloudinary hostname) |

**Cloudinary v2 SDK** (`cloudinary` ^2.10.0) is used directly in API route handlers.

---

## 9. Email System

### 9.1 Transport Layer

**File**: `src/server/email/transport.ts` (48 lines)

**Primary**: Nodemailer with SMTP
- Default relay: `smtp-relay.brevo.com`
- Configurable via `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- Sender: `Gaddr Jobs <team@gaddr.com>`
- In development: Emails are logged to console with highlighted OTP codes

**Available but not primary**: Resend (`resend` ^6.14.0 is in dependencies, `RESEND_API_KEY` is in env, but the transport uses Nodemailer)

### 9.2 Email Templates

**File**: `src/server/email/auth-emails.ts` (132 lines)

| Function | Subject | Content |
|----------|---------|---------|
| `sendVerificationEmail` | "Verify your email — Gaddr Jobs" | Branded HTML with verify button + link |
| `sendPasswordResetEmail` | "Reset your password — Gaddr Jobs" | Branded HTML with reset button + 6-digit code display |
| `sendNotificationEmail` | Dynamic subject | Generic branded notification email |

**Template system**: Inline HTML with consistent Gaddr Jobs branding (dark theme: `#08081A` background, `#8B5CF6` accent). No React Email templates used in production auth emails despite `@react-email/components` being a dependency.

### 9.3 Email Types

| Type | Trigger | Mechanism |
|------|---------|-----------|
| Verification (link + code) | Signup | `sendVerificationEmail` via Better Auth hook |
| Password Reset (link + code) | Forgot password | `sendPasswordResetEmail` via Better Auth hook |
| 2FA Code | Login with 2FA enabled | Direct `sendMail` call in auth router |
| Notifications | Various events | `sendNotificationEmail` utility |

---

## 10. Key Findings

### F-1: CRITICAL — 2FA Bypass Vulnerability

**File**: `src/server/trpc/routers/auth.ts:475-478`

```
// ponytail: 2FA enforcement is broken — verify2faLogin only verifies a code
// but doesn't gate session creation. Users with 2FA enabled can bypass it
// by using the Better Auth sign-in endpoint directly. Full fix requires
// a post-login middleware that checks twoFactorEnabled + 2faVerified flag.
```

The `verify2faLogin` procedure only marks `twoFaVerifiedAt` in the database but does **not** gate session creation. A user with 2FA enabled can call `POST /api/auth/sign-in/email` directly and receive a valid session without completing the 2FA step.

**Mitigation**: `requireSession()` in `src/server/auth/require-session.ts:31-35` checks 2FA verification on server-side page loads, but this only protects server-rendered pages, not API/tRPC calls that don't use `requireSession()`.

**Status**: Known issue documented in code. Not yet fixed.

### F-2: CRITICAL — shared-schema Drift (9 Missing Columns)

**File**: `packages/shared-schema/src/auth.ts` (104 lines)

The shared-schema defines a **different version** of the user table than `auth-schema.ts`.

| Column | auth-schema.ts (Jobs) | shared-schema | Drift |
|--------|----------------------|---------------|-------|
| `twoFaVerifiedAt` | Yes | **MISSING** | YES |
| `dateOfBirth` | Yes | **MISSING** | YES |
| `status` | Yes | **MISSING** | YES |
| `deletedAt` | Yes | **MISSING** | YES |
| `bannedAt` | Yes | **MISSING** | YES |
| `banReason` | Yes | **MISSING** | YES |
| `privateSearchMode` | Yes | **MISSING** | YES |
| `blockedEmployers` | Yes (text[]) | **MISSING** | YES |
| `aiAnalysisOptOut` | Yes | **MISSING** | YES |

**Impact**: If `gaddr.com` uses the shared-schema to query user rows, it will be missing 9 columns that exist in the actual database.

### F-3: HIGH — shared-schema UNUSED by gaddr-jobs

**Verified**: Zero imports of `shared-schema` exist anywhere in the gaddr-jobs codebase. The shared-schema package is a **dead dependency** for this project. The jobs app defines its own authoritative user table in `src/server/db/auth-schema.ts`.

### F-4: HIGH — Migration Journal Inconsistency

**File**: `drizzle/meta/_journal.json`

The journal tracks only **14 entries** (idx 0-13) despite **85 SQL files** being present. Journal jumps from `0012_saved_jobs` (idx 12) directly to `0078_catchup_apply_all_missing` (idx 13).

**Impact**: Migrations 0013-0077 and 0079-0085 were applied via `drizzle-kit push` or manual SQL. Running `drizzle-kit migrate` may create duplicate migration attempts.

### F-5: HIGH — Duplicate Migration Numbering

Two pairs of migrations share the same number:

| Number | File 1 | File 2 | Notes |
|--------|--------|--------|-------|
| **0069** | `0069_add_message_is_read.sql` (SQL) | `0069_ai_audit_log.sql` (JS/TS) | Different formats and content |
| **0078** | `0078_catchup_apply_all_missing.sql` (SQL, 977 lines) | `0078_priority2_features.sql` (JS/TS) | Catch-up vs. interview intelligence |

### F-6: MEDIUM — Dead Code in Repository

| Item | Path | Size | Notes |
|------|------|------|-------|
| Fix script | `fix-all.js` | 1.9KB | One-time data fix |
| Fix script | `fix-governance.js` | 525B | One-time data fix |
| Fix script | `fix-governance2.js` | 1.7KB | One-time data fix |
| Fix script | `fix-mentorship.js` | 1.7KB | One-time data fix |
| Fix script | `fix-tables.js` | 2.3KB | One-time data fix |
| Fix script | `fix-vote-table.js` | 799B | One-time data fix |
| Backup file | `backups/user_backup_1784300813041.json` | 34KB | Migration backup |
| Deploy script | `scripts/deploy.js` | 1.9KB | Deployment script |

### F-7: MEDIUM — Missing Migration Numbers

The following migration numbers are skipped:
- **0060** — missing (jumps from 0059 to 0061)
- **0073** — missing (jumps from 0072 to 0075)
- **0074** — missing (jumps from 0072 to 0075)

### F-8: MEDIUM — Missing onDelete Specifications

**4 columns** have no `onDelete` specified (defaults to PostgreSQL `NO ACTION`):

| Table | Column | Risk |
|-------|--------|------|
| `stripe_dispute` | `userId` | Orphaned dispute records |
| `refund` | `userId` | Orphaned refund records |
| `invoice` | `userId` | Orphaned invoices |
| `time_entry` | `approvedBy` | Orphaned approval reference |

Additionally, `account_deletion_log.userId` in `gdpr-schema.ts` has **no FK constraint at all**.

### F-9: LOW — Inconsistent FK Naming Conventions

FK columns referencing `user.id` use 15+ different naming patterns:
`userId`, `createdBy`, `authorId`, `creatorId`, `employerId`, `freelancerId`, `holderId`, `mentorId`, `menteeId`, `initiatorId`, `respondentId`, `fromUserId`, `toUserId`, `senderId`, `referrerId`, `candidateId`, `reviewerId`, `revieweeId`, `reviewedBy`, `raisedBy`, `approvedBy`

All point to `user.id` — semantically correct but no single convention.

### F-10: LOW — Missing Email Index in auth-schema.ts

The main `auth-schema.ts` defines `email` as `.unique()` but does **not** create an explicit index (Drizzle generates one implicitly for unique constraints). The shared-schema has `user_email_idx`. The Drizzle Kit `push` or `generate` commands may attempt to reconcile this.

### F-11: INFO — Unused `resend` Package

The `resend` package (^6.14.0) is listed in dependencies, and `RESEND_API_KEY` is in env validation, but the actual email transport (`src/server/email/transport.ts`) uses **Nodemailer with SMTP**. Resend appears to be a planned migration that hasn't happened yet.

---

## 11. Architecture Decision Records (ADRs)

### ADR-001: Better Auth over NextAuth

**Status**: Accepted
**Date**: Pre-existing

**Context**: The project needed a flexible authentication library supporting email+password, OAuth, and passkeys.

**Decision**: Use Better Auth v1.5.6 instead of NextAuth.js.

**Rationale**:
- Native passkey/WebAuthn support via `@better-auth/passkey`
- Database-backed sessions (no JWT complexity)
- Drizzle ORM adapter built-in
- `additionalFields` for custom user properties (role, isAdmin)
- `databaseHooks` for lifecycle control (duplicate email blocking, name composition)
- Cross-subdomain cookie support for `.gaddr.com`
- Redis secondary storage via `@better-auth/redis-storage`

**Consequences**:
- Vendor lock-in to Better Auth's API surface
- Better Auth CLI used for `auth.config.ts` schema generation
- Community smaller than NextAuth

### ADR-002: Dual Redis Strategy

**Status**: Accepted
**Date**: Pre-existing

**Context**: Different Redis features needed for different use cases.

**Decision**: Use ioredis for application-level Redis (OTP, auth secondary storage) and Upstash for rate limiting.

**Rationale**:
- Upstash provides serverless-friendly REST API for rate limiting
- ioredis provides full Redis command support (Lua scripts, EVAL)
- Upstash `@upstash/ratelimit` provides sliding window rate limiting out of the box
- Graceful degradation: in-memory fallback when Redis unavailable

**Consequences**:
- Two Redis connections to manage
- Two sets of credentials/configuration
- `REDIS_URL` and `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` both required

### ADR-003: Database-Backed Sessions (No JWT)

**Status**: Accepted
**Date**: Pre-existing

**Context**: Session management strategy.

**Decision**: Use opaque database-backed sessions via Better Auth (no JWT).

**Rationale**:
- Immediate revocation (delete row)
- No client-side token decoding needed
- Server controls all session validation
- Secondary Redis cache for fast lookups
- Simpler security model (no token signing/verification)

**Consequences**:
- Every session validation hits DB (or Redis cache)
- No offline session validation
- Single point of failure if DB is down

### ADR-004: Email-Based 2FA (Not TOTP)

**Status**: Accepted (with known vulnerability)

**Context**: User wanted 2FA but without requiring authenticator apps.

**Decision**: Implement email-based 6-digit OTP for 2FA.

**Rationale**:
- Lower friction (no app installation)
- Leverages existing email infrastructure
- 5-minute code TTL provides reasonable security window

**Consequences**:
- **Known vulnerability**: 2FA bypass possible via direct API call (F-1)
- Dependent on email delivery speed
- Less secure than TOTP (email can be compromised)

### ADR-005: Cloudinary for File Storage

**Status**: Accepted
**Date**: Pre-existing

**Context**: File and image upload/storage needs.

**Decision**: Use Cloudinary instead of S3/R2.

**Rationale**:
- Built-in image transformation
- CDN included
- Simple SDK integration
- No infrastructure management

**Consequences**:
- Vendor lock-in to Cloudinary
- Per-bandwidth costs
- No S3-compatible API for tools that expect it

### ADR-006: Inline HTML Email Templates

**Status**: Accepted (but `react-email` is a dependency)
**Date**: Pre-existing

**Context**: Email template system.

**Decision**: Use inline HTML string templates in `auth-emails.ts` rather than React Email components.

**Rationale**:
- Simpler — no render step needed
- Better Auth hooks expect plain HTML
- Consistent dark-theme branding

**Consequences**:
- `@react-email/components` and `react-email` are unused dependencies
- Templates harder to maintain as inline strings
- No template preview system

### ADR-007: Drizzle Schema as Single Source of Truth

**Status**: Accepted
**Date**: Pre-existing

**Context**: Schema definition strategy across the monorepo.

**Decision**: `gaddr-jobs/src/server/db/auth-schema.ts` is the authoritative definition of the `user` table. The shared-schema at `packages/shared-schema/src/auth.ts` is a separate, drifted copy.

**Rationale**:
- gaddr-jobs is the active application with 151 tables
- The jobs app owns all migrations and auth hooks
- shared-schema was created for monorepo sharing but is not actually imported

**Consequences**:
- Drift between auth-schema and shared-schema will grow
- Other projects (gaddr.com) must either use shared-schema (missing columns) or depend on gaddr-jobs schema

---

## 12. Assumptions and Constraints

### Assumptions

1. The `user` table in PostgreSQL matches the Drizzle definition in `auth-schema.ts` (38 columns)
2. All 85 SQL migration files have been applied to the production database
3. Redis (ioredis) is available in production for OTP storage
4. Upstash Redis is available in production for rate limiting
5. Cloudinary credentials are configured for file uploads
6. Neon PostgreSQL is used in production (SSL auto-detection)
7. The application is deployed on Vercel (pool size = 1, prepared statements disabled)

### Constraints

1. **Node.js >= 20** required (from `package.json` engines)
2. **Vercel serverless**: Connection pool limited to 1, prepared statements disabled
3. **Better Auth**: Vendor lock-in; custom auth logic must work within Better Auth hooks
4. **PostgreSQL**: Drizzle ORM + postgres.js; no support for other databases
5. **No formal RBAC framework**: Permissions are checked ad-hoc per tRPC procedure
6. **2FA is email-only**: No TOTP/authenticator app support

---

## 13. Open Questions

| # | Question | Priority | Impact |
|---|----------|----------|--------|
| Q1 | Will the 2FA bypass vulnerability (F-1) be fixed before production launch? | **CRITICAL** | Security |
| Q2 | Should `packages/shared-schema` be updated to match `auth-schema.ts`, or should the shared-schema be removed? | **HIGH** | Schema drift |
| Q3 | Is Resend intended to replace Nodemailer as the primary email transport? | **MEDIUM** | Infrastructure |
| Q4 | Should the dead fix scripts (`fix-*.js`) and backup file be removed from the repository? | **LOW** | Code hygiene |
| Q5 | Should the 4 missing `onDelete` specifications be added (F-8)? | **MEDIUM** | Data integrity |
| Q6 | Should migration numbering be normalized (remove duplicates at 0069/0078)? | **MEDIUM** | Migration clarity |
| Q7 | Should the `auth.config.ts` file at the project root be removed if only used for CLI? | **LOW** | Code hygiene |
| Q8 | Will the `passkey` table's camelCase column naming be normalized to snake_case? | **LOW** | Consistency |
| Q9 | Should a formal permission/RBAC system replace the current ad-hoc role checks? | **MEDIUM** | Authorization |
| Q10 | Should `@react-email/components` be removed as a dependency if not used? | **LOW** | Bundle size |
| Q11 | Is the 30-minute session idle timeout (`idle_timeout: 30` in postgres.js) intentional for serverless? | **LOW** | Connection management |
| Q12 | Should `account_deletion_log.userId` get a proper FK constraint? | **MEDIUM** | Data integrity |

---

## Appendix A: Environment Variables

**File**: `src/env.ts` (65 lines) — Validated with `@t3-oss/env-nextjs` + Zod

### Required

| Variable | Type | Validation |
|----------|------|------------|
| `DATABASE_URL` | string | `z.url()` |
| `REDIS_URL` | string | `z.url()` |
| `BETTER_AUTH_SECRET` | string | `z.string().min(32)` |
| `BETTER_AUTH_URL` | string | `z.url()` |
| `NEXT_PUBLIC_APP_URL` | string | `z.url()` |

### Optional (with defaults)

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_POOL_MAX` | `10` | Min 1, max 100 |
| `SMTP_HOST` | `smtp.gmail.com` | |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | |
| `SMTP_USER` | `""` | |
| `SMTP_PASS` | `""` | |
| `CLOUDINARY_CLOUD_NAME` | `""` | |
| `CLOUDINARY_API_KEY` | `""` | |
| `CLOUDINARY_API_SECRET` | `""` | |
| `OPENROUTER_API_KEY` | `""` | AI routing |
| `GROQ_API_KEY` | `""` | AI inference |
| `GEMINI_API_KEY` | `""` | Google AI |
| `MISTRAL_API_KEY` | `""` | Mistral AI |
| `GOOGLE_CLIENT_ID` | `""` | OAuth |
| `GOOGLE_CLIENT_SECRET` | `""` | OAuth |
| `RESEND_API_KEY` | `""` | Email (not primary) |
| `UPSTASH_REDIS_REST_URL` | `""` | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | `""` | Rate limiting |
| `SENTRY_DSN` | `""` | Error tracking |
| `SENTRY_AUTH_TOKEN` | `""` | Source maps upload |
| `STRIPE_SECRET_KEY` | `""` | Payments |
| `STRIPE_WEBHOOK_SECRET` | `""` | Payments |
| `TEST_MODE` | `false` | |
| `DEPLOYER_PRIVATE_KEY` | `""` | Smart contract deploy |
| `ARBITRUM_RPC_URL` | `""` | Arbitrum L2 |
| `STRIPE_PRICE_BASIC_MONTHLY_USD` | `""` | |
| `STRIPE_PRICE_PRO_MONTHLY_USD` | `""` | |
| `STRIPE_PRICE_ULTIMATE_MONTHLY_USD` | `""` | |
| `STRIPE_PRICE_BASIC_MONTHLY_SEK` | `""` | |
| `STRIPE_PRICE_PRO_MONTHLY_SEK` | `""` | |
| `STRIPE_PRICE_ULTIMATE_MONTHLY_SEK` | `""` | |
| `PREMIUM_AD_PRICE_CENTS` | `2999` | Min 100 |

### Client-side

| Variable | Default |
|----------|---------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `""` |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | `""` |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `""` |

---

## Appendix B: Migration Timeline

| Range | Count | Description |
|-------|-------|-------------|
| 0000-0011 | 12 | Core tables (auth, profiles, opportunities, notifications, talent) |
| 0012-0022 | 11 | Saved jobs, skills, contracts, audit, performance indexes |
| 0023-0036 | 14 | Analytics, subscriptions, invoices, disputes, payments, companies |
| 0037-0048 | 12 | Portfolio, AI settings, crypto, unified opportunity model |
| 0049-0058 | 10 | Passport, employer verification, privacy, trust, projects, interviews |
| 0059-0069 | 10 | Meeting agent, network, marketplace, economic ecosystem, merger, 2FA |
| 0070-0079 | 9 | Opportunity enhancements, credentials, milestones, GDPR, catch-up |
| 0080-0085 | 6 | Milestone disputes/escrow/validation, GDPR soft delete, user bans, coordinates |

**Missing numbers**: 0060, 0073, 0074
**Duplicate numbers**: 0069 (2 files), 0078 (2 files)

---

## Appendix C: Circular Import Analysis

**No circular imports detected.** The import graph is strictly hierarchical:

```
schema.ts (barrel)
  └── auth-schema.ts (defines user, session, account, verification, passkey)
        └── imported by 49 other *-schema.ts files

auth/index.ts (Better Auth config)
  ├── imports from schema.ts (barrel)
  ├── imports from auth-schema.ts (via dynamic import in databaseHooks)
  └── imports from db/index.ts (DB client)

db/index.ts
  └── imports from schema.ts (barrel)
```

Dynamic imports in `databaseHooks` (`auth/index.ts:120-122`) and `requireSession` (`require-session.ts:22-24`) avoid circular dependencies at module load time.
