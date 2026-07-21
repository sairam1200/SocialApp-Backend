# 04 — Shared Identity Architecture

> Session 4 deliverable. Design-only. No implementation.

---

## 1. Current State Audit

### 1.1 The Fat User Problem

`identity.users` currently holds **30+ columns** mixing unrelated concerns:

| Concern | Columns | Count |
|---------|---------|-------|
| Core auth | id, email, normalizedEmail, emailConfirmed, userName, normalizedUserName, passwordHash, type, securityStamp, concurrencyStamp, isActive, registeredOn | 12 |
| Profile display | firstName, lastName, bio, gender, profilePrivacy, onboardingStep | 6 |
| OAuth linkage | googleId | 1 |
| Security state | twoFactorEnabled, twoFactorSecret, isLockedOut, lockoutEnd, accessFailedCount | 5 |
| Email/phone lifecycle | newEmail, lastEmailModifiedAt, newPhoneNumber, lastPhoneNumberModifiedAt, lastUserNameModifiedAt, lastPasswordModifiedAt | 6 |
| Referral | referralCode, referredBy | 2 |

**Diagnosis**: This is not a "users table" — it is a users + profiles + security + settings table crammed into one entity. The problem is vertical bloat, not horizontal multi-project sprawl.

### 1.2 FK Integrity Gap

| Metric | Count |
|--------|-------|
| Tables referencing `users.id` | 27 |
| Tables with formal FK constraints | 9 |
| Tables with NO FK at all | **18** |

Tables with no FK to users: `userLogins`, `userRoles`, `userClaims`, `linkedAccounts`, `dataProtectionKeys`, `searchHistories`, `rateLimits`, `rateLimitLogs`, `publish_jobs`, `youtube_accounts`, `youtubeVideoAnalytics`, `youtubeChannelAnalytics`, `facebookVideoAnalytics`, `facebookPostAnalytics`, `facebookPageAnalytics`, `analyticsEvents`, `premiumRollups`, `notifications`.

**Consequence**: Deleting a user leaves orphaned rows in 18 tables. No referential integrity. No safe cascade path.

### 1.3 Dual Auth System

Two session mechanisms coexist:
- **JWT** (primary): access + refresh tokens, `userLogins` stores refresh tokens
- **Better Auth** (secondary): session cookie, separate `session`/`user` tables

The `HttpContextMiddleware` tries Better Auth first, falls back to JWT. This creates ambiguity about which system is canonical.

### 1.4 Schema Split (Already Done)

The codebase already uses PostgreSQL schemas correctly:

| Schema | Purpose | Status |
|--------|---------|--------|
| `identity` | Users, roles, claims, logins, follows, biometrics | Correct |
| `notification` | Notifications, events, templates, subscribers | Correct |
| `analytics` | Events, rollups, platform analytics | Correct |
| `public` | Everything else | Correct |

The schema boundary is right. The problem is that identity concerns leak into the public schema (`userPreferences` has no schema declaration, `manualProfiles` is in public, `dataProtectionKeys` is in public).

---

## 2. Who Owns What

### 2.1 Ownership Matrix

| Concern | Owner Schema | Current State | Target State |
|---------|-------------|---------------|--------------|
| **Users** | `identity` | `identity.users` (fat) | `identity.users` (lean) + split tables |
| **Sessions** | `identity` | `identity.userLogins` (no FK) + Better Auth (separate) | `identity.sessions` (unified, with FK) |
| **OAuth** | `identity` | `googleId` on User + `dataProtectionKeys` in public | `identity.user_oauth_providers` |
| **Verification** | `identity` | `emailConfirmed` on User + `dataProtectionKeys` | `identity.verification_tokens` |
| **Password Reset** | `identity` | `dataProtectionKeys` in public | `identity.verification_tokens` |
| **Refresh Tokens** | `identity` | `identity.userLogins.tokenValue` (no FK) | `identity.sessions` (merged with login tracking) |
| **Roles** | `identity` | `identity.roles` + `identity.userRoles` (no FK) | Same, with FK constraints added |
| **Permissions** | `identity` | `identity.userClaims` + `identity.roleClaims` | Same, with FK constraints added |
| **Settings** | `identity` | `userPreferences` (no schema) | `identity.user_preferences` |
| **Preferences** | `identity` | Same as settings | Same as settings |
| **Notifications** | `notification` | `notification.notifications.notifyId` (no FK) | `notification.notifications` with FK to `identity.users` |
| **Profile display** | `identity` | On `identity.users` (fat) | `identity.user_profiles` |
| **Security state** | `identity` | On `identity.users` (fat) | `identity.user_security` |

### 2.2 Ownership Rules

1. **`identity` schema owns the user lifecycle.** No other schema may CREATE, UPDATE, or DELETE rows in `identity.users`. Other schemas may READ via FK references.

2. **Feature schemas own their domain data.** A playlist belongs to `public`. An analytics event belongs to `analytics`. They reference `users.id` but never modify the user.

3. **No schema may add columns to `identity.users` for feature-specific needs.** If a feature needs user-linked data, it creates its own table with an FK to `identity.users.id`.

4. **The notification schema is the only exception** — it may write to `notification.notifications` with a `userId` referencing `identity.users`, because notifications are a cross-cutting concern that multiple features produce.

---

## 3. Table Design

### 3.1 Target Schema: `identity`

```
identity.users                 ← Core identity (auth anchor)
identity.user_profiles         ← Display name, bio, gender, privacy
identity.user_security         ← 2FA, lockout, email/phone lifecycle
identity.user_preferences      ← Theme, notification channels
identity.user_oauth_providers  ← Google, Facebook, etc. (replaces googleId column)
identity.sessions              ← Refresh tokens + login tracking (replaces userLogins)
identity.verification_tokens   ← Email verification, password reset, OAuth state (replaces dataProtectionKeys)
identity.roles                 ← Role definitions (unchanged)
identity.role_claims           ← Permissions per role (unchanged)
identity.user_roles            ← User-role assignments (unchanged, add FK)
identity.user_claims           ← Permissions per user (unchanged, add FK)
identity.user_biometrics       ← Profile image, avatar privacy (unchanged)
identity.user_follows          ← Follow relationships (unchanged)
identity.user_topics           ← Topic preferences (unchanged)
```

### 3.2 Table Definitions

#### `identity.users` (Lean)

```
id                  UUID PK
email               VARCHAR NOT NULL UNIQUE
normalized_email    VARCHAR NOT NULL UNIQUE
email_confirmed    BOOLEAN DEFAULT false
user_name           VARCHAR UNIQUE
normalized_user_name VARCHAR UNIQUE
password_hash       VARCHAR
is_active           BOOLEAN DEFAULT true
type                ENUM (Admin/User/Guest) DEFAULT 'User'
security_stamp      VARCHAR
concurrency_stamp   VARCHAR
registered_on       TIMESTAMP
created_by          UUID
created_on          TIMESTAMP
last_modified_by    UUID
last_modified_on    TIMESTAMP
last_refreshed      TIMESTAMP
```

**Removed from users**: firstName, lastName, bio, gender, profilePrivacy, onboardingStep, googleId, newEmail, lastEmailModifiedAt, newPhoneNumber, lastPhoneNumberModifiedAt, lastUserNameModifiedAt, lastPasswordModifiedAt, twoFactorEnabled, twoFactorSecret, isLockedOut, lockoutEnd, accessFailedCount, referralCode, referredBy.

**Rationale**: This table answers one question: "Who is this person and can they authenticate?" Everything else is a separate concern.

#### `identity.user_profiles`

```
user_id             UUID PK → identity.users.id ON DELETE CASCADE
first_name          VARCHAR
last_name           VARCHAR
bio                 TEXT
gender              VARCHAR
phone_number        VARCHAR
profile_privacy     ENUM (Public/Interactions) DEFAULT 'Public'
onboarding_step     ENUM DEFAULT 'NotStarted'
referral_code       VARCHAR UNIQUE
referred_by         VARCHAR
created_on          TIMESTAMP
last_modified_on    TIMESTAMP
```

**ON DELETE CASCADE**: If the user is deleted, their profile is deleted. There is no profile without an identity.

#### `identity.user_security`

```
user_id                     UUID PK → identity.users.id ON DELETE CASCADE
two_factor_enabled          BOOLEAN DEFAULT false
two_factor_secret           VARCHAR
is_locked_out               BOOLEAN DEFAULT false
lockout_end                 TIMESTAMP
access_failed_count         INTEGER DEFAULT 0
new_email                   VARCHAR
last_email_modified_at      TIMESTAMP
new_phone_number            VARCHAR
last_phone_number_modified_at TIMESTAMP
last_username_modified_at   TIMESTAMP
last_password_modified_at   TIMESTAMP
created_on                  TIMESTAMP
last_modified_on            TIMESTAMP
```

**ON DELETE CASCADE**: Security state is meaningless without the user.

#### `identity.user_preferences`

```
user_id                         UUID PK → identity.users.id ON DELETE CASCADE
theme                           ENUM (System/Light/Dark) DEFAULT 'System'
notification_channels_enabled   ENUM[] (inApp/email/push)
language                        VARCHAR DEFAULT 'en'
created_on                      TIMESTAMP
last_modified_on                TIMESTAMP
```

**ON DELETE CASCADE**: Preferences are user-owned.

#### `identity.user_oauth_providers`

```
id          UUID PK
user_id     UUID NOT NULL → identity.users.id ON DELETE CASCADE
provider    VARCHAR NOT NULL (google/facebook/apple/github)
provider_uid VARCHAR NOT NULL
email       VARCHAR
name        VARCHAR
avatar_url  VARCHAR
added_on    TIMESTAMP
UNIQUE(provider, provider_uid)
UNIQUE(user_id, provider)
```

**ON DELETE CASCADE**: If the user is deleted, OAuth links are deleted.

**Replaces**: The `googleId` column on `identity.users`. Extensible to any provider.

#### `identity.sessions`

```
id              UUID PK
user_id         UUID NOT NULL → identity.users.id ON DELETE CASCADE
provider        VARCHAR NOT NULL (jwt/better-auth)
token_value     VARCHAR NOT NULL
device_id       VARCHAR
user_agent      VARCHAR
ip_address      VARCHAR
is_valid        BOOLEAN DEFAULT true
added_date      TIMESTAMP
expiry_date     TIMESTAMP
created_on      TIMESTAMP
```

**ON DELETE CASCADE**: Sessions are meaningless without the user.

**Replaces**: `identity.userLogins`. Merges JWT refresh tokens and Better Auth sessions into one table. The `provider` column distinguishes the auth mechanism.

**Unique index**: `(user_id, device_id)` — one session per device.

#### `identity.verification_tokens`

```
id          UUID PK
user_id     UUID → identity.users.id ON DELETE CASCADE
purpose     VARCHAR NOT NULL (email_verify/password_reset/oauth_state/2fa_setup)
token       VARCHAR NOT NULL UNIQUE
data        JSONB
expires_at  TIMESTAMP NOT NULL
used_at     TIMESTAMP
created_on  TIMESTAMP
```

**ON DELETE CASCADE**: Tokens are meaningless without the user.

**Replaces**: `dataProtectionKeys` (currently in public schema). Consolidates all token-based flows.

**Purpose enum values**:
- `email_verify` — Confirm new email address
- `password_reset` — Password reset flow
- `oauth_state` — OAuth CSRF state (short-lived, 15min)
- `2fa_setup` — 2FA setup verification
- `phone_verify` — Phone number verification

#### `identity.user_roles` (Modified)

```
user_id     UUID NOT NULL → identity.users.id ON DELETE CASCADE
role_id     UUID NOT NULL → identity.roles.id ON DELETE CASCADE
is_disabled BOOLEAN DEFAULT false
disabled_until TIMESTAMP
UNIQUE(user_id, role_id)
```

**Changes**: Add FK constraints. Composite PK instead of UUID PK.

#### `identity.user_claims` (Modified)

```
id          SERIAL PK
user_id     UUID NOT NULL → identity.users.id ON DELETE CASCADE
claim_type  VARCHAR NOT NULL
claim_value VARCHAR NOT NULL
```

**Changes**: Add FK constraint.

#### `identity.role_claims` (Unchanged)

Already has FK to `identity.roles.id` with `ON DELETE NO ACTION`. Consider changing to `ON DELETE CASCADE` so deleting a role removes its claims.

---

## 4. FK Behavior Rules

### 4.1 The Rule

| Relationship | onDelete | Rationale |
|-------------|----------|-----------|
| Identity → Identity (same aggregate) | **CASCADE** | User deletion cascades to profiles, security, sessions, preferences, OAuth links |
| Identity → Identity (cross-aggregate) | **CASCADE** | Role deletion cascades to role_claims, user_roles |
| Feature → Identity | **RESTRICT** | Prevent user deletion if feature data exists (playlists, content, follows) |
| Feature → Feature (same aggregate) | **CASCADE** | Playlist deletion cascades to members and content |
| Feature → Feature (cross-aggregate) | **SET NULL** or **RESTRICT** | Preserve data or prevent deletion |
| Analytics/Audit → Identity | **NO ACTION** | Historical data must survive user deletion; anonymize via background job |
| Notification → Identity | **NO ACTION** | Notifications are delivered; user deletion doesn't erase notification history |

### 4.2 Current Violations and Fixes

| Table | Current FK | Current onDelete | Target onDelete | Reason |
|-------|-----------|-----------------|----------------|--------|
| `userTopics` | `userId → users.id` | CASCADE | **RESTRICT** | User topics are user-owned but deleting a user should require explicit cleanup first |
| `user_follows` (follower) | `followerId → users.id` | CASCADE | **RESTRICT** | Follow relationships are social graph data; deletion needs explicit handling |
| `user_follows` (followed) | `followedId → users.id` | CASCADE | **RESTRICT** | Same — other users' follow lists reference this user |
| `userContents` | `userId → users.id` | CASCADE | **RESTRICT** | Content is user-owned but may be referenced by playlists, shared links |
| `playlists` (owner) | `ownerId → users.id` | CASCADE | **RESTRICT** | Playlists may have collaborators; ownership transfer needed before deletion |
| `playlistMembers` (user) | `userId → users.id` | CASCADE | **RESTRICT** | Member relationships reference users across playlists |
| `manualProfiles` | `userId → users.id` | NO ACTION | **RESTRICT** | Consistent RESTRICT behavior |

### 4.3 Why RESTRICT Over CASCADE for Feature Tables

CASCADE on feature tables is dangerous because:

1. **Cascading deletes are silent.** A user deletion accidentally cascading to playlists, content, and collaborator memberships is catastrophic.

2. **Soft delete is the norm.** Users are rarely hard-deleted. They are deactivated (`isActive = false`). RESTRICT forces explicit cleanup before any hard delete.

3. **Ownership transfer.** Before deleting a user, their playlists should be transferred or archived. RESTRICT enforces this.

4. **Referential integrity.** Other users may have followed this user, added their content to playlists, or interacted with their data. CASCADE would break those references silently.

### 4.4 The Deletion Protocol

Hard deletion of a user should follow this sequence:

```
1. Deactivate user (isActive = false)
2. Background job runs:
   a. Transfer owned playlists to another user or system account
   b. Anonymize analytics events (replace userId with null or 'deleted')
   c. Anonymize notification history
   d. Archive content (mark as archived, preserve for platform integrity)
   e. Remove follow relationships
   f. Remove user topics
   g. Remove user-topic associations
3. Delete identity aggregates (CASCADE handles: profile, security, sessions, preferences, OAuth, roles, claims)
4. Delete feature data (RESTRICT will block if step 2 missed anything)
```

---

## 5. The Project-Specific Profile Question

### 5.1 Question

> Should project-specific fields exist inside users? Or separate profile tables? Should there be `users` / `projectA_profile` / `projectB_profile` instead of one gigantic table?

### 5.2 Answer: Neither. Split Vertically by Concern, Not Horizontally by Project.

**Do NOT create `projectA_profile` / `projectB_profile` tables.** Reasons:

1. **Premature abstraction.** There is one project today. Creating per-project tables assumes a multi-project future that may never materialize. When it does, the schema can be extended.

2. **Identity is shared, not projected.** A user's name, email, and preferences are intrinsic to them. They don't change based on which project the user is interacting with. Splitting by project implies the user is a different person in each project.

3. **Query complexity explodes.** Every auth check, every profile load, every session validation would need to know which project context it's in. This leaks project awareness into the identity layer, which should be project-agnostic.

4. **The real problem is vertical bloat.** The User entity has 30+ columns because identity, profile, security, and settings are merged. The fix is to split by concern (users / profiles / security / preferences), not by project.

### 5.3 The Correct Pattern

```
identity.users              ← Project-agnostic. Pure auth anchor.
identity.user_profiles      ← Project-agnostic. Display info.
identity.user_security      ← Project-agnostic. Auth state.
identity.user_preferences   ← Project-agnostic. UI preferences.

public.linkedAccounts       ← Feature-specific. Platform connections.
public.manualProfiles       ← Feature-specific. Custom profile links.
public.userContents         ← Feature-specific. User's content.
public.playlists            ← Feature-specific. User's collections.

notification.notifications  ← Feature-specific. Cross-cutting.
analytics.analyticsEvents   ← Feature-specific. Tracking.
```

**Each feature owns its own user-linked table.** The identity schema never grows for feature needs. If a new project or feature needs user-linked data, it creates its own table in its own schema with an FK to `identity.users.id`.

### 5.4 When Per-Project Profiles ARE Appropriate

Per-project profiles make sense when:

- Multiple **separate applications** share one database (e.g., gaddr-core and gaddr-analytics are separate deployed services with different user experiences)
- Each application has **fundamentally different profile requirements** (e.g., one needs avatar + bio, the other needs company name + tax ID)
- The applications are **independently deployed and versioned**

This codebase is a single NestJS application. Per-project profiles are not warranted.

---

## 6. Dual Auth Resolution

### 6.1 Current State

| System | Token Type | Storage | Lifecycle |
|--------|-----------|---------|-----------|
| JWT | Bearer token | Client-side (localStorage/cookie) | Access: 7d, Refresh: 30d |
| Better Auth | Session cookie | `better-auth.session_token` cookie | Server-managed |

The `HttpContextMiddleware` tries Better Auth first, falls back to JWT. This creates:
- Two session stores
- Two token validation paths
- Ambiguity about which system is canonical
- Confusion about refresh token ownership

### 6.2 Recommendation: Consolidate to JWT + Unified Session Table

**Keep JWT as primary. Retire Better Auth session system.**

Reasons:

1. **JWT is already deeply integrated.** Guards, middleware, CQRS handlers, Redis caching — all built around JWT claims. Replacing JWT with Better Auth session cookies would require rewriting the entire auth layer.

2. **Better Auth adds complexity without clear benefit.** The session cookie approach requires server-side session lookup on every request, which is what `userLogins` already does for refresh tokens. The added value of Better Auth (managed sessions, CSRF protection) can be achieved with the existing JWT + refresh token system.

3. **Single source of truth.** One session table (`identity.sessions`) with one validation path. No fallback logic. No dual-store confusion.

4. **Mobile + SPA compatibility.** JWT Bearer tokens work seamlessly with mobile apps, SPAs, and server-to-server calls. Session cookies have cross-origin limitations.

### 6.3 Migration Path

1. Create `identity.sessions` table (unified)
2. Migrate `identity.userLogins` rows into `identity.sessions` with `provider = 'jwt'`
3. Migrate Better Auth session rows into `identity.sessions` with `provider = 'better-auth'`
4. Update `HttpContextMiddleware` to only use JWT validation
5. Remove Better Auth session extraction logic
6. Drop Better Auth session/user tables
7. Remove `better-auth` dependency

---

## 7. Migration Strategy

### 7.1 Migration Phases

| Phase | Scope | Risk | Downtime |
|-------|-------|------|----------|
| **Phase 1** | Create new tables, add FK constraints to existing tables | Low | Zero |
| **Phase 2** | Migrate data from fat User to split tables | Medium | Zero (background migration) |
| **Phase 3** | Update application code to read from new tables | Medium | Zero (feature flag) |
| **Phase 4** | Drop old columns from users table | High | Zero (after full migration) |
| **Phase 5** | Retire Better Auth, consolidate sessions | Medium | Zero (graceful transition) |

### 7.2 Phase 1: Schema Changes (Non-Breaking)

```sql
-- Create new tables (additive, no existing code breaks)
CREATE TABLE identity.user_profiles (...);
CREATE TABLE identity.user_security (...);
CREATE TABLE identity.user_preferences (...);  -- migrate from public schema
CREATE TABLE identity.user_oauth_providers (...);
CREATE TABLE identity.sessions (...);           -- replaces userLogins
CREATE TABLE identity.verification_tokens (...); -- replaces dataProtectionKeys

-- Add FK constraints to existing tables (deferred check)
ALTER TABLE identity.user_roles
  ADD CONSTRAINT FK_userRoles_user
  FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;

ALTER TABLE identity.userClaims
  ADD CONSTRAINT FK_userClaims_user
  FOREIGN KEY (user_id) REFERENCES identity.users(id) ON DELETE CASCADE;
```

### 7.3 Phase 2: Data Migration (Background)

```sql
-- Populate user_profiles from users
INSERT INTO identity.user_profiles (user_id, first_name, last_name, bio, gender, ...)
SELECT id, firstName, lastName, bio, gender, ...
FROM identity.users;

-- Populate user_security from users
INSERT INTO identity.user_security (user_id, two_factor_enabled, two_factor_secret, ...)
SELECT id, twoFactorEnabled, twoFactorSecret, ...
FROM identity.users;

-- Populate user_preferences from userPreferences (if exists)
-- Populate user_oauth_providers from googleId column
-- Populate sessions from userLogins
-- Populate verification_tokens from dataProtectionKeys
```

### 7.4 Phase 3: Application Code (Feature-Flagged)

```typescript
// Before: direct column access
const user = await userRepo.findById(id);
const name = user.firstName; // ← direct column

// After: relation access
const user = await userRepo.findById(id);
const profile = await userProfileRepo.findByUserId(id);
const name = profile.firstName; // ← split table
```

Use a feature flag (`USE_SPLIT_IDENTITY_TABLES`) to switch between old and new code paths during transition.

### 7.5 Phase 4: Column Drop (Final)

After 100% of traffic uses new code paths:

```sql
ALTER TABLE identity.users
  DROP COLUMN firstName,
  DROP COLUMN lastName,
  DROP COLUMN bio,
  DROP COLUMN gender,
  DROP COLUMN profilePrivacy,
  DROP COLUMN onboardingStep,
  DROP COLUMN googleId,
  DROP COLUMN newEmail,
  DROP COLUMN lastEmailModifiedAt,
  DROP COLUMN newPhoneNumber,
  DROP COLUMN lastPhoneNumberModifiedAt,
  DROP COLUMN lastUserNameModifiedAt,
  DROP COLUMN lastPasswordModifiedAt,
  DROP COLUMN twoFactorEnabled,
  DROP COLUMN twoFactorSecret,
  DROP COLUMN isLockedOut,
  DROP COLUMN lockoutEnd,
  DROP COLUMN accessFailedCount,
  DROP COLUMN referralCode,
  DROP COLUMN referredBy;
```

### 7.6 Phase 5: Better Auth Retirement

After `identity.sessions` is proven stable:

1. Remove Better Auth middleware from `HttpContextMiddleware`
2. Drop Better Auth `session` and `user` tables
3. Remove `better-auth` from `package.json`
4. Remove `betterAuthSession.util.ts`

---

## 8. Versioning and Backward Compatibility

### 8.1 API Versioning

The API already uses URI versioning (`/api/v1/...`). Identity changes do NOT require a new API version because:

- The API contract (request/response shapes) does not change
- Only the internal storage splits
- Repository abstractions hide the split from handlers

If the API response shape changes (e.g., `/me` returns nested profile object instead of flat user), that warrants a `/api/v2/` endpoint with v1 deprecation.

### 8.2 Entity Versioning

The `BaseEntity` already has `lastRefreshed` and `lastModifiedOn` columns. For the split tables:

- `identity.user_profiles.last_modified_on` tracks profile changes
- `identity.user_security.last_modified_on` tracks security changes
- No entity-level versioning (optimistic locking) is needed at this stage

### 8.3 Backward Compatibility During Migration

| Concern | Strategy |
|---------|----------|
| **Existing JWT tokens** | Continue working. Claims are extracted from DB, not embedded in token shape. |
| **Existing refresh tokens** | Migrated to `identity.sessions` during Phase 2. Old `userLogins` rows archived. |
| **Redis caches** | Flushed and rebuilt on first request after migration. `ProfileCacheService` updated to read from new tables. |
| **Better Auth sessions** | Graceful transition: both systems work during Phase 3-4, then Better Auth is retired. |
| **Database backups** | Full backup before Phase 1. Rollback plan: restore from backup, revert migration. |
| **Client apps** | No changes needed. API responses remain identical. |

### 8.4 Rollback Plan

Each phase has a rollback:

| Phase | Rollback |
|-------|----------|
| Phase 1 | Drop new tables. No data lost. |
| Phase 2 | Truncate new tables. Original data untouched. |
| Phase 3 | Flip feature flag back to old code paths. |
| Phase 4 | Re-add columns from backup (data loss possible if not backed up). |
| Phase 5 | Re-install `better-auth`. Restore session tables from backup. |

**Critical**: Phase 4 (column drop) is the point of no return. All prior phases are fully reversible.

---

## 9. Summary Decisions

| Question | Answer |
|----------|--------|
| Who owns users? | `identity` schema. Single `identity.users` table as auth anchor. |
| Who owns sessions? | `identity.sessions` (unified, replaces `userLogins` + Better Auth). |
| Who owns OAuth? | `identity.user_oauth_providers` (replaces `googleId` column). |
| Who owns verification? | `identity.verification_tokens` (replaces `dataProtectionKeys`). |
| Who owns password reset? | `identity.verification_tokens`. |
| Who owns refresh tokens? | `identity.sessions` (merged with login tracking). |
| Who owns roles? | `identity.roles` + `identity.user_roles` (add FK constraints). |
| Who owns permissions? | `identity.user_claims` + `identity.role_claims` (add FK constraints). |
| Who owns settings? | `identity.user_preferences` (move to identity schema). |
| Who owns preferences? | Same as settings. |
| Who owns notifications? | `notification` schema (FK to `identity.users`). |
| Project-specific fields in users? | **No.** Split vertically by concern, not horizontally by project. |
| Separate profile tables? | **Yes.** `user_profiles`, `user_security`, `user_preferences` — all in identity schema. |
| FK behavior? | CASCADE within identity aggregate. RESTRICT for feature → identity. NO ACTION for analytics/audit. |
| ON DELETE CASCADE stays? | **Only within identity schema.** Change feature tables to RESTRICT. |
| RESTRICT for feature tables? | **Yes.** Prevents silent cascading deletes of user-owned feature data. |
| Project A removes a column? | Impossible. Feature schemas cannot modify identity tables. Identity is the source of truth. |
| Project B reacts? | It doesn't. Identity schema is stable. Feature schemas reference `users.id`, never columns. |
| Future migrations? | 5-phase approach: schema → data → code → column drop → auth consolidation. Each phase reversible. |
| Versioning? | Internal storage split doesn't change API contract. v1 continues. v2 only if response shape changes. |
| Backward compatibility? | JWT tokens, Redis caches, API responses — all preserved during migration. |

---

## 10. Entity Relationship Diagram (Target State)

```
┌─────────────────────────────────────────────────────────────┐
│                     IDENTITY SCHEMA                         │
│                                                             │
│  ┌──────────────┐     ┌──────────────────┐                 │
│  │    users      │────▶│  user_profiles    │                 │
│  │  (auth anchor)│────▶│  (display info)   │                 │
│  │              │────▶│  user_security    │                 │
│  │              │────▶│  user_preferences │                 │
│  │              │────▶│  user_oauth_providers │              │
│  │              │────▶│  sessions         │                 │
│  │              │────▶│  verification_tokens │               │
│  │              │────▶│  user_biometrics  │                 │
│  │              │────▶│  user_roles ─────▶│ roles           │
│  │              │────▶│  user_claims      │                 │
│  │              │────▶│  user_follows     │                 │
│  │              │────▶│  user_topics ────▶│ topics          │
│  └──────────────┘     └──────────────────┘                 │
│         ▲                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │ FK (RESTRICT)
┌─────────┼───────────────────────────────────────────────────┐
│         │         PUBLIC SCHEMA                             │
│  ┌──────┴───────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  playlists    │  │linkedAccounts │  │  userContents    │  │
│  │  playlistMembers│ │manualProfiles│  │  searchHistories │  │
│  │  playlistContent│ │              │  │  userTopics      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│                   NOTIFICATION SCHEMA                       │
│  ┌──────────────┐  ┌──────────────────┐                    │
│  │ notifications │  │notificationEvents │                    │
│  │              │  │notificationTemplates│                   │
│  └──────────────┘  └──────────────────┘                    │
│                                                             │
│                   ANALYTICS SCHEMA                          │
│  ┌──────────────┐  ┌──────────────────┐                    │
│  │analyticsEvents│  │  premiumRollups  │                    │
│  │  yt/fb analytics│ │                  │                    │
│  └──────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Appendix A: Column Migration Map

| Original Column (users) | Target Table | Target Column |
|--------------------------|-------------|---------------|
| firstName | user_profiles | first_name |
| lastName | user_profiles | last_name |
| bio | user_profiles | bio |
| gender | user_profiles | gender |
| phoneNumber | user_profiles | phone_number |
| profilePrivacy | user_profiles | profile_privacy |
| onboardingStep | user_profiles | onboarding_step |
| referralCode | user_profiles | referral_code |
| referredBy | user_profiles | referred_by |
| twoFactorEnabled | user_security | two_factor_enabled |
| twoFactorSecret | user_security | two_factor_secret |
| isLockedOut | user_security | is_locked_out |
| lockoutEnd | user_security | lockout_end |
| accessFailedCount | user_security | access_failed_count |
| newEmail | user_security | new_email |
| lastEmailModifiedAt | user_security | last_email_modified_at |
| newPhoneNumber | user_security | new_phone_number |
| lastPhoneNumberModifiedAt | user_security | last_phone_number_modified_at |
| lastUserNameModifiedAt | user_security | last_username_modified_at |
| lastPasswordModifiedAt | user_security | last_password_modified_at |
| googleId | user_oauth_providers | provider_uid (provider='google') |
| theme | user_preferences | theme |
| notificationChannelsEnabled | user_preferences | notification_channels_enabled |

## Appendix B: File Changes Required

| Area | Files Affected | Change Type |
|------|---------------|-------------|
| Entities | `src/domain/entities/identity/user.entity.ts` | Remove split columns |
| Entities | NEW: `userProfile.entity.ts`, `userSecurity.entity.ts`, `userSession.entity.ts`, `userOAuthProvider.entity.ts`, `verificationToken.entity.ts` | Create |
| Entities | `src/domain/entities/identity/userLogin.entity.ts` | Replace with session entity |
| Entities | `src/domain/entities/dataProtectionKey.entity.ts` | Replace with verification token |
| Entities | `src/domain/entities/identity/userPreference.entity.ts` | Move to identity schema |
| Repositories | All user-related repositories | Update to join split tables |
| Services | `profileCache.service.ts` | Update cache shape |
| Features | `auth/login/`, `auth/refresh-token/`, `auth/external/` | Update to use new entities |
| Features | `profile/`, `user/` | Update to use new entities |
| Migrations | NEW: 5+ migration files | Schema + data migration |
| Modules | `src/modules/` | Wire new entities |
| Config | `src/infrastructure/dependency.ts` | Add new repository tokens |
