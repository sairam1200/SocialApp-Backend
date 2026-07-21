# 09 — Complete Table Comparison: Project A vs Project B

> **Date:** 2026-07-19
> **Author:** Architecture Review (automated deep comparison)
> **Reads:** Doc 08, Doc 03, all Drizzle schema files, all TypeORM entities
> **Purpose:** Exhaustive table-by-table comparison of every entity in Project A and Project B to identify overlaps, merge candidates, and independent-only tables.

---

## Table of Contents

1. [Scope & Methodology](#scope)
2. [Complete Inventory](#inventory)
3. [Matched Pairs — Detailed Comparison](#matched-pairs)
4. [Project A Only Tables](#project-a-only)
5. [Project B Only Tables](#project-b-only)
6. [Summary Scorecard](#scorecard)
7. [Global Observations](#observations)
8. [Merge Priority Recommendations](#merge-priority)

---

## 1. Scope & Methodology

**Project A** (Drizzle ORM): `E:\Github\gaddr-jobs\src\server\db\`
- `auth-schema.ts` — Better Auth tables
- `merger-schema.ts` — Shared/merger tables
- `notification-schema.ts` — Notification tables
- `analytics-schema.ts` — Analytics tables
- `jobs-schema.ts` — Job platform tables
- `activity-feed-schema.ts` — Activity feed
- `audit-schema.ts` / `ai-audit-schema.ts` — Audit tables
- `ai-settings-schema.ts` — AI settings
- `admin-ai-key-schema.ts` — Admin AI keys
- `bounty-schema.ts` — Bounty tables
- `career-memory-schema.ts` — Career memory tables
- `cofounder-schema.ts` — Cofounder tables
- `community-schema.ts` — Community tables
- `community-fund-schema.ts` — Community fund tables
- `contribution-schema.ts` — Contribution tables
- `credential-schema.ts` — Credential tables
- `contract-schema.ts` — Contract tables
- `project-schema.ts` — Project/milestone tables
- `project-room-schema.ts` — Project room tables
- `opportunity-schema.ts` — Opportunity tables
- `application-schema.ts` — Application tables
- `company-schema.ts` — Company tables
- **All tables in `public` schema.** PKs: `text` (auth tables) or `serial` (merger/others).

**Project B** (TypeORM): `E:\gaddr-backend-api\src\domain\entities\`
- `identity/` — User, Role, UserRole, UserClaim, RoleClaim, UserLogin, UserBiometric, UserFollow, UserPreference, UserSession (does not exist)
- `notification/` — Notification, NotificationEvent, NotificationTemplate
- `analytics/` — AnalyticsEvent, PremiumRollup
- `public/` (root) — LinkedAccount, ManualProfile, UserContent, Playlist, PlaylistMember, PlaylistContent, ContentStream, PublishJob, RateLimit, RateLimitLog, SearchHistory, YoutubeAccount, YoutubeAnalytic, YoutubeVideo, YoutubeChannelAnalytics, YoutubeVideoAnalytics, DataProtectionKey, Topic
- **All entities inherit BaseEntity** (id UUID PK, createdBy, createdOn, lastModifiedBy, lastModifiedOn, lastRefreshed).
- **Schemas:** `identity`, `notification`, `analytics`, and default (public).

**Methodology:**
1. Enumerate every table in both projects
2. For each pair with name/semantic overlap, read actual source files and compare columns, PKs, FKs, indexes, constraints
3. Classify: EXACT_MATCH / STRUCTURAL_MATCH / PARTIAL_MATCH / MISMATCH / ONE_SIDED
4. Rate merge feasibility: EASY / MODERATE / HARD / SKIP

---

## 2. Complete Inventory

### Project A: 152 Tables by Domain

| Domain | Tables | Schema File |
|--------|--------|-------------|
| Auth & Identity | `user`, `session`, `account`, `verification`, `passkey`, `user_id_mapping` | auth-schema.ts |
| RBAC (proposed) | `roles`, `user_roles`, `user_claims`, `role_claims` | auth-schema.ts |
| Profiles | `job_seeker_profile`, `freelancer_profile`, `freelancer_availability`, `business_profile` | jobs-schema.ts |
| Merger/Shared (18) | `profiles`, `relationships`, `linked_accounts`, `user_topics`, `notification_events`, `notification_templates`, `newsletter_subscribers`, `user_contents`, `playlists`, `playlist_members`, `playlist_content`, `social_analytics`, `youtube_accounts`, `youtube_videos`, `content_streams`, `upload_jobs`, `search_histories`, `premium_rollups`, `rate_limit`, `rate_limit_logs`, `data_protection_keys` | merger-schema.ts |
| Opportunities | `opportunity` | opportunity-schema.ts |
| Applications | `application` | application-schema.ts |
| Companies | `company`, `company_follow` | company-schema.ts |
| Projects | `project`, `proposal`, `dispute`, `milestone`, `time_entry` | project-schema.ts |
| Project Rooms | `project_room`, `project_room_member`, `project_room_message` | project-room-schema.ts |
| Contracts | `contract` | contract-schema.ts |
| Notifications | `notification_preference`, `notification`, `conversation`, `conversation_participant`, `message`, `outreach_unsubscribe` | notification-schema.ts |
| Analytics | `analytics_event` | analytics-schema.ts |
| Activity Feed | `activity_feed` | activity-feed-schema.ts |
| Audit | `audit_log`, `ai_audit_log` | audit-schema.ts, ai-audit-schema.ts |
| AI Settings | `ai_settings` | ai-settings-schema.ts |
| Admin AI Keys | `admin_ai_key` | admin-ai-key-schema.ts |
| Bounties | `bounty`, `bounty_application` | bounty-schema.ts |
| Career Memory | `journal_entry`, `achievement`, `career_goal` | career-memory-schema.ts |
| Cofounder | `cofounder_listing`, `cofounder_match` | cofounder-schema.ts |
| Community | `community`, `community_member`, `community_post`, `community_event`, `community_event_attendee`, `community_poll`, `community_poll_vote` | community-schema.ts |
| Community Fund | `community_fund`, `fund_contribution`, `fund_payout` | community-fund-schema.ts |
| Contributions | `contribution_record`, `proof_of_contribution` | contribution-schema.ts |
| Credentials | `credential_issuer`, `issued_credential`, `trusted_issuer`, `disclosure_policy` | credential-schema.ts |
| **Total** | **~152 tables** | |

### Project B: 38 Entities by Schema

| Schema | Entities |
|--------|----------|
| `identity` | User, Role, UserRole, UserClaim, RoleClaim, UserLogin, UserBiometric, UserFollow, UserPreference |
| `notification` | Notification, NotificationEvent, NotificationTemplate |
| `analytics` | AnalyticsEvent, PremiumRollup |
| `public` (default) | LinkedAccount, ManualProfile, UserContent, Playlist, PlaylistMember, PlaylistContent, ContentStream, PublishJob, RateLimit, RateLimitLog, SearchHistory, YoutubeAccount, YoutubeAnalytic, YoutubeVideo, YoutubeChannelAnalytics, YoutubeVideoAnalytics, DataProtectionKey, Topic, NewsletterSubscriber |
| **Total** | **38 entities** |

---

## 3. Matched Pairs — Detailed Comparison

### Pair 1: `user` (A) vs `User` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `user` | `users` (identity schema) | ❌ |
| PK type | `text` (nanoid, hand-set) | `uuid` (auto-generated, BaseEntity) | ❌ |
| Column count | 31 | 33 (+BaseEntity 6) | ❌ |
| Core columns | id, name, email, email_verified, image, created_at, updated_at, first_name, last_name, role, two_factor_enabled, is_verified, is_admin, stripe_customer_id, stripe_price_id, stripe_subscription_id, subscription_status, subscription_plan, job_post_limit, active_job_post_count, wallet_address, private_search_mode, blocked_employers[], ai_analysis_opt_out, google_id, phone_number, gender, date_of_birth, onboarding_step, referral_code, referred_by, profile_privacy, source_app, status, deleted_at, banned_at, ban_reason | id, firstName, lastName, email, gender, phoneNumber, bio, googleId, referralCode, referredBy, profilePrivacy, type (enum), onboardingStep (enum), twoFactorEnabled, twoFactorSecret, passwordHash, securityStamp, concurrencyStamp, normalizedEmail, normalizedUserName, emailConfirmed, isLockedOut, lockoutEnd, accessFailedCount, newEmail, lastEmailModifiedAt, newPhoneNumber, lastPhoneNumberModifiedAt, lastUserNameModifiedAt, lastPasswordModifiedAt, isActive, registeredOn, userName | ❌ |
| Shared columns | firstName, lastName, email, gender, phoneNumber, googleId, referralCode, referredBy, profilePrivacy, onboardingStep, twoFactorEnabled | Same (names differ) | Partial |
| A-only | stripe_*, subscription_*, wallet_address, job_post_limit, blocked_employers[], deleted_at, banned_at, ban_reason, source_app, is_admin, ai_analysis_opt_out | — | |
| B-only | — | passwordHash, securityStamp, concurrencyStamp, isLockedOut, lockoutEnd, accessFailedCount, normalizedEmail, normalizedUserName, newEmail workflow, newPhoneNumber workflow, type (UserType enum), bio | |
| Soft delete | `deleted_at`, `banned_at`, `ban_reason` | None | ❌ |

**Verdict:** PARTIAL_MATCH — overlapping ~15 core columns, but neither is a superset.
**Merge feasibility:** HARD (see Doc 08 for resolution: text PK stays, B adapts)
**Strategy:** Doc 08's corrected path: keep `public.user` as canonical, add `uuid_id UUID` column, B reads from `public.user` with `uuid_id` for FK resolution.

---

### Pair 2: `session` (A) vs `UserSession` (B)

| Aspect | Project A | Project B |
|--------|-----------|-----------|
| Exists | ✅ `session` — id (text PK), expires_at, token (text, unique), created_at, updated_at, ip_address, user_agent, user_id (FK→user) | ❌ **Entity does not exist** |

**Verdict:** ONE_SIDED (A only)
**Merge feasibility:** SKIP — Project B has no UserSession entity. Better Auth session table is A-only.

---

### Pair 3: `account` (A) vs `UserLogin` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `account` | `userLogins` (identity schema) | ❌ |
| PK type | `text` | `uuid` (BaseEntity) | ❌ |
| Column count | 11 | 9 (+BaseEntity) | ❌ |
| Purpose | OAuth/link provider tokens (Better Auth) | Login session/device tracking (ASP.NET Identity) | ❌ |
| A columns | id, account_id, provider_id, user_id (FK→user), access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at | — | |
| B columns | — | id, provider, userId, tokenValue, userAgent, ipAddress, deviceId, isValid, addedDateUtc, expiryDateUtc | |
| Shared | userId, provider | provider, userId | Minimal |

**Verdict:** MISMATCH — different design intent (OAuth token store vs login session store)
**Merge feasibility:** HARD — semantically different despite both being "linked auth" tables.

---

### Pair 4: `verification` (A) vs (none in B)

**Verdict:** ONE_SIDED (A only) — Better Auth email/magic link tokens. No B equivalent.

---

### Pair 5: `passkey` (A) vs (none in B)

**Verdict:** ONE_SIDED (A only) — WebAuthn passkey storage. B's `UserBiometric` is for profile images, completely different.

---

### Pair 6: `profiles` (A) vs `ManualProfile` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `profiles` | `manualProfiles` | ❌ |
| PK type | `text` (FK→user.id, 1:1) | `uuid` (BaseEntity, independent) | ❌ |
| Purpose | User profile card (bio, image, social links) | Platform-specific profile link collection | ❌ |
| A columns | id (FK→user), full_name, username (unique), bio, profile_image_url, cover_image_url, location, website, social_links (jsonb), experiences (jsonb), educations (jsonb), follower_count, following_count, created_at, updated_at | — | |
| B columns | — | userId, platform, isActive, icon, url, displayOrder | |
| Shared | None meaningful | — | ❌ |

**Verdict:** MISMATCH — completely different entities despite similar names.
**Merge feasibility:** SKIP — `ManualProfile` is a platform link list. `profiles` is a user profile card. Cannot merge.

---

### Pair 7: `relationships` (A) vs `UserFollow` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `relationships` | `user_follows` (identity schema) | ❌ |
| PK type | `serial` | `uuid` (BaseEntity) | ❌ |
| Column count | 6 | 5 (+BaseEntity) | ❌ |
| A columns | id, user_id (FK→user), target_id (FK→user), type (varchar, default "follow"), status (varchar, default "active"), created_at | — | |
| B columns | — | followerId, followedId, status (FollowStatus enum: requested/accepted/blocked) | |
| Unique | (userId, targetId, type) | (followerId, followedId) | ❌ |
| Polymorphic | `type` field allows follow/friend/block | Only follow semantics | ❌ |

**Verdict:** PARTIAL_MATCH — same core concept, A is polymorphic, B is follow-only.
**Merge feasibility:** MODERATE — A's polymorphic `type` is a superset. B's enum status is richer.

---

### Pair 8: `linked_accounts` (A) vs `LinkedAccount` (B) ⭐ BEST MATCH

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `linked_accounts` | `linkedAccounts` | ✅ (semantic) |
| PK type | `serial` | `uuid` (BaseEntity) | ❌ |
| Column count | 10 | 12 (+BaseEntity) | ❌ |
| A columns | id, user_id, platform, username, profile_image, external_id, followers_count, following_count, verified, sync_enabled, created_at | — | |
| B columns | — | userId, platform, userName, profileImage, externalId, email, allowImport, followersCount, followingCount, verified, externalUrl, metaData (json), isVisible, syncEnabled | |
| Shared | userId, platform, username↔userName, profileImage, externalId, followersCount, followingCount, verified, syncEnabled | Same | ✅ (~9 columns) |
| B-only | — | email, externalUrl, metaData, isVisible, allowImport | |

**Verdict:** STRUCTURAL_MATCH — highest column overlap in the entire comparison.
**Merge feasibility:** EASY — ~9 shared columns, B adds 5 extra. Minimal migration effort.

---

### Pair 9: `user_topics` (A) vs `UserTopic` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `user_topics` | `userTopics` | ✅ (semantic) |
| PK type | `serial` | `uuid` (BaseEntity) | ❌ |
| Column count | 3 | 4 (+BaseEntity) | ❌ |
| A columns | id, user_id, topic_id (varchar, no FK) | — | |
| B columns | — | userId, topicId (FK→Topic entity), user (relation), topic (relation) | |
| Shared | userId, topicId | userId, topicId | ✅ |
| Unique | (userId, topicId) | (userId, topicId) | ✅ |

**Verdict:** PARTIAL_MATCH — core data identical, B has proper FK to Topic entity.
**Merge feasibility:** MODERATE — A treats topic_id as opaque varchar; B has full Topic entity with cascade.

---

### Pair 10: `notification_events` (A) vs `NotificationEvent` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `notification_events` | `notificationEvents` (notification schema) | ✅ (semantic) |
| Column count | 5 | 0 (+BaseEntity only, empty shell) | ❌ |
| A columns | id, notification_id, event (varchar), metadata (jsonb), created_at | — | |
| B columns | — | (empty — just BaseEntity fields) | |

**Verdict:** STRUCTURAL_MATCH — B entity is empty shell. Just populate with A's columns.
**Merge feasibility:** EASY — B needs 5 columns added.

---

### Pair 11: `notification_templates` (A) vs `NotificationTemplate` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `notification_templates` | `notificationTemplates` (notification schema) | ✅ (semantic) |
| Column count | 5 | 1 (+BaseEntity) | ❌ |
| A columns | id, name (unique), subject_template, body_template, is_active | — | |
| B columns | — | name | |
| Shared | name | name | ✅ |

**Verdict:** PARTIAL_MATCH — B only has `name`, missing 3 columns.
**Merge feasibility:** EASY — add subject_template, body_template, is_active.

---

### Pair 12: `newsletter_subscribers` (A) vs `NewsletterSubscriber` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `newsletter_subscribers` | `newsletter_subscribers` | ✅ (exact) |
| Column count | 5 | 1 (+BaseEntity) | ❌ |
| A columns | id, email (unique), user_id (FK→user), subscribed_at, unsubscribed_at | — | |
| B columns | — | email | |
| Shared | email (both unique) | email | ✅ |

**Verdict:** PARTIAL_MATCH — B only has `email`, missing 3 columns.
**Merge feasibility:** EASY — add userId, subscribedAt, unsubscribedAt.

---

### Pair 13: `user_contents` (A) vs `UserContent` (B) ⭐ STRONG MATCH

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `user_contents` | `userContents` | ✅ (semantic) |
| PK type | `serial` | `uuid` (BaseEntity) | ❌ |
| Column count | 11 | 12 (+BaseEntity) | ❌ |
| A columns | id, user_id, type, title, platform, external_id, text, media (jsonb), published_at, source_url, engagement (jsonb), created_at | — | |
| B columns | — | userId (uuid), type, title, platform, externalId, text, media (jsonb), publishedAt, sourceUrl, engagement (jsonb), tags (string[]), metaData (json) | |
| Shared | userId, type, title, platform, externalId, text, media, publishedAt, sourceUrl, engagement | Same | ✅ (~10 columns) |
| Unique | (userId, platform, externalId) | (userId, platform, externalId) | ✅ |
| B-only | — | tags, metaData | |

**Verdict:** STRUCTURAL_MATCH — nearly identical. Same unique constraint.
**Merge feasibility:** EASY — 10 shared columns, B adds 2 extras.

---

### Pair 14: `playlists` (A) vs `Playlist` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `playlists` | `playlists` | ✅ (exact) |
| Column count | 6 | 5 (+BaseEntity) | ❌ |
| A columns | id, user_id (FK→user), name, description, is_public (boolean, default true), created_at | — | |
| B columns | — | name, referenceId (unique, auto-gen slug), description, displayOrder | |
| Shared | name, description | name, description | Partial |
| A-only | userId, isPublic | — | |
| B-only | — | referenceId (unique slug), displayOrder | |

**Verdict:** PARTIAL_MATCH — shared name/description, different extras.
**Merge feasibility:** MODERATE — need to add isPublic, userId FK to B, or vice versa.

---

### Pair 15: `playlist_members` (A) vs `PlaylistMember` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `playlist_members` | `playlistMembers` | ✅ (semantic) |
| Column count | 4 | 4 (+BaseEntity) | ❌ |
| A columns | id, playlist_id, user_id, role (varchar, default "member") | — | |
| B columns | — | playlist (FK), user (FK), role (PlaylistMemberRole enum: Owner/Editor/Viewer), joinedAt, removedAt | |
| Shared | playlist, userId, role | Same | Partial |
| Unique | (playlistId, userId) | (playlist, user) | ✅ |

**Verdict:** PARTIAL_MATCH — same concept, B has richer role enum and soft delete.
**Merge feasibility:** MODERATE — map role values, add timestamps.

---

### Pair 16: `playlist_content` (A) vs `PlaylistContent` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `playlist_content` | `playlistContent` | ✅ (semantic) |
| Column count | 4 | 9 (+BaseEntity) | ❌ |
| Design | Junction table: playlistId + contentId (FK→user_contents) + position | Denormalized: type, platform, contentId, contentUrl, title, description, thumbnailUrl, metadata, addedBy | ❌ |
| Shared | playlistId, contentId | playlist, contentId | Partial |

**Verdict:** MISMATCH — fundamentally different design (reference vs denormalized).
**Merge feasibility:** HARD — requires architectural decision on which model to keep.

---

### Pair 17: `social_analytics` (A) vs (none in B)

**Verdict:** ONE_SIDED (A only) — platform/entity analytics snapshots. No B equivalent.

---

### Pair 18: `youtube_accounts` (A) vs `YoutubeAccount` (B) ⭐ STRONG MATCH

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `youtube_accounts` | `youtube_accounts` | ✅ (exact) |
| Column count | 8 | 8 (+BaseEntity) | ❌ |
| A columns | id, user_id, channel_id (unique), channel_title, access_token, refresh_token, token_expiry, connected | — | |
| B columns | — | userId, channelId (unique index), channelTitle, accessToken, refreshToken, tokenExpiry, connected, disconnectedAt | |
| Shared | userId, channelId, channelTitle, accessToken, refreshToken, tokenExpiry, connected | Same | ✅ (7 columns) |
| B-only | — | disconnectedAt | |

**Verdict:** STRUCTURAL_MATCH — nearly identical.
**Merge feasibility:** EASY — 7 shared columns, B adds 1 extra.

---

### Pair 19: `youtube_videos` (A) vs `YoutubeVideo` (B) ⭐ STRONG MATCH

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `youtube_videos` | `youtube_videos` | ✅ (exact) |
| Column count | 9 | 12 (+BaseEntity) | ❌ |
| A columns | id, account_id (FK→youtube_accounts), youtube_video_id, title, description, visibility, status (default "draft"), thumbnail_url, video_url, created_at | — | |
| B columns | — | accountId (indexed), youtubeVideoId, title, description, visibility, publishAt, publishedAt, status (default "draft"), thumbnailUrl, youtubeUrl, videoUrl, r2Key, tags (string[]) | |
| Shared | accountId, youtubeVideoId, title, description, visibility, status, thumbnailUrl, videoUrl | Same | ✅ (8 columns) |
| B-only | — | publishAt, publishedAt, youtubeUrl, r2Key, tags | |

**Verdict:** STRUCTURAL_MATCH — good overlap, B adds scheduling and storage fields.
**Merge feasibility:** EASY — 8 shared columns, B adds 5 extras.

---

### Pair 20: `content_streams` (A) vs `ContentStream` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `content_streams` | `contentStreams` | ✅ (semantic) |
| Purpose | User-tied URL streams (name, platform, streamUrl, isActive) | Categorized content streams (type enum: Profile/Content/Community, subType, title, platform, externalId, metaData) | ❌ |
| Shared | platform | platform | Minimal |

**Verdict:** MISMATCH — completely different design despite name similarity.
**Merge feasibility:** HARD — serve different purposes.

---

### Pair 21: `upload_jobs` (A) vs `UploadJob` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `upload_jobs` | `upload_jobs` | ✅ (exact) |
| Purpose | Generic upload (type, sourceUrl, result jsonb) | YouTube-specific with retry logic (attempts, progress, statusMessage, lastError, nextRetryAt, r2Key, fileSize) | ❌ |
| Shared | status (both default "pending") | status | Minimal |

**Verdict:** MISMATCH — different design intent.
**Merge feasibility:** HARD — evolved for different use cases.

---

### Pair 22: `search_histories` (A) vs `SearchHistory` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `search_histories` | `searchHistories` | ✅ (semantic) |
| A columns | id, user_id, query (text, NOT NULL), filters (jsonb), created_at | — | |
| B columns | — | originalQuery, normalizedQuery, userId | |
| Shared | userId, query↔originalQuery | Same concept | Partial |
| B-only | — | normalizedQuery | |
| A-only | filters (jsonb) | — | |

**Verdict:** PARTIAL_MATCH — same concept, B splits into original/normalized.
**Merge feasibility:** MODERATE — normalize A's query into B's dual-field approach, migrate filters.

---

### Pair 23: `premium_rollups` (A) vs `PremiumRollup` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `premium_rollups` | `premiumRollups` (analytics schema) | ✅ (semantic) |
| A columns | id, user_id, period (varchar), metrics (jsonb), created_at | — | |
| B columns | — | userId, weekStartDate (timestamp), totalInteractions, topFeatureUsed, interactionBreakdown (jsonb) | |
| Shared | userId, jsonb metrics ↔ interactionBreakdown | Same concept | Partial |

**Verdict:** PARTIAL_MATCH — same concept, different granularity.
**Merge feasibility:** MODERATE — A is flexible, B is more structured.

---

### Pair 24: `analytics_event` (A) vs `AnalyticsEvent` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `analytics_event` | `analyticsEvents` (analytics schema) | ✅ (semantic) |
| A columns | id, event (text, NOT NULL), user_id (FK→user SET NULL), metadata (jsonb), created_at | — | |
| B columns | — | eventName, userId (nullable), metadata (jsonb) | |
| Shared | event↔eventName, userId, metadata | Same | ✅ (3 columns) |
| Column diff | `event` | `eventName` | ❌ (rename) |
| A indexes | 3 indexes (event, user_id, created_at) | None | ❌ |

**Verdict:** PARTIAL_MATCH — identical concept, minor column rename.
**Merge feasibility:** EASY — just rename `event`→`eventName` and add indexes to B.

---

### Pair 25: `notification_preference` (A) vs `UserPreference` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `notification_preference` | `userPreferences` | ❌ |
| Purpose | Granular notification channel toggles (push, email, newsletter, SMS, in-app booleans) | User UI preferences (theme, notificationChannelsEnabled enum array) | ❌ |
| A columns | userId (PK), push_notification_enabled, email_notification_enabled, newsletter_notification_enabled, sms_notification_enabled, in_app_notification_enabled, outreach_opt_out, push_notification_preferences (jsonb), email_notification_preferences (jsonb), created_at, updated_at | — | |
| B columns | — | userId (PrimaryColumn), theme (Theme enum), notificationChannelsEnabled (NotificationChannel[] enum) | |
| Shared | userId | userId | Minimal |

**Verdict:** MISMATCH — completely different preference models.
**Merge feasibility:** HARD — A is detailed channel toggles, B is theme/channel-enum. Would need to expand B significantly or keep both.

---

### Pair 26: `notification` (A) vs `Notification` (B)

| Aspect | Project A | Project B | Match |
|--------|-----------|-----------|-------|
| Table name | `notification` | `notifications` (notification schema) | ✅ (semantic) |
| Column count | 7 | 7 (+BaseEntity) | ❌ |
| A columns | id, user_id (FK→user), type (text, default "info"), title, message, link, is_read (boolean), created_at | — | |
| B columns | — | metaData (json), type (NotificationType enum), title, body, notifyId (uuid), isLive, sound, readAt (timestamp) | |
| Shared | type, title | type, title | Partial |
| Column diff | `message` | `body` | ❌ (rename) |
| Read tracking | `is_read` (boolean) | `readAt` (timestamp) | ❌ |
| Type system | free text (default "info") | NotificationType enum (only "Import") | ❌ |
| A-only | userId FK, link, isRead | — | |
| B-only | — | metaData, notifyId, isLive, sound, readAt | |

**Verdict:** PARTIAL_MATCH — same concept, divergent implementations.
**Merge feasibility:** HARD — different read-tracking model, different type system, different extras.

---

### Pair 27–31: YouTube Analytics Tables

| Pair | Project A | Project B | Verdict |
|------|-----------|-----------|---------|
| 27 | (no table) | `YoutubeAnalytic` (videoId, views, likes, comments, watchTime, snapshotDate) | ONE_SIDED (B only) |
| 28 | (no table) | `YoutubeChannelAnalytics` | ONE_SIDED (B only) |
| 29 | (no table) | `YoutubeVideoAnalytics` | ONE_SIDED (B only) |
| 30 | (no table) | `FacebookPageAnalytics` | ONE_SIDED (B only) |
| 31 | (no table) | `FacebookPostAnalytics`, `FacebookVideoAnalytics` | ONE_SIDED (B only) |

**Note:** Earlier catalogs incorrectly listed YouTube analytics tables as existing in Project A. They do NOT exist in any Project A schema file. These are all Project B-only entities.

---

### Pair 32–35: RBAC Tables (B only)

| Pair | Project A | Project B | Verdict |
|------|-----------|-----------|---------|
| 32 | (no table) | `UserClaim` (userId, claimType, claimValue) | ONE_SIDED (B only) |
| 33 | (no table) | `Role` (name, description, type enum) | ONE_SIDED (B only) |
| 34 | (no table) | `UserRole` (userId, roleId) | ONE_SIDED (B only) |
| 35 | (no table) | `RoleClaim` (roleId, claimType, claimValue) | ONE_SIDED (B only) |

**Note:** Project A stores role as a plain text column on `user` table. Project B has full RBAC entity model. These are ASP.NET Identity concepts with no A equivalent.

---

### Pair 36–38: Infrastructure Tables (B only)

| Pair | Project A | Project B | Verdict |
|------|-----------|-----------|---------|
| 36 | (no table) | `RateLimit` (ip, userId, route, count, expiresAt) | ONE_SIDED (B only) |
| 37 | (no table) | `RateLimitLog` (ip, route, count, userId, expiredAt) | ONE_SIDED (B only) |
| 38 | (no table) | `DataProtectionKey` (userId, key, value, expiresIn) | ONE_SIDED (B only) |

---

## 4. Project A Only Tables (No B Equivalent)

These tables exist only in Project A and have no counterpart in Project B:

| Table | Domain | Notes |
|-------|--------|-------|
| `session` | Auth | Better Auth session store |
| `account` | Auth | OAuth/link provider tokens (Better Auth) |
| `verification` | Auth | Email/magic link verification tokens |
| `passkey` | Auth | WebAuthn passkey storage |
| `user_id_mapping` | Auth | **DEAD CODE** — zero runtime references |
| `profiles` | Merger | Full user profile card (bio, image, social links, experience, education) |
| `social_analytics` | Merger | Platform entity analytics snapshots |
| `conversation` | Messaging | DM conversation container |
| `conversation_participant` | Messaging | DM conversation membership |
| `message` | Messaging | DM message content |
| `outreach_unsubscribe` | Messaging | Outreach opt-out tokens |
| `job_seeker_profile` | Jobs | Job seeker specific profile |
| `freelancer_profile` | Jobs | Freelancer specific profile |
| `freelancer_availability` | Jobs | Freelancer availability schedule |
| `business_profile` | Jobs | Business/company profile |
| `opportunity` | Jobs | Job/gig opportunities |
| `application` | Jobs | Job applications |
| `company` | Companies | Company listings |
| `company_follow` | Companies | Company follow relationships |
| `project` | Projects | Project listings |
| `proposal` | Projects | Project proposals |
| `dispute` | Projects | Project disputes |
| `milestone` | Projects | Project milestones |
| `time_entry` | Projects | Time tracking entries |
| `project_room` | Projects | Project chat rooms |
| `project_room_member` | Projects | Room membership |
| `project_room_message` | Projects | Room messages |
| `contract` | Contracts | Freelancer contracts |
| `bounty` | Bounties | Bounty listings |
| `bounty_application` | Bounties | Bounty applications |
| `activity_feed` | Activity | User activity feed |
| `audit_log` | Audit | General audit log |
| `ai_audit_log` | Audit | AI-specific audit log |
| `ai_settings` | AI | AI provider/model configuration |
| `admin_ai_key` | AI | Admin API key storage |
| `journal_entry` | Career | Career journal entries |
| `achievement` | Career | User achievements |
| `career_goal` | Career | Career goals |
| `cofounder_listing` | Cofounder | Cofounder listings |
| `cofounder_match` | Cofounder | Cofounder matching |
| `community` | Community | Community spaces |
| `community_member` | Community | Community membership |
| `community_post` | Community | Community posts |
| `community_event` | Community | Community events |
| `community_event_attendee` | Community | Event attendance |
| `community_poll` | Community | Community polls |
| `community_poll_vote` | Community | Poll votes |
| `community_fund` | Community Fund | Fund pools |
| `fund_contribution` | Community Fund | Fund contributions |
| `fund_payout` | Community Fund | Fund payouts |
| `contribution_record` | Contributions | Contribution records |
| `proof_of_contribution` | Contributions | Proof of contribution |
| `credential_issuer` | Credentials | Credential issuers |
| `issued_credential` | Credentials | Issued credentials |
| `trusted_issuer` | Credentials | Trusted issuers |
| `disclosure_policy` | Credentials | Disclosure policies |
| `relationship` | Merger | Polymorphic relationships |
| `user_notification_preference` | Notification | Granular channel toggles |

---

## 5. Project B Only Tables (No A Equivalent)

| Table | Schema | Notes |
|-------|--------|-------|
| `UserClaim` | identity | ASP.NET Identity claims (claimType, claimValue) |
| `Role` | identity | Full RBAC role entity with enum type |
| `UserRole` | identity | Many-to-many user-role join with disable capability |
| `RoleClaim` | identity | Role-level claims |
| `UserBiometric` | identity | Profile images with privacy settings (NOT biometrics) |
| `UserFollow` | identity | Follow-only relationships (replaces polymorphic relationships) |
| `UserPreference` | identity | Theme + notification channel enum |
| `Topic` | public | Topic entity (referenced by UserTopic FK) |
| `PublishJob` | public | YouTube publish jobs (different from UploadJob) |
| `RateLimit` | public | IP/route rate limiting |
| `RateLimitLog` | public | Rate limit audit log |
| `DataProtectionKey` | public | ASP.NET data protection keys |
| `YoutubeAnalytic` | public | YouTube video daily analytics |
| `YoutubeChannelAnalytics` | public | YouTube channel-level analytics |
| `YoutubeVideoAnalytics` | public | YouTube video-level analytics |
| `FacebookPageAnalytics` | public | Facebook page analytics |
| `FacebookPostAnalytics` | public | Facebook post analytics |
| `FacebookVideoAnalytics` | public | Facebook video analytics |

---

## 6. Summary Scorecard

| # | Pair | Verdict | Feasibility | Shared Cols | Priority |
|---|------|---------|-------------|-------------|----------|
| 1 | `user` / `User` | PARTIAL_MATCH | HARD | ~15 | HIGH (see Doc 08) |
| 2 | `session` / UserSession | ONE_SIDED | SKIP | — | — |
| 3 | `account` / `UserLogin` | MISMATCH | HARD | ~2 | LOW |
| 4 | `verification` / — | ONE_SIDED | SKIP | — | — |
| 5 | `passkey` / — | ONE_SIDED | SKIP | — | — |
| 6 | `profiles` / `ManualProfile` | MISMATCH | SKIP | 0 | — |
| 7 | `relationships` / `UserFollow` | PARTIAL_MATCH | MODERATE | ~3 | MEDIUM |
| 8 | `linked_accounts` / `LinkedAccount` | STRUCTURAL_MATCH | EASY | ~9 | HIGH |
| 9 | `user_topics` / `UserTopic` | PARTIAL_MATCH | MODERATE | ~2 | MEDIUM |
| 10 | `notification_events` / `NotificationEvent` | STRUCTURAL_MATCH | EASY | ~5 | HIGH |
| 11 | `notification_templates` / `NotificationTemplate` | PARTIAL_MATCH | EASY | ~1 | HIGH |
| 12 | `newsletter_subscribers` / `NewsletterSubscriber` | PARTIAL_MATCH | EASY | ~1 | HIGH |
| 13 | `user_contents` / `UserContent` | STRUCTURAL_MATCH | EASY | ~10 | HIGH |
| 14 | `playlists` / `Playlist` | PARTIAL_MATCH | MODERATE | ~2 | MEDIUM |
| 15 | `playlist_members` / `PlaylistMember` | PARTIAL_MATCH | MODERATE | ~3 | MEDIUM |
| 16 | `playlist_content` / `PlaylistContent` | MISMATCH | HARD | ~2 | LOW |
| 17 | `social_analytics` / — | ONE_SIDED | SKIP | — | — |
| 18 | `youtube_accounts` / `YoutubeAccount` | STRUCTURAL_MATCH | EASY | ~7 | HIGH |
| 19 | `youtube_videos` / `YoutubeVideo` | STRUCTURAL_MATCH | EASY | ~8 | HIGH |
| 20 | `content_streams` / `ContentStream` | MISMATCH | HARD | ~1 | LOW |
| 21 | `upload_jobs` / `UploadJob` | MISMATCH | HARD | ~1 | LOW |
| 22 | `search_histories` / `SearchHistory` | PARTIAL_MATCH | MODERATE | ~2 | MEDIUM |
| 23 | `premium_rollups` / `PremiumRollup` | PARTIAL_MATCH | MODERATE | ~2 | MEDIUM |
| 24 | `analytics_event` / `AnalyticsEvent` | PARTIAL_MATCH | EASY | ~3 | HIGH |
| 25 | `notification_preference` / `UserPreference` | MISMATCH | HARD | ~1 | LOW |
| 26 | `notification` / `Notification` | PARTIAL_MATCH | HARD | ~2 | LOW |

**EASY merges (8 tables):** pairs 8, 10, 11, 12, 13, 18, 19, 24
**MODERATE merges (7 tables):** pairs 7, 9, 14, 15, 22, 23
**HARD merges (6 tables):** pairs 1, 3, 16, 20, 21, 25, 26
**SKIP/ONE_SIDED (15 tables):** pairs 2, 4, 5, 6, 17, 27–38

---

## 7. Global Observations

### 7.1 PK Strategy Conflict (Universal)

| Project A | Project B |
|-----------|-----------|
| `text` PKs on auth tables (nanoid) | `uuid` PKs via BaseEntity on ALL entities |
| `serial` (auto-int) on merger tables | — |

**Impact:** Every merged table must resolve which PK type wins. Per Doc 08: keep `public.user` text PK as canonical. For merger tables, the 18 tables already have both text and int PKs — adding UUID alongside is a new column, not a replacement.

### 7.2 BaseEntity Tax

Every Project B entity inherits 6 columns: `id`, `createdBy`, `createdOn`, `lastModifiedBy`, `lastModifiedOn`, `lastRefreshed`. Project A tables have only `created_at` and sometimes `updated_at`.

**Impact:** Merging into Project B's schema requires either:
- Adding BaseEntity columns to Project A's tables (6 extra columns per table), OR
- Creating view/DTO mappings to satisfy B's entity expectations

### 7.3 Schema Location Split

Project A puts all tables in `public` schema (Drizzle default). Project B splits across `identity`, `notification`, `analytics`, and `public`.

**Impact:** For the 8 EASY merges, the schema location decision is cosmetic but must be consistent. Recommendation: keep tables where they are in Project A's `public` schema.

### 7.4 Column Name Conventions

| Project A | Project B |
|-----------|-----------|
| `snake_case` | `camelCase` |
| `user_id` | `userId` |
| `created_at` | `createdOn` (from BaseEntity) |
| `updated_at` | `lastModifiedOn` (from BaseEntity) |
| `channel_id` | `channelId` |
| `access_token` | `accessToken` |

**Impact:** TypeORM and Drizzle handle this at the ORM layer. Database column names can stay as-is. The ORM maps automatically.

### 7.5 Nullability Differences

Project B is generally stricter (NOT NULL on more fields). Project A is more permissive (nullable tokens, optional fields).

**Impact:** Merging into B's schema may require adding NOT NULL constraints to A's nullable columns, or vice versa. Requires per-column analysis.

### 7.6 Missing Files Correction

- **`E:\Github\gaddr-jobs\src\server\db\youtube-schema.ts` DOES NOT EXIST.** Earlier catalogs incorrectly listed YouTube analytics, goals, channel categories, etc. as Project A tables. These are all Project B-only entities.
- Project A has no YouTube analytics tables at all — only `youtube_accounts` and `youtube_videos` (in merger-schema.ts).

---

## 8. Merge Priority Recommendations

### Phase 1: EASY Merges (8 tables, ~1-2 days)

These tables have high column overlap and minimal structural differences:

| Pair | Action | Effort |
|------|--------|--------|
| 8: `linked_accounts` / `LinkedAccount` | Add 5 missing B columns (email, externalUrl, metaData, isVisible, allowImport) | 0.5 day |
| 13: `user_contents` / `UserContent` | Add 2 missing B columns (tags, metaData), align userId type | 0.5 day |
| 18: `youtube_accounts` / `YoutubeAccount` | Add disconnectedAt, align nullability | 0.25 day |
| 19: `youtube_videos` / `YoutubeVideo` | Add 5 B-only columns, align accountId FK | 0.25 day |
| 10: `notification_events` / `NotificationEvent` | Populate empty B shell with A's 5 columns | 0.25 day |
| 11: `notification_templates` / `NotificationTemplate` | Add 3 missing columns to B | 0.25 day |
| 12: `newsletter_subscribers` / `NewsletterSubscriber` | Add 3 missing columns to B | 0.25 day |
| 24: `analytics_event` / `AnalyticsEvent` | Rename event→eventName, add 3 indexes | 0.25 day |

### Phase 2: MODERATE Merges (7 tables, ~2-3 days)

These require some structural reconciliation:

| Pair | Action | Effort |
|------|--------|--------|
| 7: `relationships` / `UserFollow` | Decide: keep polymorphic A model or adopt B's follow-only? | 1 day |
| 9: `user_topics` / `UserTopic` | Create Topic entity in A or adopt B's Topic table | 0.5 day |
| 14: `playlists` / `Playlist` | Add isPublic to B, reconcile referenceId auto-gen | 0.5 day |
| 15: `playlist_members` / `PlaylistMember` | Map role varchar → enum, add timestamps | 0.5 day |
| 22: `search_histories` / `SearchHistory` | Split A's query into original/normalized, migrate filters | 0.5 day |
| 23: `premium_rollups` / `PremiumRollup` | Reconcile flexible period string vs structured week fields | 0.5 day |

### Phase 3: HARD Merges (defer — see Doc 08)

| Pair | Issue | Recommendation |
|------|-------|----------------|
| 1: `user` / `User` | PK mismatch, 15+ divergent columns, neither is superset | See Doc 08: keep `public.user` canonical, B adapts with `uuid_id` column |
| 3: `account` / `UserLogin` | Different design intent (OAuth tokens vs login sessions) | Keep separate — they serve different purposes |
| 16: `playlist_content` / `PlaylistContent` | Reference model vs denormalized model | Architectural decision required |
| 20: `content_streams` / `ContentStream` | Different design purposes | Keep separate |
| 21: `upload_jobs` / `UploadJob` | Generic vs YouTube-specific | Keep separate |
| 25: `notification_preference` / `UserPreference` | Different preference models | Keep separate or expand B significantly |
| 26: `notification` / `Notification` | Different read-tracking, type system | Keep separate or unify with adapter |

### Phase 4: ONE_SIDED (no action needed)

- **A-only tables** (55+): Job platform, projects, contracts, bounties, community, career memory, etc. — these are Project A's core domain. No merge needed.
- **B-only tables** (18): RBAC (Role, UserRole, UserClaim, RoleClaim), infrastructure (RateLimit, RateLimitLog, DataProtectionKey), YouTube/Facebook analytics — these are Project B's domain. No merge needed.

---

## Appendix: Quick Reference — Column Overlap Heat Map

```
Pair  | Overlap | Columns
------|---------|--------
#13   | ████░   | 10/12 shared (user_contents/UserContent)
#8    | ████░   | 9/14 shared (linked_accounts/LinkedAccount)
#19   | ████░   | 8/13 shared (youtube_videos/YoutubeVideo)
#18   | ████░   | 7/8 shared (youtube_accounts/YoutubeAccount)
#1    | ███░░   | 15/33 shared (user/User — but different PKs)
#10   | ███░░   | 5/5 shared (notification_events — B is empty)
#24   | ███░░   | 3/3 shared (analytics_event — minor rename)
#7    | ██░░░   | 3/6 shared (relationships/UserFollow)
#15   | ██░░░   | 3/4 shared (playlist_members/PlaylistMember)
#14   | ██░░░   | 2/6 shared (playlists/Playlist)
#22   | ██░░░   | 2/5 shared (search_histories/SearchHistory)
#23   | ██░░░   | 2/5 shared (premium_rollups/PremiumRollup)
#26   | ██░░░   | 2/7 shared (notification/Notification)
#9    | ██░░░   | 2/4 shared (user_topics/UserTopic)
#3    | █░░░░   | 2/11 shared (account/UserLogin)
#6    | ░░░░░   | 0/15 shared (profiles/ManualProfile — MISMATCH)
```
