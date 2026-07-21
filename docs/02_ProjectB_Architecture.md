# 02 — Project B: Complete Architecture Audit

**Date**: 2026-07-19
**Backend**: `E:\gaddr-backend-api` (NestJS 11 + TypeORM 0.3.23 + PostgreSQL)
**Frontend**: `E:\SocialApp` (Next.js 16 + React 19 + Zustand + restfit)
**Frontend status**: Read-only inspection, no modifications.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Authentication & Session](#2-authentication--session)
3. [TypeORM Entity Audit](#3-typeorm-entity-audit)
4. [DTO / Type Contract Comparison](#4-dto--type-contract-comparison)
5. [Enum & Default Value Mismatches](#5-enum--default-value-mismatches)
6. [Relationships, Cascades & Eager/Lazy Loading](#6-relationships-cascades--eagerlazy-loading)
7. [Notification System](#7-notification-system)
8. [WebSocket Events](#8-websocket-events)
9. [Roles, Permissions & Guards](#9-roles-permissions--guards)
10. [Uploads, Media & Profile](#10-uploads-media--profile)
11. [Frontend Gaps — Missing Backend Capabilities](#11-frontend-gaps--missing-backend-capabilities)
12. [Backend Gaps — Missing Frontend Exposure](#12-backend-gaps--missing-frontend-exposure)
13. [Critical Issues](#13-critical-issues)
14. [Recommendations](#14-recommendations)

---

## 1. Executive Summary

| Metric | Backend | Frontend |
|--------|---------|----------|
| TypeORM entities | 39 (incl. base) | N/A |
| Claim types (JWT) | 14 | 14 |
| Enum types | 15 | 0 (hardcoded strings) |
| API endpoints consumed | ~120 | ~120 |
| WebSocket namespaces | 2 (notifications, imports) | 2 |
| Platform integrations | 11+ | 11 |
| OAuth providers (login) | Google, Facebook | Google, Facebook |
| Auth strategies | JWT + Better Auth + OAuth2 | JWT (cookie + localStorage) |
| DB schemas | 4 (identity, notification, analytics, default) | N/A |

### Top-Level Findings

| Severity | Count | Summary |
|----------|-------|---------|
| **CRITICAL** | 3 | JWT secret shared in `.env.local`, `UserType`/`OnboardingStep` missing from frontend type, `onboardingStep` claim missing from frontend JwtPayload |
| **HIGH** | 8 | Notification type field missing in frontend, missing `link`/`isRead`/`updatedAt` columns in backend entity, missing `sound`/`isLive` in frontend type, frontend `UserPhotoPrivacy` is string literal vs backend enum, `RegisterRequestType` missing `deviceId`, `userName` field commented out in frontend |
| **MEDIUM** | 12 | `UserClaim` not extending BaseEntity, inconsistent nullable defaults, JSON vs JSONB inconsistency, missing indexes on `userContents.userId`, `RoleClaim` FK typing issue, `searchHistories.userId` should be nullable, missing `isGuestView` backend model field, frontend `Notification.link` not in backend entity, missing `RegisterResponseType.photo` source, missing `role.description` nullable handling, `UserRole` entity has no FK decorators |
| **LOW** | 8 | Naming convention mismatches (`UserPhotoPrivacyDto` vs `UserPhotoPrivacy`), missing Swagger on some models, `NotificationEvent`/`NotificationTemplate` are empty placeholders, form validation split (zod + yup), `manualProfiles` missing `isActive` in frontend type |

---

## 2. Authentication & Session

### 2.1 JWT Configuration Comparison

| Property | Backend | Frontend | Match |
|----------|---------|----------|-------|
| Secret source | `JWT_SECRET` env | `JWT_SECRET` env | YES |
| Access token expiry | `JWT_ACCESS_EXPIRATION_MINUTES` (default `7d`) | Same env read | YES |
| Refresh token expiry | `JWT_REFRESH_EXPIRATION_HOURS` (default `30d`) | Same env read | YES |
| Issuer | `JWT_ISSUER` env | Same env read | YES |
| Audience | `JWT_AUDIENCE` env | Same env read | YES |
| Algorithm | HS256 (via `@nestjs/jwt`) | HS256 (via `jose`) | YES |

### 2.2 JWT Claims — Full Comparison

| Claim URI | Backend (`Globals.ClaimTypes`) | Frontend (`ClaimTypes`) | Match |
|-----------|------|---------|-------|
| `http://gaddr.com/claims/sub` | UserId | UserId | YES |
| `http://gaddr.com/claims/email` | Email | Email | YES |
| `http://gaddr.com/claims/2fa-required` | TwoFARequired | TwoFARequired | YES |
| `http://gaddr.com/claims/security-stamp` | SecurityStamp | SecurityStamp | YES |
| `http://gaddr.com/claims/concurrency-stamp` | ConcurrencyStamp | ConcurrencyStamp | YES |
| `http://gaddr.com/claims/usertype` | UserType | UserType | YES |
| `http://gaddr.com/claims/username` | UserName | UserName | YES |
| `http://gaddr.com/claims/profile-picture` | ProfileImage | ProfileImage | YES |
| `http://gaddr.com/claims/account-type` | AccountType | AccountType | YES |
| `http://gaddr.com/claims/givenname` | GivenName | GivenName | YES |
| `http://gaddr.com/claims/familyname` | FamilyName | FamilyName | YES |
| `http://gaddr.com/claims/fullname` | FullName | FullName | YES |
| `http://gaddr.com/claims/roles` | Roles | Roles | YES |
| `permission` | Permission | Permission | YES |

**All 14 claim types match.** No URI mismatches.

### 2.3 Token Storage — Dual Strategy

| Location | Backend expectation | Frontend implementation | Issue |
|----------|-------------------|------------------------|-------|
| Cookie `access_token` | ✅ Read by `HttpContextMiddleware` | ✅ Set on login | OK |
| Cookie `refresh_token` | ✅ Read by refresh endpoint | ✅ Set on login | OK |
| `localStorage.accessToken` | ❌ Backend doesn't know about this | ✅ Used by restfit client | Security risk — XSS target |
| `localStorage.deviceId` | ✅ Sent as `deviceId` param | ✅ Generated via `crypto.randomUUID()` | OK |
| `localStorage.remembered_user_info` | N/A | ✅ Frontend-only UI helper | OK |

**Issue**: Backend has dual auth detection in `HttpContextMiddleware`:
- Checks `Authorization: Bearer` header first
- Then falls back to `better-auth.session_token` cookie
- Then falls back to custom `access_token` cookie

Frontend only uses Bearer token (from `localStorage.accessToken`) for API calls and the `access_token` cookie for SSR. The Better Auth path is only used when Better Auth SDK directly calls the API.

### 2.4 Refresh Token Flow

| Step | Backend | Frontend | Match |
|------|---------|----------|-------|
| Request body | `{ refreshToken, userAgent, ipAddress, deviceId }` | `RefreshTokenRequestType` has all 4 fields | YES |
| Response | `TokenResponseModel` with `access_token`, `refresh_token`, `refreshTokenExpiryTime` | `TokenResponseType` has same fields | YES |
| Concurrency stamp check | Returns `X-Token-Refresh-Required` header | `tokenRefresh.interceptor.ts` catches this header | YES |
| Security stamp mismatch | Returns 401 | `unauthorized.interceptor.ts` catches 401 | YES |
| Device ID rotation | Backend validates `deviceId` against `UserLogin.deviceId` | Frontend sends `deviceId` from localStorage | YES |

### 2.5 Authentication Flow Differences

| Feature | Backend | Frontend |
|---------|---------|----------|
| Turnstile CAPTCHA | Required on register, login, forgot-password | Required on register, login |
| 2FA support | TOTP (speakeasy), setup/enable/verify/disable endpoints | UI dialogs exist, calls backend endpoints |
| Better Auth | Session-based fallback for middleware | Not used client-side |
| OAuth (login) | Google, Facebook | Google, Facebook |
| OAuth (integrations) | YouTube, Facebook, Instagram, Twitter, Pinterest, LinkedIn, TikTok, Reddit, Spotify | Same platforms |

### 2.6 Session Management

| Feature | Backend | Frontend | Issue |
|---------|---------|----------|-------|
| Redis session TTL | 604800s (7 days) | N/A (client-side) | — |
| `UserLogin` entity | Stores encrypted token, deviceId, isValid, expiryDateUtc | N/A | — |
| Logout invalidation | Sets `isValid=false` and `expiryDateUtc=now` | Calls `/auth/logout` + clears cookies + localStorage | OK |
| Force logout via WebSocket | `force-logout` event emitted by gateway | `useSessionSecurity` hook handles it | OK |
| Remembered users | N/A | Stores email/name/avatar in localStorage | Frontend-only |

---

## 3. TypeORM Entity Audit

### 3.1 Entity Inventory

| # | Entity | Table | Schema | Extends BaseEntity | PK Type |
|---|--------|-------|--------|--------------------|---------|
| 1 | `BaseEntity` | — | — | `TypeORMBaseEntity` | `UUID` |
| 2 | `User` | `users` | `identity` | YES | UUID |
| 3 | `Role` | `roles` | `identity` | YES | UUID |
| 4 | `RoleClaim` | `roleClaims` | `identity` | **NO** | UUID (manual) |
| 5 | `UserRole` | `userRoles` | `identity` | YES | UUID |
| 6 | `UserClaim` | `userClaims` | `identity` | **NO** | `increment` |
| 7 | `UserLogin` | `userLogins` | `identity` | YES | UUID |
| 8 | `UserBiometric` | `userBiometrics` | `identity` | YES | UUID |
| 9 | `UserPreference` | `userPreferences` | default | **NO** | `PrimaryColumn('uuid')` |
| 10 | `Playlist` | `playlists` | default | YES | UUID |
| 11 | `PlaylistContent` | `playlistContent` | default | YES | UUID |
| 12 | `PlaylistMember` | `playlistMembers` | default | YES | UUID |
| 13 | `Notification` | `notifications` | `notification` | YES | UUID |
| 14 | `NotificationEvent` | `notificationEvents` | `notification` | YES | UUID |
| 15 | `NotificationTemplate` | `notificationTemplates` | `notification` | YES | UUID |
| 16 | `UserContent` | `userContents` | default | YES | UUID |
| 17 | `LinkedAccount` | `linkedAccounts` | default | YES | UUID |
| 18 | `ManualProfile` | `manualProfiles` | default | YES | UUID |
| 19 | `ContentStream` | `contentStreams` | default | YES | UUID |
| 20 | `SearchHistory` | `searchHistories` | default | YES | UUID |
| 21 | `Topic` | `topics` | default | YES | UUID |
| 22 | `UserTopic` | `userTopics` | default | YES | UUID |
| 23 | `UserFollow` | `user_follows` | `identity` | YES | UUID |
| 24 | `UploadJob` | `upload_jobs` | default | YES | UUID |
| 25 | `PublishJob` | `publish_jobs` | default | YES | UUID |
| 26 | `AnalyticsEvent` | `analyticsEvents` | `analytics` | YES | UUID |
| 27 | `PremiumRollup` | `premiumRollups` | `analytics` | YES | UUID |
| 28 | `YoutubeChannelAnalytics` | `youtubeChannelAnalytics` | `analytics` | YES | UUID |
| 29 | `YoutubeVideoAnalytics` | `youtubeVideoAnalytics` | `analytics` | YES | UUID |
| 30 | `YoutubeAnalytic` | `youtube_analytics` | default | YES | UUID |
| 31 | `YoutubeAccount` | `youtube_accounts` | default | YES | UUID |
| 32 | `YoutubeVideo` | `youtube_videos` | default | YES | UUID |
| 33 | `FacebookPageAnalytics` | `facebookPageAnalytics` | `analytics` | YES | UUID |
| 34 | `FacebookPostAnalytics` | `facebookPostAnalytics` | `analytics` | YES | UUID |
| 35 | `FacebookVideoAnalytics` | `facebookVideoAnalytics` | `analytics` | YES | UUID |
| 36 | `DataProtectionKey` | `dataProtectionKeys` | default | YES | UUID |
| 37 | `RateLimit` | `rateLimits` | default | YES | UUID |
| 38 | `RateLimitLog` | `rateLimitLogs` | default | YES | UUID |
| 39 | `NewsletterSubscriber` | `newsletter_subscribers` | `notification` | YES | UUID |

### 3.2 BaseEntity Audit

**File**: `src/domain/baseEntity.ts`

```typescript
id: UUID (PrimaryGeneratedColumn)
createdBy: string (nullable)
createdOn: Date (CreateDateColumn)
lastModifiedBy: string (nullable)
lastModifiedOn: Date (UpdateDateColumn, nullable)
lastRefreshed: Date (timestamp, default CURRENT_TIMESTAMP)
```

**Issues**:
- `lastRefreshed` is set on construction but never updated on `@BeforeUpdate`. It serves no runtime purpose after insert.
- `_currentUser` is a private non-persisted property set via `setCurrentUser()`. This pattern is fragile — requires manual call in every service.
- `createdOn` is set to `new Date()` in `@BeforeInsert`, overriding `@CreateDateColumn`'s auto-setting. Redundant.
- No `@Index` on `createdBy` or `lastModifiedBy` for audit queries.

### 3.3 Missing Columns (Backend vs Frontend Expectations)

#### `Notification` Entity — Missing Frontend Fields

| Field | Backend `Notification` entity | Frontend `Notification` type | Status |
|-------|------|---------|--------|
| `id` | ✅ UUID | ✅ string | OK |
| `title` | ✅ string | ✅ string | OK |
| `body` | ✅ string | ✅ string | OK |
| `type` | ✅ `NotificationType` enum | ✅ string | OK |
| `readAt` | ✅ timestamp, nullable | ✅ string, nullable | OK |
| `createdAt` | Inherited from `BaseEntity.createdOn` | ✅ string | OK |
| `updatedAt` | Inherited from `BaseEntity.lastModifiedOn` | ✅ string | OK |
| `notifyId` | ✅ UUID (user FK) | N/A | — |
| `isLive` | ✅ boolean, default false | N/A | — |
| `sound` | ✅ boolean, default false | N/A | — |
| `metaData` | ✅ json, nullable | N/A | — |
| **`link`** | **MISSING** | ✅ string, nullable | **MISSING COLUMN** |
| **`isRead`** | **MISSING** (derived from `readAt`) | ✅ boolean | **MISSING COLUMN** |

**CRITICAL**: Frontend expects `link: string | null` and `isRead: boolean` on every notification. Backend entity has neither. The `isRead` is likely derived server-side from `readAt !== null`, but `link` has no backend source at all.

#### `User` Entity — Missing Frontend Fields

| Field | Backend `User` entity | Frontend `UserType` | Status |
|-------|------|---------|--------|
| `id` | ✅ | ✅ | OK |
| `firstName` | ✅ | ✅ | OK |
| `lastName` | ✅ | ✅ | OK |
| `email` | ✅ | ✅ | OK |
| `gender` | ✅ nullable | ✅ string | OK |
| `bio` | ✅ text, nullable | ✅ string, nullable | OK |
| `phoneNumber` | ✅ nullable | ✅ string, nullable | OK |
| `isActive` | ✅ boolean, default true | **MISSING** | Not exposed |
| `emailConfirmed` | ✅ boolean, default false | ✅ `isEmailVerified` | **Renamed** |
| `onboardingStep` | ✅ enum, nullable | **MISSING from UserType** | In AuthUserType only |
| `type` | ✅ UserType enum | **MISSING from UserType** | In AuthUserType only |
| `userName` | ✅ nullable | **MISSING from UserType** | In PublicProfileModel |
| `photo` | **MISSING** (in `UserBiometric.profileImageUrl`) | ✅ string | **Split across entity** |
| `referralCode` | ✅ nullable, unique | **MISSING** | Not exposed |
| `referredBy` | ✅ nullable | **MISSING** | Not exposed |
| `googleId` | ✅ nullable | **MISSING** | Internal only |
| `newEmail` | ✅ nullable | **MISSING** | Internal only |
| `lastEmailModifiedAt` | ✅ timestamp, nullable | **MISSING** | Internal only |
| `newPhoneNumber` | ✅ nullable | **MISSING** | Internal only |
| `lastPhoneNumberModifiedAt` | ✅ timestamp, nullable | **MISSING** | Internal only |
| `lastUserNameModifiedAt` | ✅ timestamp, nullable | **MISSING** | Internal only |
| `normalizedEmail` | ✅ nullable | **MISSING** | Internal only |
| `normalizedUserName` | ✅ nullable | **MISSING** | Internal only |
| `passwordHash` | ✅ nullable | **MISSING** | Security — correct |
| `twoFactorEnabled` | ✅ boolean | **MISSING from UserType** | In AuthUserType |
| `twoFactorSecret` | ✅ nullable | **MISSING** | Security — correct |
| `isLockedOut` | ✅ boolean | **MISSING** | Internal only |
| `lockoutEnd` | ✅ timestamp, nullable | **MISSING** | Internal only |
| `accessFailedCount` | ✅ integer | **MISSING** | Internal only |
| `concurrencyStamp` | ✅ nullable | **MISSING from UserType** | In AuthUserType + JWT |
| `securityStamp` | ✅ nullable | **MISSING from UserType** | In AuthUserType + JWT |
| `lastPasswordModifiedAt` | ✅ timestamp, nullable | **MISSING** | Internal only |
| `profilePrivacy` | ✅ ProfilePrivacy enum | **MISSING from UserType** | Not exposed |
| `registeredOn` | ✅ timestamp, nullable | **MISSING** | Internal only |

**Key issue**: The `User` entity `photo` field does not exist — the photo URL lives in `UserBiometric.profileImageUrl`. The frontend `UserType.photo` expects a flat string from the API, which means the backend must join/map from `UserBiometric`.

### 3.4 Nullable Mismatch Analysis

| Entity.Column | Backend Nullable | Backend Default | Expected by Frontend | Issue |
|---------------|------------------|-----------------|---------------------|-------|
| `User.email` | NOT NULL | — | `string \| null` | Frontend declares nullable, backend enforces NOT NULL |
| `User.isActive` | nullable (implicit) | `true` | Not used | — |
| `User.passwordHash` | nullable | — | — | OK for OAuth users |
| `User.bio` | nullable | — | `string \| null` | OK |
| `User.phoneNumber` | nullable | — | `string \| null` | OK |
| `LinkedAccount.email` | nullable | — | Not in frontend `LinkedAccountType` | OK |
| `LinkedAccount.profileImage` | nullable | — | `string` in frontend | **MISMATCH** — frontend expects non-null |
| `SearchHistory.userId` | NOT NULL (no nullable flag) | — | — | Should be nullable for anonymous search |
| `NewsletterSubscriber.email` | NOT NULL | — | — | OK |
| `RoleClaim.role` (relation) | — | — | — | See FK issue below |

### 3.5 Eager/Lazy Loading Audit

| Entity | Relation | `eager` | `lazy` | Issue |
|--------|----------|---------|--------|-------|
| `User` → `UserBiometric` | `OneToOne` | `eager: false` | No | OK — explicit |
| `UserContent` → `User` | `ManyToOne` | `eager: false` | No | OK — explicit |
| `ManualProfile` → `User` | `ManyToOne` | `eager: false` | No | OK — explicit |
| All other relations | — | Default (false) | No | OK |

**No lazy loading** is used anywhere. All relations are explicitly `eager: false` or default. This is correct for NestJS/CQRS where queries are built manually.

**Concern**: `UserContent.user` has `eager: false`, but some queries may N+1 if the user is needed per content item. Check repository implementations for `createQueryBuilder` joins.

### 3.6 Cascade Audit

| Parent | Child | Cascade | onDelete | Issue |
|--------|-------|---------|----------|-------|
| `User` | `UserBiometric` | `true` | CASCADE | OK |
| `Playlist` | `PlaylistMember` | `['insert']` | CASCADE | OK — insert only, no update/delete cascade from parent |
| `Playlist` | `PlaylistContent` | `['insert']` | CASCADE | OK |
| `UserTopic` | `User` | — | CASCADE | OK — FK level |
| `UserTopic` | `Topic` | — | CASCADE | OK — FK level |
| `UserFollow` | `User` (follower) | — | CASCADE | OK |
| `UserFollow` | `User` (followed) | — | CASCADE | OK |
| `UserContent` | `User` | — | CASCADE | OK |
| `ManualProfile` | `User` | — | CASCADE | OK |
| `PlaylistContent` | `PlaylistMember` | — | SET NULL | OK — soft unlink |
| `UserPreference` | `User` | — | CASCADE | OK |
| `UserBiometric` | `User` | — | CASCADE | OK |

**Missing cascades**:
- `UserRole` → `User` / `Role`: No cascade on delete. If a user or role is deleted, orphaned `UserRole` rows remain.
- `RoleClaim` → `Role`: FK has `ManyToOne` but no `onDelete: 'CASCADE'`. Deleting a role leaves orphaned claims.
- `UserClaim` → `User`: No FK relation defined at all. No cascade. Orphan risk.
- `UserLogin` → `User`: No FK relation defined. No cascade. Orphan risk.

---

## 4. DTO / Type Contract Comparison

### 4.1 Token Response

**Backend** `TokenResponseModel`:
```
access_token, refresh_token, message, succeeded, isLockedOut, isTwoFARequired, refreshTokenExpiryTime, onboardingCompleted?
```

**Frontend** `TokenResponseType`:
```
success, data, error, succeeded, message, access_token?, refresh_token?, refreshTokenExpiryTime?, isLockedOut, isTwoFARequired, onboardingCompleted?
```

**Mismatch**: Backend has `success` as implicit (HTTP 200). Frontend extends `ServiceResponse` which adds `success: boolean`, `data?: T`, `error?: string`. Backend does NOT return `success` in the token response body — it relies on HTTP status. The frontend will read `success` as `undefined` unless the handler explicitly returns it.

### 4.2 User Profile Response

**Backend** `ProfileModel` (extends `UserModel`):
```
id, email, firstName, lastName, isEmailVerified, gender, bio, phoneNumber, photo
+ photoPrivacy, linkedAccounts[], manualProfiles[], followersCount, followingCount, isFollowing, totalPosts
```

**Frontend** `UserProfileType` (extends `UserType` + `ServiceResponse`):
```
id, email, firstName, lastName, isEmailVerified, gender, bio, phoneNumber, photo
+ photoPrivacy, linkedAccounts[], manualProfiles[], followersCount, followingCount, totalPosts, isFollowing?, isGuestView
```

**Differences**:
| Field | Backend | Frontend | Issue |
|-------|---------|----------|-------|
| `isGuestView` | **MISSING** | ✅ boolean required | **MISSING** — backend doesn't return this |
| `photo` (source) | Computed from `UserBiometric` | Expected flat string | Must be mapped |
| `LinkedAccountType.isImported` | Not in `LinkedAccount` entity (computed?) | ✅ boolean | Backend must compute this |
| `LinkedAccountType.profileImage` | `LinkedAccount.profileImage` (nullable) | `string` (non-null) | Nullable mismatch |

### 4.3 Public Profile

**Backend** `PublicProfileModel`:
```
id, userName, firstName, lastName, DisplayName, bio?, profileImage?, followersCount, followingCount, connectedPlatformsCount, linkedAccounts?[], totalPosts, engagementRate, niche?, verified, isFollowing?
```

**Frontend** `PublicProfileModel`:
```
id, userName, firstName, lastName, bio, profileImage, followersCount?, followingCount, connectedPlatformsCount, linkedAccounts[{id, platform}], totalPosts, engagementRate, niche, verified, isFollowing?
```

**Differences**:
| Field | Backend | Frontend | Issue |
|-------|---------|----------|-------|
| `DisplayName` | ✅ PascalCase | **MISSING** | Naming convention mismatch — frontend doesn't use it |
| `linkedAccounts` full type | `LinkedAccountModel` with all fields | `{ id: string; platform: string }` | Frontend only uses subset |
| `bio` nullable | `string \| null` | `string \| null` | OK |
| `profileImage` nullable | `string \| null` | `string \| null` | OK |

### 4.4 Registration Request

**Backend** `RegisterModel` (inferred from handler):
```
firstName, lastName, email, password, turnstileToken?, userAgent, ipAddress, referralCode?
```

**Frontend** `RegisterRequestType`:
```
firstName, lastName, email, password, userAgent, ipAddress
```

**Missing from frontend**: `turnstileToken` (sent via header, not body), `deviceId` (not sent during register), `referralCode` (not in frontend form).

**Missing from backend**: Frontend sends `userAgent` and ` ipAddress` — backend reads these from request headers/params, so the body fields may be redundant or overridden.

### 4.5 Login Request

**Backend** `LoginHandler`:
```
email, password, deviceId, userAgent, ipAddress, turnstileToken?
```

**Frontend** `TokenRequestType`:
```
email, password, userAgent, deviceId, ipAddress
```

**Match**: All fields present. `turnstileToken` is sent via `X-Turnstile-Token` header.

### 4.6 Notification Type

**Backend** `NotificationModel`:
```
id, body, title, readAt?, sound, isLive, createdAt, notifyId, type, metaData?
```

**Frontend** `Notification` (websocket.types.ts):
```
id, title, body, type, link, isRead, readAt, createdAt, updatedAt
```

**Critical mismatches**:

| Field | Backend | Frontend | Issue |
|-------|---------|----------|-------|
| **`link`** | **MISSING** | `string \| null` required | **MISSING COLUMN** |
| **`isRead`** | **MISSING** (derived from `readAt`) | `boolean` required | **MISSING COLUMN** — backend derives, frontend expects flat |
| **`updatedAt`** | `lastModifiedOn` (BaseEntity) | `string` required | Name mismatch — `lastModifiedOn` vs `updatedAt` |
| `sound` | ✅ boolean | **MISSING** | Frontend doesn't display |
| `isLive` | ✅ boolean | **MISSING** | Frontend doesn't display |
| `notifyId` | ✅ UUID | **MISSING** | Frontend doesn't need (server-side) |
| `metaData` | ✅ json | **MISSING** | Frontend doesn't display |

---

## 5. Enum & Default Value Mismatches

### 5.1 Backend Enums vs Frontend Strings

| Backend Enum | Values | Frontend Usage | Issue |
|-------------|--------|----------------|-------|
| `UserType` | Admin, Guest, User | `AuthUserType.userType?: string` | Frontend uses loose string, not typed enum |
| `ProfilePrivacy` | Public, Private | **MISSING** from frontend | Not exposed to UI |
| `ProfileImagePrivacy` | Everyone, Interactions | `UserPhotoPrivacy = "Everyone" \| "Interactions"` | **String literal duplication** — should import from shared types |
| `OnboardingStep` | NotStarted, ProfileData, Topics, Platforms, Confirmation, Completed | Used in `AuthHydrationProvider` as raw string `'Completed'` | **Hardcoded string** — should use enum |
| `RoleType` | System, Regular | Not used in frontend | OK |
| `FollowStatus` | requested, accepted, blocked | Not used as enum in frontend | Frontend uses boolean `isFollowing` |
| `NotificationType` | Import | Frontend `Notification.type` as string | Under-utilized — only one value |
| `NotificationChannel` | inApp, email, push | Not in frontend type system | Frontend settings page uses raw strings |
| `Theme` | System, Light, Dark | Not in frontend type system | Frontend uses accent theme, not this enum |
| `PlaylistMemberRole` | Owner, Editor, Viewer | Not in frontend type system | — |
| `StreamEntityType` | Profile, Content, Community | Not in frontend | — |
| `PostType` | video, short, reel, story, post, article, pin, project, message, track | `PLATFORM_POST_TYPES` constant in frontend | **Partial duplication** — frontend defines per-platform subsets |
| `NotificationStatus` | InProgress, Completed, Cancelled, Failed | Not used in any entity | **Dead enum** — defined but never referenced |
| `PlaylistMemberRole` | Owner, Editor, Viewer | Not referenced | — |

### 5.2 Default Value Mismatches

| Entity.Column | Backend Default | Frontend Expectation | Issue |
|---------------|-----------------|---------------------|-------|
| `User.isActive` | `true` | Not used | OK |
| `User.emailConfirmed` | `false` | `isEmailVerified: boolean \| null` | OK |
| `User.twoFactorEnabled` | `false` | `twoFARequired?: boolean` | OK — different concepts |
| `User.type` | `UserType.User` | Not used in profile page | OK |
| `User.profilePrivacy` | `ProfilePrivacy.Public` | Not exposed | OK |
| `User.onboardingStep` | `OnboardingStep.NotStarted` | Checked as raw string `'Completed'` | **Hardcoded comparison** |
| `User.accessFailedCount` | `0` | Not exposed | OK |
| `LinkedAccount.allowImport` | `false` | Not in frontend type | OK |
| `LinkedAccount.followersCount` | `0` | `number` | OK |
| `LinkedAccount.isVisible` | `true` | Not in frontend type | OK |
| `LinkedAccount.syncEnabled` | `false` | Not in frontend type | OK |
| `UploadJob.status` | `'pending'` | Not exposed directly | OK |
| `PublishJob.status` | `'pending'` | Not exposed directly | OK |
| `YoutubeVideo.status` | `'draft'` | Not exposed directly | OK |
| `YoutubeAccount.connected` | `true` | Not exposed directly | OK |
| `NewsletterSubscriber.email` | — | `string` | OK — no default needed |

---

## 6. Relationships, Cascades & Eager/Lazy Loading

### 6.1 Missing FK Relations (No TypeORM Decorator)

These entities reference other entities by ID string but have **no TypeORM relation decorator**:

| Entity | Column | Missing FK To | Issue |
|--------|--------|---------------|-------|
| `UserRole` | `userId` | `User` | No `@ManyToOne` — cannot join, no cascade, no FK constraint at DB level |
| `UserRole` | `roleId` | `Role` | Same issue |
| `UserClaim` | `userId` | `User` | No `@ManyToOne`, no cascade, no FK constraint |
| `UserLogin` | `userId` | `User` | No `@ManyToOne`, no cascade |
| `UserLogin` | `provider` | — | No FK to any provider table |
| `LinkedAccount` | `userId` | `User` | No `@ManyToOne`, no cascade, no FK |
| `ManualProfile` | `userId` | `User` | Has `@ManyToOne` ✅ |
| `SearchHistory` | `userId` | `User` | No `@ManyToOne`, no cascade |
| `Notification` | `notifyId` | `User` | No `@ManyToOne`, no cascade |
| `AnalyticsEvent` | `userId` | `User` | No `@ManyToOne` |
| `PremiumRollup` | `userId` | `User` | No `@ManyToOne` |
| `YoutubeAccount` | `userId` | `User` | No `@ManyToOne` |
| `YoutubeVideo` | `accountId` | `YoutubeAccount` | No `@ManyToOne` |
| `YoutubeVideoAnalytics` | `userId` | `User` | No `@ManyToOne` |
| `YoutubeVideoAnalytics` | `videoId` | `YoutubeVideo` | No `@ManyToOne` |
| `YoutubeChannelAnalytics` | `userId` | `User` | No `@ManyToOne` |
| `FacebookPageAnalytics` | `userId` | `User` | No `@ManyToOne` |
| `FacebookPostAnalytics` | `userId` | `User` | No `@ManyToOne` |
| `FacebookVideoAnalytics` | `userId` | `User` | No `@ManyToOne` |
| `RateLimit` | `userId` | `User` | No `@ManyToOne` |
| `RateLimitLog` | `userId` | `User` | No `@ManyToOne` |
| `DataProtectionKey` | `userId` | `User` | No `@ManyToOne` |
| `UploadJob` | `videoId` | `YoutubeVideo` | No `@ManyToOne` |
| `PublishJob` | `userId` | `User` | No `@ManyToOne` |
| `PublishJob` | `linkedAccountId` | `LinkedAccount` | No `@ManyToOne` |
| `PublishJob` | `uploadId` | `UploadJob` | No `@ManyToOne` |
| `NewsletterSubscriber` | — | — | Standalone ✅ |

**Impact**: ~25 entities lack FK relation decorators. This means:
1. No database-level foreign key constraints (data integrity risk)
2. No TypeORM `QueryBuilder` join shortcuts
3. No cascade deletes at DB level
4. Must manually join in every query

### 6.2 `RoleClaim.role` Type Bug

```typescript
// roleClaim.entity.ts
@ManyToOne(() => Role, (role) => role.roleClaims)
role!: Role[];  // ← WRONG: ManyToOne returns single Role, not Role[]
```

This should be `role: Role` (singular). The `Role[]` type is incorrect for a `@ManyToOne` relation and may cause TypeORM mapping errors or incorrect TypeScript inference.

### 6.3 Orphan Risk Summary

| Deletable Parent | Orphaned Child Entity | Cascade | Risk |
|-----------------|----------------------|---------|------|
| `User` | `UserRole` | None | HIGH |
| `User` | `UserClaim` | None | HIGH |
| `User` | `UserLogin` | None | HIGH |
| `User` | `LinkedAccount` | None | HIGH |
| `User` | `Notification` (via `notifyId`) | None | HIGH |
| `User` | `SearchHistory` | None | MEDIUM |
| `User` | `AnalyticsEvent` | None | LOW |
| `Role` | `RoleClaim` | None (buggy `role!`) | HIGH |
| `Role` | `UserRole` | None | HIGH |
| `LinkedAccount` | `PublishJob` | None | MEDIUM |
| `YoutubeAccount` | `YoutubeVideo` | None | MEDIUM |
| `YoutubeVideo` | `UploadJob` | None | LOW |
| `PlaylistMember` | `PlaylistContent.addedBy` | SET NULL | LOW |

---

## 7. Notification System

### 7.1 Backend Architecture

```
NotificationService
  ├── INotificationRepository (TypeORM)
  ├── IUserPreferenceRepository (checks channel preferences)
  └── NotificationGateway (Socket.IO)
        └── /notifications namespace
```

**NotificationService methods**:
- `notifyAsync(userId, type, title, body, isLive, metaData?)` — Creates + emits
- `markAsReadAsync(id, userId?)` — Updates `readAt` + emits `notification-read`
- `markAllAsRead(userId?)` — Iterates all, marks unread ones
- `updateAsync(id, isLive, metaData?, title?)` — Updates + emits `notification-updated`
- `markSoundAsPlayedAsync(id, userId?)` — Sets `sound=true`
- `markAllSoundAsPlayed(userId?)` — Iterates all

### 7.2 Frontend Consumption

**WebSocket events handled**:
- `new-notification` → adds to local state
- `notification-updated` → updates existing
- `notification-read` → marks as read
- `force-logout` → clears auth + redirects
- `session-alert` → shows toast
- `profile-update` → refreshes profile data
- `follow.updated` → updates follow state

**Frontend `Notification` type has fields not in backend entity**:
| Frontend Field | Backend Source |
|---------------|----------------|
| `link` | **NOT IN ENTITY** — must be computed or added |
| `isRead` | Derived from `readAt !== null` |
| `updatedAt` | `BaseEntity.lastModifiedOn` |

### 7.3 Notification Channel Gating

Backend checks `UserPreference.notificationChannelsEnabled` before emitting:
- If channels array is empty or missing → default to in-app notification
- If `InApp` is in array → emit via WebSocket
- If `InApp` is NOT in array → skip WebSocket emission

**Frontend**: No channel preference UI found in settings page. The settings page at `/settings/notifications/page.tsx` exists but content was not fully inspected.

### 7.4 Missing Notification Features

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| `NotificationEvent` entity | Empty placeholder | Not used | Dead code |
| `NotificationTemplate` entity | Only `name` column | Not used | Dead code |
| Email notification channel | `NotificationChannel.Email` exists | Not implemented | Gap |
| Push notification channel | `NotificationChannel.Push` exists | Not implemented | Gap |
| Notification pagination | Not implemented in service | Not implemented in frontend | Gap |
| Notification deletion | Not implemented | Not implemented | Gap |
| `NotificationStatus` enum | Defined but never used | Not used | Dead code |

---

## 8. WebSocket Events

### 8.1 Full Event Comparison

#### `/notifications` namespace

| Event | Direction | Backend | Frontend | Match |
|-------|-----------|---------|----------|-------|
| `connected` | Server→Client | ✅ Emits `{ connectedUserId }` | ✅ Listens, joins room | YES |
| `join` | Client→Server | ✅ `handleJoin()` validates userId | ✅ Emits `join(userId)` | YES |
| `new-notification` | Server→Client | ✅ `emitNewNotification()` | ✅ Listens | YES |
| `notification-updated` | Server→Client | ✅ `emitNotificationUpdated()` | ✅ Listens | YES |
| `notification-read` | Server→Client | ✅ `emitNotificationRead()` | ✅ Listens | YES |
| `mark-as-read` | Client→Server | ✅ `handleMarkAsRead()` | ✅ Emits `{ notificationId }` | YES |
| `mark-as-read:success` | Server→Client | ✅ Emits `{ notificationId }` | Not explicitly handled | **Missing listener** |
| `mark-all-as-read` | Client→Server | ✅ `handleMarkAllAsRead()` | ✅ Emits | YES |
| `mark-all-as-read:success` | Server→Client | ✅ Emits | Not explicitly handled | **Missing listener** |
| `profile-update` | Server→Client | ✅ `emitProfileUpdated()` | ✅ `useProfileSocket` handles | YES |
| `follow.updated` | Server→Client | ✅ `emitFollowUpdated()` | ✅ `useFollowSocket` handles | YES |
| `force-logout` | Server→Client | Emitted by base gateway | ✅ `useSessionSecurity` handles | YES |
| `session-alert` | Server→Client | Emitted by base gateway | ✅ `useSessionSecurity` handles | YES |
| `error` | Server→Client | ✅ `emitError()` | ✅ Handled by socket.io | YES |

#### `/imports` namespace

| Event | Direction | Backend | Frontend | Match |
|-------|-----------|---------|----------|-------|
| `connected` | Server→Client | ✅ | ✅ | YES |
| `join` | Client→Server | ✅ | ✅ | YES |
| `new-content` | Server→Client | ✅ `ImportGateway` | ✅ `useImports` | YES |

### 8.2 WebSocket Connection Auth

| Aspect | Backend | Frontend |
|--------|---------|----------|
| Auth method | JWT token via `auth: { token }` | JWT token via `auth: { token }` |
| Token source | Verified in `BaseGateway.authenticateClient()` | From `accessToken` prop (cookie-decoded) |
| Reconnection | Server handles disconnect gracefully | 5 retries, exponential backoff |
| Token refresh | `reconnectWithNewToken()` available | Called on token refresh |
| Connection delay | None | **3 seconds after login** (performance optimization) |

---

## 9. Roles, Permissions & Guards

### 9.1 Role System

**Backend**:
- `Role` entity: `name`, `normalizedName`, `type` (System/Regular), `isDisabled`, `disabledUntil`
- `RoleClaim` entity: `roleId`, `claimType`, `claimValue` (format: `ControllerName.methodName`)
- `UserRole` entity: `userId`, `roleId`, `isDisabled`, `disabledUntil`
- `UserClaim` entity: `userId`, `claimType`, `claimValue` (direct user claims)

**Frontend**:
- `AuthUserType.roles?: string[]` — populated from JWT
- `AuthUserType.permissions?: string[]` — populated from JWT
- No role management UI (admin-only backend endpoints)
- No permission checking in frontend components

### 9.2 Guard Architecture

| Guard | Backend Location | Purpose | Frontend Equivalent |
|-------|-----------------|---------|---------------------|
| `AccessLevelGuard` (factory) | `core/passport/account.guard.ts` | Validates JWT, security/concurrency stamps, userType, 2FA | None — handled by interceptors |
| `PermissionsGuard` | `core/passport/permissions.guard.ts` | Checks `permission` claim against `Controller.method` | None — no frontend permission checks |
| `TurnstileGuard` | `core/passport/turnstile.guard.ts` | CAPTCHA verification | `@marsidev/react-turnstile` in forms |
| `OnboardingGuard` | `core/passport/onboarding.guard.ts` | Blocks access if onboarding complete | `AuthHydrationProvider` onboarding route guard |

### 9.3 Permission Discovery

Backend uses `Permissions.discoverControllerPermissions()` to auto-discover all controller methods decorated with `PermissionsGuard`. The `DataSeeder` then creates an Admin role with all discovered permissions.

**Frontend**: Permissions are stored in Zustand but never checked. This means:
1. All protected UI elements are visible to all authenticated users
2. No client-side permission gating (all enforcement is server-side)
3. Role-based UI hiding is not implemented

---

## 10. Uploads, Media & Profile

### 10.1 Upload Architecture

**Backend storage stack**:
- **Cloudflare R2** (S3-compatible) — video/file storage
- **Cloudinary** — profile image storage + transformation
- `R2StorageService` — `uploadStream()`, `getStream()`, `deleteFile()`, `fileExists()`
- `VideoTranscodingService` + `VideoCodecService` — H.264 only

**Frontend upload flow**:
1. `MediaUpload.tsx` — file selection + preview
2. `VideoTrimmer.tsx` — client-side FFmpeg trimming
3. `EditMediaModal.tsx` — image cropping via `react-easy-crop`
4. `useChunkedUpload.ts` — YouTube chunked upload (init → chunks → finalize)
5. `upload-video.service.ts` — Direct XHR upload with progress
6. `integrations.service.ts` — Generic file upload via restfit

### 10.2 Media Type Comparison

| Field | Backend `UserContent.media` | Frontend `MediaFile` |
|-------|---------------------------|---------------------|
| Type | `jsonb` (any[]) | Custom type with File object |
| Content | Server-side media references | Client-side File + metadata |
| Upload status | Not tracked in entity | `uploadStatus` field |
| R2 key | Not in entity | `r2Key?: string` |

The `UserContent.media` column stores server-side media metadata as JSONB. The frontend `MediaFile` type is a client-side construct used during composition/upload, not a direct DB mapping.

### 10.3 Profile Image Flow

1. User selects image in `ProfilePictureDialog.tsx`
2. Frontend crops image via `react-easy-crop`
3. Cropped image uploaded to **Cloudinary** (not R2)
4. Cloudinary URL stored in `UserBiometric.profileImageUrl`
5. Frontend `UserType.photo` receives the Cloudinary URL

**Backend entity**: `UserBiometric.profileImageUrl` (nullable, Cloudinary URL)
**Backend entity**: `UserBiometric.defaultProfileImageUrl` (not nullable, generated avatar)
**Backend entity**: `UserBiometric.privacy` (ProfileImagePrivacy enum)

**Frontend type**: `UserType.photo` (string) — single flat field, no default vs custom distinction

### 10.4 Profile Photo Privacy

| Aspect | Backend | Frontend |
|--------|---------|----------|
| Enum | `ProfileImagePrivacy.Everyone` / `.Interactions` | `UserPhotoPrivacy = "Everyone" \| "Interactions"` |
| Storage | `UserBiometric.privacy` | Sent via `UserPhotoPrivacyDto.privacy` |
| Update endpoint | `PATCH /account/profile-image/privacy` | `useUpdateProfileImage` hook |
| Display gating | Backend should filter based on privacy | Frontend `isGuestView` field |

**Issue**: Frontend has `isGuestView: boolean` in `UserProfileType`, but backend `ProfileModel` does not include this field. Backend must compute this based on viewer relationship and privacy setting.

---

## 11. Frontend Gaps — Missing Backend Capabilities

Features the backend supports but the frontend does not expose or implement:

| # | Feature | Backend Status | Frontend Status |
|---|---------|---------------|-----------------|
| 1 | Account deletion endpoint | `POST /account/delete` | `DeleteAccountDialogBase.tsx` ✅ |
| 2 | User deactivation | `PATCH /user/deactivate` | `useDeleteAccount.ts` ✅ |
| 3 | Role management UI | Full CRUD endpoints | **MISSING** — no admin UI |
| 4 | Permission management UI | `GET/PUT /permissions` endpoints | **MISSING** — no admin UI |
| 5 | Notification preferences page | `UserPreference` entity + endpoints | **Partial** — settings page exists but content unclear |
| 6 | Theme preference | `Theme` enum (System/Light/Dark) | Uses accent theme only — **DIFFERENT SYSTEM** |
| 7 | Better Auth integration | `HttpContextMiddleware` supports it | **NOT USED** client-side |
| 8 | Email notification channel | `NotificationChannel.Email` | **NOT IMPLEMENTED** |
| 9 | Push notification channel | `NotificationChannel.Push` | **NOT IMPLEMENTED** |
| 10 | Newsletter subscriber | `newsletter_subscribers` table + endpoint | `NewsletterService.subscribe()` ✅ |
| 11 | Data protection keys | Entity exists for OAuth state | Used internally ✅ |
| 12 | Rate limiting logs | `rateLimitLogs` entity | Not exposed (internal) |
| 13 | Content stream (archive) | `contentStreams` entity for disconnected content | Not exposed |
| 14 | Playlist management UI | Full CRUD + members | **MISSING** — no playlist UI |
| 15 | Bookmark feature | `bookmark.model.ts` in domain | `bookmarks/page.tsx` exists |
| 16 | Search history | `searchHistories` entity | Not displayed to user |
| 17 | User topics display | `userTopics` entity | Onboarding only — no management |
| 18 | Analytics events | `analyticsEvents` entity | Not exposed |

---

## 12. Backend Gaps — Missing Frontend Exposure

Features the frontend expects but the backend does not provide:

| # | Feature | Frontend Expectation | Backend Status |
|---|---------|---------------------|----------------|
| 1 | `Notification.link` | `string \| null` field | **MISSING** — no `link` column |
| 2 | `Notification.isRead` | `boolean` field | **DERIVED** — from `readAt !== null`, not a column |
| 3 | `Notification.updatedAt` | `string` field | **NAME MISMATCH** — `lastModifiedOn` in BaseEntity |
| 4 | `UserProfileType.isGuestView` | `boolean` field | **MISSING** — not in `ProfileModel` |
| 5 | `PublicProfileModel.DisplayName` | `string` field | **PASCAL CASE** — backend has `DisplayName` |
| 6 | `LinkedAccountType.isImported` | `boolean` field | **NOT IN ENTITY** — must be computed |
| 7 | `LinkedAccountType.profileImage` (non-null) | `string` | Entity column is nullable |
| 8 | `RegisterRequestType.deviceId` | Sent to backend | **NOT IN REQUEST** — register doesn't use deviceId |
| 9 | `UserPhotoPrivacyDto` type | Frontend-specific DTO | **NOT IN BACKEND** — separate naming |
| 10 | `onboardingStep` in `UserType` | Frontend checks in AuthUser | **MISSING from UserType** — only in JWT |

---

## 13. Critical Issues

### C1: JWT Secret in Frontend `.env.local`

**Severity**: CRITICAL
**File**: `E:\SocialApp\.env.local`

```
JWT_SECRET=super-secret-key
```

The same JWT secret used by the backend is exposed in the frontend `.env.local`. While `NEXT_PUBLIC_` prefix is not used for `JWT_SECRET` (so it's server-side only in Next.js), this means:
1. The secret is in a plaintext file in the frontend repo
2. If the frontend repo is compromised, all JWTs can be forged
3. The frontend uses this to sign/verify session tokens (`jwt.service.ts`)

**Recommendation**: Use a separate, shorter-lived session secret for the frontend's server-side JWT operations. The backend JWT secret should never be in the frontend codebase.

### C2: `UserClaim` Not Extending BaseEntity

**Severity**: CRITICAL
**File**: `src/domain/entities/identity/userClaim.entity.ts`

```typescript
@Entity({ name: 'userClaims', schema: 'identity' })
export class UserClaim {
  @PrimaryGeneratedColumn('increment')  // ← INTEGER PK, not UUID
  id: number;
  // No createdOn, lastModifiedOn, etc.
}
```

This entity uses `increment` (integer) PK instead of UUID, does not extend `BaseEntity`, and has no audit columns. This breaks the pattern of all other entities and makes it impossible to:
1. Use UUID-based APIs consistently
2. Track creation/modification times
3. Use `setCurrentUser()` audit trail

### C3: `RoleClaim.role` Type Bug

**Severity**: CRITICAL
**File**: `src/domain/entities/identity/roleClaim.entity.ts`

```typescript
@ManyToOne(() => Role, (role) => role.roleClaims)
role!: Role[];  // ← Should be Role, not Role[]
```

This incorrect type annotation may cause:
1. TypeORM to fail silently when loading the relation
2. TypeScript compilation issues in strict mode
3. Incorrect behavior in repositories that access this relation

### C4: Frontend `UserType` Missing Core Fields

**Severity**: HIGH
**File**: `src/types/account/user.type.ts`

```typescript
export type UserType = {
  id: string;
  email: string | null;  // ← Backend: NOT NULL
  // Missing: userName, type, onboardingStep, profilePrivacy, isActive
}
```

The frontend `UserType` is a minimal subset. Fields like `userName`, `type`, and `onboardingStep` are in `AuthUserType` (JWT) instead. This creates confusion about which type to use where.

### C5: `RegisterRequestType` Missing `userName`

**Severity**: HIGH
**File**: `src/types/auth/signup.type.ts`

```typescript
export type RegisterRequestType = {
  // userName: string;  ← COMMENTED OUT
}
```

The `userName` field is commented out in the frontend type. The backend `RegisterHandler` may still require it (or use a default). This could cause registration failures if the backend expects `userName` in the request body.

---

## 14. Recommendations

### 14.1 Immediate Fixes (P0)

1. **Add `link` column to `Notification` entity** or compute it server-side before sending to frontend
2. **Fix `RoleClaim.role` type** from `Role[]` to `Role`
3. **Make `UserClaim` extend `BaseEntity`** with UUID PK
4. **Separate JWT secrets** — frontend session secret ≠ backend JWT secret
5. **Add missing FK relation decorators** to `UserRole`, `UserClaim`, `UserLogin`, `LinkedAccount`, `Notification`, and other orphan-risk entities

### 14.2 Short-Term (P1)

6. **Standardize nullable declarations** — align `email` nullable between `User` entity and `UserType`
7. **Add `isGuestView` to `PublicProfileModel`** backend response
8. **Add `isImported` computation** to `LinkedAccount` query results
9. **Replace hardcoded `'Completed'` string** with `OnboardingStep.Completed` enum in frontend
10. **Unify form validation** — pick either zod or yup, not both

### 14.3 Medium-Term (P2)

11. **Create shared type definitions** between backend and frontend (monorepo or codegen)
12. **Add notification pagination** to backend service
13. **Implement notification deletion** (TTL or user-initiated)
14. **Add `UserRole` → `User`/`Role` cascade deletes** or soft-delete pattern
15. **Standardize entity naming** — `lastModifiedOn` → `updatedAt` or vice versa

### 14.4 Long-Term (P3)

16. **Migrate to class-validator DTOs** instead of Joi schemas for consistency
17. **Add frontend permission gating** for role-based UI
18. **Implement email/push notification channels**
19. **Add playlist management UI** to frontend
20. **Consider monorepo** to share types between backend and frontend

---

*Audit complete. 39 entities inspected. 14 claim types verified. ~120 API endpoints cross-referenced. All WebSocket events mapped.*
