# 02 — Project B: Architecture Review v2

## Document Metadata

| Field | Value |
|-------|-------|
| **Version** | 2.0 |
| **Status** | Active Review |
| **Date** | 2026-07-19 |
| **Reviewer** | Automated Architecture Audit |
| **Backend** | `E:\gaddr-backend-api` (NestJS 11 + TypeORM 0.3.23 + PostgreSQL) |
| **Frontend** | `E:\SocialApp` (Next.js 16 + React 19 + Zustand + restfit) |

### Review History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-19 | Automated | Initial architecture audit — entity inventory, JWT comparison, frontend/backend gap analysis |
| 2.0 | 2026-07-19 | Automated | Expanded scope: full codebase exploration, correct entity count (38), 34 repositories, 14 auth handlers, 14 BullMQ processors, 45 migrations, 3 DB schemas, comprehensive endpoint inventory, security findings, ADR section |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Domain Architecture](#3-domain-architecture)
4. [Database Schema](#4-database-schema)
5. [Authentication Architecture](#5-authentication-architecture)
6. [Authorization](#6-authorization)
7. [API Layer](#7-api-layer)
8. [Message Queue & Background Processing](#8-message-queue--background-processing)
9. [Key Findings](#9-key-findings)
10. [Architectural Decision Records (ADR)](#10-architectural-decision-records-adr)
11. [Assumptions and Constraints](#11-assumptions-and-constraints)
12. [Open Questions](#12-open-questions)

---

## 1. Executive Summary

Project B (`gaddr-backend-api`) is a NestJS 11 monolithic API serving as the sole backend for the Gaddr social media management platform. It implements a vertical-slice CQRS architecture with DDD-inspired layering across 14 feature modules and 2 global modules.

### Readiness Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Architecture** | 7/10 | Strong CQRS/vertical-slice pattern; some inconsistency in module wiring (role feature bypasses index.ts) |
| **Security** | 3/10 | Real API keys in `.env.development`, weak JWT secret, 100+ `console.log` statements leaking sensitive data |
| **Data Integrity** | 4/10 | 25+ entities missing FK relation decorators; 2 critical type bugs; orphan risk on 12 parent-child relationships |
| **Code Quality** | 5/10 | Consistent patterns overall; dead code in `NotificationEvent`/`NotificationTemplate`; inverted 2FA logic |
| **Test Coverage** | 1/10 | Zero test files found in codebase |
| **Documentation** | 6/10 | READMEs per feature; v1 audit exists; no ADRs |
| **Overall** | **4.3/10** | Functional but requires immediate security and data integrity remediation |

### Key Metrics

| Metric | Count |
|--------|-------|
| TypeORM entities | 38 (+ 1 base) |
| Repositories | 34 |
| Feature modules | 13 (+ 2 Global: Notification, Queues) |
| Auth handlers | 14 (CQRS command/query handlers) |
| API endpoints | ~190+ distinct |
| WebSocket namespaces | 2 (`/notifications`, `/imports`) |
| BullMQ queues | 11 named queues |
| Background processors | 14 (11 import + 2 publishing + 1 upload) |
| DB schemas | 3 (`identity`, `notification`, `analytics`) + default |
| TypeORM migrations | 45 |
| JWT claim URIs | 14 |
| Platform integrations | 15 (YouTube, Facebook, Instagram, Twitter, Pinterest, LinkedIn, TikTok, Spotify, Reddit, Snapchat, Threads, Behance, GitHub, Discord, Twitch) |
| Enums | 15 |
| `console.log` statements | 100+ across production code |

---

## 2. Technology Stack

### Core Framework

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@nestjs/common` | ^11.0.1 | Core NestJS framework |
| `@nestjs/core` | ^11.0.1 | Core NestJS |
| `@nestjs/cqrs` | ^11.0.3 | CQRS pattern (CommandBus, QueryBus) |
| `@nestjs/platform-express` | ^11.0.1 | HTTP server (Express) |
| `@nestjs/websockets` | ^11.1.1 | WebSocket gateway support |
| `@nestjs/platform-socket.io` | ^11.1.1 | Socket.IO transport |
| `typescript` | ^5.7.3 | Language runtime |

### Data Layer

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@nestjs/typeorm` | ^11.0.0 | TypeORM integration |
| `typeorm` | ^0.3.23 | ORM |
| `pg` | ^8.22.0 | PostgreSQL driver |
| `redis` | ^4.7.1 | Redis client (sessions, caching) |

### Authentication & Security

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@nestjs/jwt` | ^11.0.0 | JWT signing/verification |
| `@nestjs/passport` | ^11.0.5 | Passport.js integration |
| `passport` | ^0.7.0 | Authentication framework |
| `passport-jwt` | ^4.0.1 | JWT strategy |
| `bcrypt` | ^6.0.0 | Password hashing |
| `better-auth` | ^1.6.23 | Session-based auth (cross-subdomain) |
| `speakeasy` | ^2.0.0 | TOTP 2FA |
| `qrcode` | ^1.5.4 | QR code generation for 2FA |

### Message Queue & Scheduling

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@nestjs/bullmq` | ^11.0.2 | BullMQ integration |
| `bullmq` | ^4.16.5 | Redis-backed job queue |
| `@nestjs/schedule` | ^6.0.0 | Cron/scheduled tasks |
| `@nestjs/event-emitter` | ^3.0.1 | In-process event bus |
| `@bull-board/api` | ^6.9.6 | Bull Board dashboard |
| `@bull-board/express` | ^6.9.6 | Bull Board Express adapter |

### External Services

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@aws-sdk/client-s3` | ^3.1075.0 | Cloudflare R2 (S3-compatible) |
| `cloudinary` | ^2.6.1 | Profile image storage |
| `@getbrevo/brevo` | ^3.0.1 | Brevo email service |
| `nodemailer` | ^7.0.3 | SMTP email |
| `axios` | ^1.9.0 | HTTP client for APIs |
| `geoip-lite` | ^1.4.10 | IP geolocation |

### Utilities

| Dependency | Version | Purpose |
|------------|---------|---------|
| `joi` | ^17.13.3 | Request validation |
| `handlebars` | ^4.7.8 | Email templating |
| `fuse.js` | ^7.1.0 | Fuzzy search |
| `slugify` | ^1.6.6 | URL slug generation |
| `nanoid` | ^5.1.5 | Short ID generation |
| `canvas` | ^3.1.0 | Image generation (avatars) |
| `xml2js` | ^0.6.2 | XML parsing (YouTube pubsub) |
| `winston` | ^3.17.0 | Logging |
| `winston-daily-rotate-file` | ^5.0.0 | Log rotation |

### Dev/Build

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@nestjs/cli` | ^11.0.0 | NestJS CLI |
| `@swc/core` | ^1.10.7 | Fast TypeScript compilation |
| `jest` | ^29.7.0 | Test runner |
| `ts-jest` | ^29.2.5 | Jest TypeScript transformer |
| `eslint` | ^9.16.0 | Linting |
| `prettier` | ^3.4.2 | Code formatting |
| `pm2` | ^6.0.8 | Process manager |

---

## 3. Domain Architecture

### 3.1 Architectural Pattern

The application follows a **Vertical-Slice CQRS** architecture with DDD-inspired layering:

```
src/
├── core/              ← Cross-cutting: guards, middlewares, utils, passport
├── domain/            ← Entities, enums, repository interfaces, services interfaces, mappers
├── features/          ← Vertical slices: each use case is a directory with endpoint + handler
├── infrastructure/    ← Repository implementations, services, processors, gateways, migrations
├── modules/           ← NestJS modules wiring everything together
└── shared/            ← Shared services (video transcoding)
```

### 3.2 Vertical Slice Convention

Each feature use case consists of:

| File Pattern | Purpose |
|-------------|---------|
| `*.endpoint.ts` | Controller — HTTP method, route, guards, swagger decorators |
| `*.handler.ts` | Command/Query handler — business logic, `@CommandHandler` or `@QueryHandler` |

Feature roots export via `addControllers()` and `addHandlers()` arrays consumed by modules.

### 3.3 Feature Modules (15 total)

| # | Module | File | Global | Description |
|---|--------|------|--------|-------------|
| 1 | `AppModule` | `src/modules/app.module.ts` | — | Root module, middleware registration, data seeder |
| 2 | `AuthModule` | `src/modules/auth.module.ts` | No | 14 auth handlers (login, register, refresh, logout, 2FA, OAuth, password) |
| 3 | `UserModule` | `src/modules/user.module.ts` | No | User CRUD, following, onboarding, settings, email/phone |
| 4 | `ProfileModule` | `src/modules/profile.module.ts` | No | Profile viewing, public profiles, manual profiles |
| 5 | `RoleModule` | `src/modules/role.module.ts` | No | RBAC: role CRUD, permissions management |
| 6 | `PlaylistModule` | `src/modules/playlist.module.ts` | No | Playlist CRUD, members, bookmarks |
| 7 | `IntegrationsModule` | `src/modules/integrations.module.ts` | No | 15 platform integrations, publishing, uploads |
| 8 | `FollowModule` | `src/modules/follow.module.ts` | No | Follow/unfollow, follower counts |
| 9 | `AnalyticsModule` | `src/modules/analytics.module.ts` | No | Weekly stats, analytics events |
| 10 | `DiscoverModule` | `src/modules/discover.module.ts` | No | Content discovery feed |
| 11 | `SearchModule` | (wired in user) | No | Cross-platform search |
| 12 | `NewsletterModule` | `src/modules/newsletter.module.ts` | No | Newsletter subscription |
| 13 | `EmailModule` | `src/modules/email.module.ts` | No | Email service (Brevo/SMTP) |
| 14 | `NotificationModule` | `src/modules/notification.module.ts` | **YES** | Notifications, WebSocket gateway |
| 15 | `QueuesModule` | `src/modules/queues.module.ts` | **YES** | BullMQ workers, Bull Board |

### 3.4 DDD Layers

| Layer | Location | Contents |
|-------|----------|----------|
| **Domain** | `src/domain/` | Entities, enums, base entity, repository interfaces (`IUserRepository`, etc.), service interfaces (`ITokenService`, etc.), mappers, contract models |
| **Infrastructure** | `src/infrastructure/` | Repository implementations, service implementations (token, email, analytics, OAuth, R2 storage, video transcoding), background processors/listeners, WebSocket gateways, migrations |
| **Application** | `src/features/` | CQRS command/query handlers (business logic), controllers (HTTP layer), request/response DTOs |
| **Core** | `src/core/` | Guards, middlewares, passport strategies, utility functions (crypto, IP, redis, winston, canvas, cloudinary), constants |
| **Modules** | `src/modules/` | NestJS module definitions wiring all layers together |

---

## 4. Database Schema

### 4.1 Schema Overview

| Schema | Tables | Purpose |
|--------|--------|---------|
| `identity` | 8 | User accounts, roles, permissions, follows, preferences, biometrics |
| `notification` | 4 | Notifications, events, templates, newsletter subscribers |
| `analytics` | 8 | Platform analytics (YouTube, Facebook), premium rollups, events |
| `public` (default) | 18 | Content, playlists, linked accounts, topics, jobs, rate limits, etc. |

### 4.2 Entity Inventory — `identity` Schema (8 tables)

| # | Entity | Table | File | PK | Extends BaseEntity | Notes |
|---|--------|-------|------|----|--------------------|-------|
| 1 | `User` | `users` | `src/domain/entities/identity/user.entity.ts` | UUID | YES | Core user; 25+ columns, OneToOne→Biometric, OneToMany→Playlists/Follows/Topics |
| 2 | `Role` | `roles` | `src/domain/entities/identity/role.entity.ts` | UUID | YES | RBAC role; OneToMany→RoleClaims |
| 3 | `RoleClaim` | `roleClaims` | `src/domain/entities/identity/roleClaim.entity.ts` | UUID | **NO** | **BUG**: `role!: Role[]` should be `Role` for ManyToOne |
| 4 | `UserRole` | `userRoles` | `src/domain/entities/identity/userRole.entity.ts` | UUID | YES | **MISSING**: No @ManyToOne for userId/roleId |
| 5 | `UserClaim` | `userClaims` | `src/domain/entities/identity/userClaim.entity.ts` | **increment** | **NO** | **ANOMALY**: Integer PK, no BaseEntity, no audit columns |
| 6 | `UserLogin` | `userLogins` | `src/domain/entities/identity/userLogin.entity.ts` | UUID | YES | Session tokens; **MISSING**: No @ManyToOne for userId |
| 7 | `UserBiometric` | `userBiometrics` | `src/domain/entities/identity/userBiometric.entity.ts` | UUID | YES | Profile images (Cloudinary), privacy setting |
| 8 | `UserFollow` | `user_follows` | `src/domain/entities/userFollow.entity.ts` | UUID | YES | Follow relationships; has proper @ManyToOne with CASCADE |
| 9 | `UserPreference` | `userPreferences` | `src/domain/entities/identity/userPreference.entity.ts` | **PrimaryColumn** | **NO** | Theme + notification channels; OneToOne→User |

### 4.3 Entity Inventory — `notification` Schema (4 tables)

| # | Entity | Table | File | PK | Notes |
|---|--------|-------|------|----|-------|
| 1 | `Notification` | `notifications` | `src/domain/entities/notification/notification.entity.ts` | UUID | **MISSING**: No `link` column; no @ManyToOne for `notifyId` |
| 2 | `NotificationEvent` | `notificationEvents` | `src/domain/entities/notification/notificationEvent.entity.ts` | UUID | **DEAD CODE**: Empty entity, no columns |
| 3 | `NotificationTemplate` | `notificationTemplates` | `src/domain/entities/notification/notificationTemplate.entity.ts` | UUID | **DEAD CODE**: Only `name` column |
| 4 | `NewsletterSubscriber` | `newsletter_subscribers` | `src/domain/entities/newsletterSubscriber.entity.ts` | UUID | Email subscription; standalone |

### 4.4 Entity Inventory — `analytics` Schema (8 tables)

| # | Entity | Table | File | Notes |
|---|--------|-------|------|-------|
| 1 | `AnalyticsEvent` | `analyticsEvents` | `src/domain/entities/analyticsEvent.entity.ts` | Event tracking; **MISSING**: No @ManyToOne for userId |
| 2 | `PremiumRollup` | `premiumRollups` | `src/domain/entities/premiumRollup.entity.ts` | Weekly engagement rollup; no FK to User |
| 3 | `YoutubeChannelAnalytics` | `youtubeChannelAnalytics` | `src/domain/entities/youtubeChannelAnalytics.entity.ts` | 16+ metric columns, composite index |
| 4 | `YoutubeVideoAnalytics` | `youtubeVideoAnalytics` | `src/domain/entities/youtubeVideoAnalytics.entity.ts` | Per-video daily snapshot; no FK to User/Video |
| 5 | `FacebookPageAnalytics` | `facebookPageAnalytics` | `src/domain/entities/facebookPageAnalytics.entity.ts` | Page-level metrics |
| 6 | `FacebookPostAnalytics` | `facebookPostAnalytics` | `src/domain/entities/facebookPostAnalytics.entity.ts` | Post-level metrics (20+ columns) |
| 7 | `FacebookVideoAnalytics` | `facebookVideoAnalytics` | `src/domain/entities/facebookVideoAnalytics.entity.ts` | Video-level metrics |

### 4.5 Entity Inventory — Default Schema (18 tables)

| # | Entity | Table | File | Notes |
|---|--------|-------|------|-------|
| 1 | `UserContent` | `userContents` | `src/domain/entities/userContent.entity.ts` | Content items; has @ManyToOne→User with JOIN |
| 2 | `LinkedAccount` | `linkedAccounts` | `src/domain/entities/linkedAccount.entity.ts` | OAuth connections; **MISSING**: No @ManyToOne for userId |
| 3 | `ManualProfile` | `manualProfiles` | `src/domain/entities/manualProfile.entity.ts` | Manual platform profiles; has @ManyToOne→User |
| 4 | `ContentStream` | `contentStreams` | `src/domain/entities/contentStream.entity.ts` | Disconnected content archive |
| 5 | `SearchHistory` | `searchHistories` | `src/domain/entities/searchHistroy.entity.ts` | Search queries; **MISSING**: No @ManyToOne for userId |
| 6 | `Topic` | `topics` | `src/domain/entities/topic.entity.ts` | Interest topics; OneToMany→UserTopics |
| 7 | `UserTopic` | `userTopics` | `src/domain/entities/userTopic.entity.ts` | User-topic junction; has proper @ManyToOne with CASCADE |
| 8 | `Playlist` | `playlists` | `src/domain/entities/collection/playlist.entity.ts` | Playlists; has @ManyToOne→User, cascade insert for members/content |
| 9 | `PlaylistContent` | `playlistContent` | `src/domain/entities/collection/playlistContent.entity.ts` | Playlist items; @ManyToOne→Playlist, @ManyToOne→PlaylistMember (SET NULL) |
| 10 | `PlaylistMember` | `playlistMembers` | `src/domain/entities/collection/playlistMember.entity.ts` | Playlist members; @ManyToOne→Playlist + User (CASCADE) |
| 11 | `UploadJob` | `upload_jobs` | `src/domain/entities/uploadJob.entity.ts` | YouTube upload tracking; **MISSING**: No @ManyToOne for videoId |
| 12 | `PublishJob` | `publish_jobs` | `src/domain/entities/publishJob.entity.ts` | Cross-platform publishing; **MISSING**: No @ManyToOne for userId/linkedAccountId/uploadId |
| 13 | `YoutubeAccount` | `youtube_accounts` | `src/domain/entities/youtubeAccount.entity.ts` | YouTube OAuth tokens; **MISSING**: No @ManyToOne for userId |
| 14 | `YoutubeVideo` | `youtube_videos` | `src/domain/entities/youtubeVideo.entity.ts` | Video metadata; **MISSING**: No @ManyToOne for accountId |
| 15 | `YoutubeAnalytic` | `youtube_analytics` | `src/domain/entities/youtubeAnalytic.entity.ts` | Legacy analytics (simple) |
| 16 | `DataProtectionKey` | `dataProtectionKeys` | `src/domain/entities/dataProtectionKey.entity.ts` | OAuth state storage |
| 17 | `RateLimit` | `rateLimits` | `src/domain/entities/rateLimit.entity.ts` | IP-based rate limiting |
| 18 | `RateLimitLog` | `rateLimitLogs` | `src/domain/entities/rateLimitLog.entity.ts` | Rate limit audit log |

### 4.6 BaseEntity Audit

**File**: `src/domain/baseEntity.ts`

```
id: UUID (PrimaryGeneratedColumn)
createdBy: string (nullable)
createdOn: Date (CreateDateColumn)
lastModifiedBy: string (nullable)
lastModifiedOn: Date (UpdateDateColumn, nullable)
lastRefreshed: Date (timestamp, default CURRENT_TIMESTAMP)
```

**Issues**:
- `lastRefreshed` is set on insert but never updated by `@BeforeUpdate`; serves no runtime purpose
- `_currentUser` is a private non-persisted property set via `setCurrentUser()` — fragile pattern requiring manual call in every service
- `@BeforeInsert` overrides `@CreateDateColumn`'s auto-setting with `new Date()` — redundant
- No `@Index` on `createdBy` or `lastModifiedBy` for audit queries

**Entities NOT extending BaseEntity**:
- `RoleClaim` — UUID PK but no audit columns
- `UserClaim` — Integer PK (increment), no audit columns
- `UserPreference` — `PrimaryColumn('uuid')`, no audit columns

### 4.7 Missing FK Relation Decorators

**25+ entities** reference other entities by ID string but have **no TypeORM relation decorator**:

| Entity | Column | Missing FK To | Impact |
|--------|--------|---------------|--------|
| `UserRole` | `userId` | `User` | No cascade, no join, no FK constraint |
| `UserRole` | `roleId` | `Role` | Same |
| `UserClaim` | `userId` | `User` | Same |
| `UserLogin` | `userId` | `User` | Same |
| `LinkedAccount` | `userId` | `User` | Same |
| `SearchHistory` | `userId` | `User` | Same |
| `Notification` | `notifyId` | `User` | Same |
| `AnalyticsEvent` | `userId` | `User` | Same |
| `PremiumRollup` | `userId` | `User` | Same |
| `YoutubeAccount` | `userId` | `User` | Same |
| `YoutubeVideo` | `accountId` | `YoutubeAccount` | Same |
| `YoutubeVideoAnalytics` | `userId` | `User` | Same |
| `YoutubeVideoAnalytics` | `videoId` | `YoutubeVideo` | Same |
| `YoutubeChannelAnalytics` | `userId` | `User` | Same |
| `FacebookPageAnalytics` | `userId` | `User` | Same |
| `FacebookPostAnalytics` | `userId` | `User` | Same |
| `FacebookVideoAnalytics` | `userId` | `User` | Same |
| `RateLimit` | `userId` | `User` | Same |
| `RateLimitLog` | `userId` | `User` | Same |
| `DataProtectionKey` | `userId` | `User` | Same |
| `UploadJob` | `videoId` | `YoutubeVideo` | Same |
| `PublishJob` | `userId` | `User` | Same |
| `PublishJob` | `linkedAccountId` | `LinkedAccount` | Same |
| `PublishJob` | `uploadId` | `UploadJob` | Same |

### 4.8 Orphan Risk Summary

| Deletable Parent | Orphaned Child | Cascade | Risk |
|-----------------|----------------|---------|------|
| `User` | `UserRole` | None | HIGH |
| `User` | `UserClaim` | None | HIGH |
| `User` | `UserLogin` | None | HIGH |
| `User` | `LinkedAccount` | None | HIGH |
| `User` | `Notification` (via `notifyId`) | None | HIGH |
| `User` | `SearchHistory` | None | MEDIUM |
| `Role` | `RoleClaim` | None (buggy type) | HIGH |
| `Role` | `UserRole` | None | HIGH |
| `LinkedAccount` | `PublishJob` | None | MEDIUM |
| `YoutubeAccount` | `YoutubeVideo` | None | MEDIUM |
| `YoutubeVideo` | `UploadJob` | None | LOW |

### 4.9 TypeORM Migrations

**45 migrations** in `src/infrastructure/migrations/`, spanning the full project lifecycle:

| Category | Count | Examples |
|----------|-------|---------|
| Schema creation | 3 | `create-schema-identity`, `create-schema-notification`, `CreateSchemaAnalytics` |
| Initial table creation | 8 | `initialCreate`, `userContentCreate`, `notificationCreate`, `rateLimitCreate`, `playlistCreate` |
| Entity modifications | 15 | `userMOD`, `linkedAccountMOD`, `userContentMOD`, etc. |
| Feature additions | 12 | `AddSearchHistory`, `onboarding-feature`, `add-user-follows`, `addReferralColumns`, `AddYoutubeAnalytics`, `AddFacebookAnalytics` |
| Data migrations | 5 | `userContentNormalize`, `userContentUserIdToUuid`, `userContentAddForeignKey` |
| Infrastructure | 2 | `CreatePublishJobsTable`, `CreateNewsletterSubscriberTable` |

**Config**: `POSTGRES_MIGRATIONS_RUN=true` — migrations run automatically on startup.

### 4.10 Enums (15 total)

**File**: `src/domain/enums.ts`

| Enum | Values | Usage |
|------|--------|-------|
| `UserType` | Admin, Guest, User | User role type |
| `RoleType` | System, Regular | Role classification |
| `NotificationType` | Import | Notification category (**under-utilized**) |
| `NotificationStatus` | In-Progress, Completed, Cancelled, Failed | **DEAD CODE** — never referenced |
| `Theme` | System, Light, Dark | UI theme preference |
| `NotificationChannel` | InApp, Email, Push | Notification delivery channels |
| `PlaylistMemberRole` | Owner, Editor, Viewer | Playlist access |
| `StreamEntityType` | Profile, Content, Community | Content stream type |
| `ProfileImagePrivacy` | Everyone, Interactions | Profile photo visibility |
| `ProfilePrivacy` | Public, Private | Profile visibility |
| `FollowStatus` | requested, accepted, blocked | Follow relationship state |
| `OnboardingStep` | NotStarted, ProfileData, Topics, Platforms, Confirmation, Completed | Onboarding progress |
| `PostType` | video, short, reel, story, post, article, pin, project, message, track | Content type |
| `YouTubeUserContentFilters` | channel, uploaded_video, short, playlist, subscription, activity, playlist_video | YouTube API filter |
| `YouTubeOnlineFilters` | youtube#channel, youtube#video, youtube#playlist | YouTube search filter |

---

## 5. Authentication Architecture

### 5.1 Auth Handlers (14 total)

**File**: `src/features/auth/`

| # | Handler | File | Type | Description |
|---|---------|------|------|-------------|
| 1 | `LoginCommandHandler` | `src/features/auth/login/login.handler.ts` | Command | Email/password login with 2FA detection |
| 2 | `RegisterCommandHandler` | `src/features/auth/register/register.handler.ts` | Command | User registration with avatar generation, referral codes |
| 3 | `RefreshTokenCommandHandler` | `src/features/auth/refresh-token/refresh-token.handler.ts` | Command | Token refresh with security stamp validation |
| 4 | `LogoutCommandHandler` | `src/features/auth/logout/logout.handler.ts` | Command | Session invalidation |
| 5 | `CurrentUserController` | `src/features/auth/current-user/current-user.endpoint.ts` | Query | Returns current JWT claims as user object |
| 6 | `ForgotPasswordCommandHandler` | `src/features/auth/forgot-password/forgot-password.handler.ts` | Command | Password reset email |
| 7 | `ResetPasswordCommandHandler` | `src/features/auth/reset-password/reset-password.handler.ts` | Command | Password reset with token |
| 8 | `VerifyCodeCommandHandler` | `src/features/auth/verify-code/verify-code.handler.ts` | Command | Email verification code |
| 9 | `Setup2FACommandHandler` | `src/features/auth/2fa/setup/2fa-setup.handler.ts` | Command | Generate TOTP secret + QR code |
| 10 | `Enable2FACommandHandler` | `src/features/auth/2fa/enable/2fa-enable.handler.ts` | Command | Enable 2FA after OTP verification |
| 11 | `Verify2FACommandHandler` | `src/features/auth/2fa/verify/2fa-verify.handler.ts` | Command | 2FA login verification |
| 12 | `Disable2FACommandHandler` | `src/features/auth/2fa/disable/2fa-disable.handler.ts` | Command | Disable 2FA |
| 13 | `GoogleAuthHandler` | `src/features/auth/external/google-auth/google-auth.handler.ts` | Command | Google OAuth connect + callback |
| 14 | `FacebookAuthHandler` | `src/features/auth/external/facebook-auth/facebook-auth.handler.ts` | Command | Facebook OAuth connect + callback |

### 5.2 JWT Configuration

**File**: `src/configs.ts`

| Property | Value | Source |
|----------|-------|--------|
| Secret | `super-secret-key` (dev) | `JWT_SECRET` env |
| Access Token Expiry | `7d` | `JWT_ACCESS_EXPIRATION_MINUTES` env |
| Refresh Token Expiry | `30d` | `JWT_REFRESH_EXPIRATION_HOURS` env |
| Issuer | `http://localhost:5000` (dev) | `JWT_ISSUER` env |
| Audience | `http://localhost:5000` (dev) | `JWT_AUDIENCE` env |
| Algorithm | HS256 (via `@nestjs/jwt`) | Default |

### 5.3 JWT Claims (14 claim URIs)

**File**: `src/core/globals.ts`

| # | Claim URI | Constant | Purpose |
|---|-----------|----------|---------|
| 1 | `http://gaddr.com/claims/sub` | `UserId` | User UUID |
| 2 | `http://gaddr.com/claims/email` | `Email` | User email |
| 3 | `http://gaddr.com/claims/2fa-required` | `TwoFARequired` | 2FA pending flag |
| 4 | `http://gaddr.com/claims/security-stamp` | `SecurityStamp` | Security stamp for token invalidation |
| 5 | `http://gaddr.com/claims/concurrency-stamp` | `ConcurrencyStamp` | Concurrency control |
| 6 | `http://gaddr.com/claims/usertype` | `UserType` | Admin/Guest/User |
| 7 | `http://gaddr.com/claims/username` | `UserName` | Display name |
| 8 | `http://gaddr.com/claims/profile-picture` | `ProfileImage` | Profile image URL |
| 9 | `http://gaddr.com/claims/account-type` | `AccountType` | Account type |
| 10 | `http://gaddr.com/claims/givenname` | `GivenName` | First name |
| 11 | `http://gaddr.com/claims/familyname` | `FamilyName` | Last name |
| 12 | `http://gaddr.com/claims/fullname` | `FullName` | Full name |
| 13 | `http://gaddr.com/claims/roles` | `Roles` | Array of role names |
| 14 | `permission` | `Permission` | Array of permission strings |

**Plus**: `onboardingStep` is included as a **non-namespaced claim** in the JWT payload (line 101 of token.service.ts).

### 5.4 Token Service

**File**: `src/infrastructure/services/token.service.ts`

| Method | Purpose | Token Expiry |
|--------|---------|--------------|
| `generateJwtAsync(user)` | Full access token with all claims | 7d (default) |
| `generate2FAJwt(user, ip, ua, deviceId)` | Limited 2FA-pending token | 5 minutes |
| `getPrincipalFromToken(token)` | Decode JWT without verification | — |
| `generateEncryptedToken(claims, exp?)` | Low-level JWT signing | Configurable |

**2FA JWT claims** include `device-id`, `ip-address`, `user-agent` for device fingerprinting during 2FA verification.

### 5.5 Login Flow

```
1. Client POST /api/v1/auth/login { email, password, deviceId, userAgent, ipAddress }
2. Validate with Joi schema
3. Normalize email
4. Fetch user by email + verify password (bcrypt)
5. Check: emailConfirmed? → Reject if false
6. Check: isLockedOut || !isActive? → Reject with lockout message
7. If twoFactorEnabled:
   → Generate 2FA JWT (5min expiry) with device fingerprint
   → Return { access_token, isTwoFARequired: true, succeeded: false }
8. Else:
   → Generate full JWT
   → Create UserLogin session record
   → Cache user in Redis (TTL: session duration)
   → Track analytics event
   → Return { access_token, refresh_token, succeeded: true, refreshTokenExpiryTime }
```

### 5.6 Refresh Token Flow

```
1. Client POST /api/v1/auth/refresh { refreshToken, deviceId, userAgent, ipAddress }
2. Get current user from HttpContext (extracted from JWT by middleware)
3. Look up UserLogin by tokenValue + deviceId
4. Validate: token not expired
5. Validate: securityStamp matches current JWT claim
   → If mismatch: invalidate token, return 401
6. Generate fresh JWT (includes latest claims like onboardingStep)
7. Rotate refresh token (new tokenValue, new expiry)
8. Check IP change → TODO: send notification email
9. Return { access_token, refresh_token, succeeded: true }
```

### 5.7 2FA Flow

**Setup** (`POST /api/v1/auth/2fa/setup`):
1. Verify user exists and 2FA not already enabled
2. Generate TOTP secret via `speakeasy.generateSecret()`
3. Generate QR code via `qrcode.toDataURL()`
4. Return `{ secret: base32, qrCode: dataURL }`

**Enable** (`POST /api/v1/auth/2fa/enable`):
1. Validate OTP against provided secret
2. Verify user exists and 2FA not already enabled
3. Set `twoFactorEnabled = true`, `twoFactorSecret = secret`

**Verify** (`POST /api/v1/auth/2fa/verify`):
1. Validate OTP against stored secret
2. **BUG**: Line 78 checks `if (user.twoFactorEnabled)` and throws — **inverted logic**. Should check if NOT enabled.
3. Verify device fingerprint matches 2FA JWT claims
4. Issue full access token + refresh token

**Disable** (`POST /api/v1/auth/2fa/disable`):
1. Set `twoFactorEnabled = false`, `twoFactorSecret = ''`

### 5.8 2FA Bug Detail

**File**: `src/features/auth/2fa/verify/2fa-verify.handler.ts:78`

```typescript
if (user.twoFactorEnabled) {
  throw new ApplicationException(''); // BUG: throws when 2FA IS enabled
}
```

This is **inverted**. The handler should throw when 2FA is NOT enabled (i.e., user reached verify endpoint without 2FA). As written, a user with 2FA enabled will always fail verification.

Similarly, `2fa-enable.handler.ts:60` and `2fa-setup.handler.ts:35` both check `if (user.twoFactorEnabled)` and throw with empty error messages — these are correct guards (prevent re-enabling), but the empty error strings are unhelpful.

---

## 6. Authorization

### 6.1 Role-Based Access Control (RBAC)

| Entity | Purpose |
|--------|---------|
| `Role` | Named role (Admin, User, Regular/System type) |
| `RoleClaim` | Permission per role (`claimType`, `claimValue` format: `ControllerName.methodName`) |
| `UserRole` | User-role assignment |
| `UserClaim` | Direct user permissions (not role-based) |

### 6.2 Guard Architecture

| Guard | File | Purpose |
|-------|------|---------|
| `AccessLevelGuard` (factory) | `src/core/passport/account.guard.ts` | Validates JWT, security/concurrency stamps, userType, 2FA status |
| `PermissionsGuard` | `src/core/passport/permissions.guard.ts` | Checks `permission` claim against `Controller.method` |
| `TurnstileGuard` | `src/core/passport/turnstile.guard.ts` | Cloudflare Turnstile CAPTCHA verification |
| `OnboardingGuard` | `src/core/passport/onboarding.guard.ts` | Blocks access if onboarding incomplete |

### 6.3 Permission Discovery

Backend uses `Permissions.discoverControllerPermissions()` to auto-discover all controller methods decorated with `PermissionsGuard`. The `DataSeeder` creates an Admin role with all discovered permissions on bootstrap.

### 6.4 Default Credentials (configs.ts)

| User | Email | Password |
|------|-------|----------|
| System Admin | `team@gaddr.com` | `@Admin@123` |
| Guest User | `johndoe@gaddr.com` | `@Abc@123` |

---

## 7. API Layer

### 7.1 Endpoint Inventory by Feature Module

| Feature Module | Endpoints | Path Prefix | Description |
|---------------|-----------|-------------|-------------|
| **Auth** | 14 | `/api/v1/auth/`, `/api/v1/account/` | Login, register, refresh, logout, 2FA, OAuth, password, verification |
| **User** | ~35 | `/api/v1/user/`, `/api/v1/account/` | CRUD, email/phone changes, following (7 endpoints), username, settings, onboarding completion |
| **Profile** | 5 | `/api/v1/profile/` | Get profile, public profile, linked accounts, manual profiles, discover profiles |
| **Role** | 9 | `/api/v1/roles/`, `/api/v1/permissions/` | CRUD roles, permissions CRUD, activate/deactivate |
| **Playlist** | 11 | `/api/v1/playlists/` | CRUD, add/remove content, add/remove members, bookmarks |
| **Onboarding** | 10 | `/api/v1/onboarding/` | Steps 1-4 (get/update each), topics, status |
| **Notification** | 3 | `/api/v1/notifications/` | CRUD notification events |
| **Search** | 1 | `/api/v1/search/` | Cross-platform search |
| **Discover** | 1 | `/api/v1/discover/` | Content discovery feed |
| **Newsletter** | 1 | `/api/v1/newsletter/` | Subscribe |
| **Analytics** | 1 | `/api/v1/analytics/` | Weekly stats |
| **Integrations** | ~100 | `/api/v1/integrations/` | 15 platforms × ~7 operations each + publish/upload |

**Total: ~190+ distinct endpoints**

### 7.2 Integration Endpoints (per platform pattern)

Each of the 15 platforms follows this endpoint pattern:

| Operation | Method | Description |
|-----------|--------|-------------|
| `connect` | GET/POST | OAuth initiation + callback |
| `disconnect` | POST | Revoke access |
| `import` | POST | Trigger content import (BullMQ job) |
| `sync` | POST | Sync account data |
| `search` | GET | Search platform content |
| `get-profile` | GET | Fetch platform profile |
| `get-contents` | GET | List imported content |

**Platforms**: YouTube, Facebook, Instagram, Twitter, Pinterest, LinkedIn, TikTok, Spotify, Reddit, Snapchat, Threads, Behance, GitHub, Discord, Twitch

**YouTube-specific** (additional): `upload`, `chunk-upload`, `upload-status`, `retry-upload`, `webhook`, `analytics`

**Publishing** (generic): `publish-content`, `publish-status`, `publish-capabilities`

### 7.3 WebSocket Namespaces

| Namespace | Gateway | Events |
|-----------|---------|--------|
| `/notifications` | `NotificationGateway` | `connected`, `join`, `new-notification`, `notification-updated`, `notification-read`, `mark-as-read`, `mark-all-as-read`, `profile-update`, `follow.updated`, `force-logout`, `session-alert` |
| `/imports` | `ImportGateway` | `connected`, `join`, `new-content` |

---

## 8. Message Queue & Background Processing

### 8.1 BullMQ Configuration

**File**: `src/modules/queues.module.ts`

- **Global module** — queues available to all modules
- **11 named queues** registered via `BullModule.registerQueue()`
- **Worker toggle**: `DISABLE_WORKERS=true` env disables processor registration (web-only instances)
- **Bull Board dashboard** mounted at `/background/queues` with `BullBoardAuthMiddleware`

### 8.2 Queue Names

| Queue | Processor | Purpose |
|-------|-----------|---------|
| `facebook-import` | `FacebookImportProcessor` | Facebook content import |
| `instagram-import` | `InstagramImportProcessor` | Instagram content import |
| `youtube-import` | `YoutubeImportProcessor` | YouTube content import |
| `youtube-upload` | `YoutubeUploadProcessor` | YouTube video upload |
| `pinterest-import` | `PinterestImportProcessor` | Pinterest content import |
| `reddit-import` | `RedditImportProcessor` | Reddit content import |
| `twitter-import` | `TwitterImportProcessor` | Twitter content import |
| `tiktok-import` | `TiktokImportProcessor` | TikTok content import |
| `linkedin-import` | `LinkedInImportProcessor` | LinkedIn content import |
| `snapchat-import` | `SnapchatImportProcessor` | Snapchat content import |
| `publish-content` | `PublishContentProcessor` | Cross-platform content publishing |

### 8.3 Additional Processors (registered but not in named queues)

| Processor | File |
|-----------|------|
| `SpotifyImportProcessor` | `src/infrastructure/background/processors/spotify-import.processor.ts` |
| `ThreadsImportProcessor` | `src/infrastructure/background/processors/threads-import.processor.ts` |
| `BehanceImportProcessor` | `src/infrastructure/background/processors/behance-import.processor.ts` |

**Note**: 14 processor files exist in `src/infrastructure/background/processors/` but only 11 queues are registered. `SpotifyImportProcessor`, `ThreadsImportProcessor`, and `BehanceImportProcessor` may be unused or registered elsewhere.

### 8.4 Event-Driven Communication

| Component | Mechanism | Purpose |
|-----------|-----------|---------|
| `ContentImportListener` | `@nestjs/event-emitter` | Listens for import completion events |
| `NotificationGateway` | Socket.IO | Pushes real-time notifications |
| `ImportGateway` | Socket.IO | Pushes new content to clients |
| `ProfileCacheService` | Redis | Caches user profiles for performance |

---

## 9. Key Findings

### 9.1 CRITICAL Findings

| ID | Severity | Finding | Location | Impact |
|----|----------|---------|----------|--------|
| **F-01** | CRITICAL | **Real API keys and secrets in `.env.development`** | `.env.development` | Facebook, Instagram, YouTube, Twitter, Pinterest, LinkedIn, TikTok, Cloudinary, Brevo, Cloudflare R2, Neon DB credentials all in plaintext |
| **F-02** | CRITICAL | **Weak JWT secret**: `super-secret-key` | `.env.development:21` | Trivially guessable; all JWTs can be forged |
| **F-03** | CRITICAL | **2FA verify/enable handlers have inverted logic** | `2fa-verify.handler.ts:78`, `2fa-enable.handler.ts:60`, `2fa-setup.handler.ts:35` | Users with 2FA enabled cannot complete login verification |
| **F-04** | CRITICAL | **`RoleClaim.role` typed as `Role[]` instead of `Role`** | `roleClaim.entity.ts:20` | ManyToOne relation incorrectly typed as array; may cause TypeORM mapping failures |
| **F-05** | CRITICAL | **`UserClaim` uses integer PK, doesn't extend BaseEntity** | `userClaim.entity.ts` | Breaks UUID consistency across all entities; no audit trail |

### 9.2 HIGH Findings

| ID | Severity | Finding | Location | Impact |
|----|----------|---------|----------|--------|
| **F-06** | HIGH | **25+ entities missing FK relation decorators** | Multiple entity files | No database-level FK constraints; orphan risk on all parent deletions |
| **F-07** | HIGH | **100+ `console.log` statements in production code** | 30+ files | Sensitive data logged: tokens, user data, API keys, internal state |
| **F-08** | HIGH | **`Notification` entity missing `link` column** | `notification.entity.ts` | Frontend expects `link: string \| null` but entity has no such column |
| **F-09** | HIGH | **Empty error messages in 2FA handlers** | `2fa-verify.handler.ts:79`, `2fa-enable.handler.ts:61`, `2fa-setup.handler.ts:36` | `throw new ApplicationException('')` — user sees empty error |
| **F-10** | HIGH | **`console.log` leaks SMTP config** | `email.listener.ts:36` | `console.log('THis is SMPT: ', configs.brevo)` — prints API key |
| **F-11** | HIGH | **`console.log` leaks OAuth debug data** | `google-auth.handler.ts` (12 instances), `facebook-connect.handler.ts` (11 instances) | Tokens, state, stored keys logged |
| **F-12** | HIGH | **`console.log` leaks Facebook access tokens** | `facebook-import.handler.ts:123` | `console.log('FINAL TOKEN:', accessToken?.substring(0, 40) + '...')` |

### 9.3 MEDIUM Findings

| ID | Severity | Finding | Location | Impact |
|----|----------|---------|----------|--------|
| **F-13** | MEDIUM | **`SearchHistory.userId` is NOT NULL but should be nullable** | `searchHistroy.entity.ts:13` | Anonymous search not supported (file also has typo in name) |
| **F-14** | MEDIUM | **`NotificationEvent` and `NotificationTemplate` are dead code** | `notificationEvent.entity.ts`, `notificationTemplate.entity.ts` | Empty entities registered in TypeORM but never used |
| **F-15** | MEDIUM | **`NotificationStatus` enum is dead code** | `enums.ts:16-21` | Defined but never referenced by any entity or handler |
| **F-16** | MEDIUM | **`Role.description` is non-nullable but has no default** | `role.entity.ts:12` | `@Column()` without `nullable: true` — migration required for existing rows |
| **F-17** | MEDIUM | **`UserRole` has no FK decorators** | `userRole.entity.ts` | userId and roleId are bare `@Column()` — no DB constraints |
| **F-18** | MEDIUM | **`DataSeeder` bootstrap is commented out** | `app.module.ts:74` | `//await this.dataSeeder.initializeAsync()` — Admin role may not be seeded |
| **F-19** | MEDIUM | **`Disbale2FACommandHandler` typo in class name** | `2fa-disable.handler.ts:11` | `Disbale2FA` instead of `Disable2FA` |
| **F-20** | MEDIUM | **`RoleFeature` module bypasses feature index.ts** | `features/README.md:50` | Role wiring is done directly in module instead of via composition pattern |
| **F-21** | MEDIUM | **`checkForUnrecognizedDeviceOrIp` compares `deviceId` with `user-agent`** | `2fa-verify.handler.ts:143` | `hasChanged = deviceId !== HttpContext.user['user-agent']` — wrong field |

### 9.4 LOW Findings

| ID | Severity | Finding | Location | Impact |
|----|----------|---------|----------|--------|
| **F-22** | LOW | **`console.warn` for canvas font registration** | `canvas.util.ts:19,24` | Non-critical but noisy |
| **F-23** | LOW | **`OnboardingGuard` has 8 `console.log` statements** | `onboarding.guard.ts` | Debug noise in production |
| **F-24** | LOW | **`searchHistroy.entity.ts` filename typo** | File path | Should be `searchHistory.entity.ts` |
| **F-25** | LOW | **`UserPreference` entity has no `@PrimaryGeneratedColumn`** | `userPreference.entity.ts` | Uses `PrimaryColumn('uuid')` — manual ID management |
| **F-26** | LOW | **`BaseEntity.lastRefreshed` is never updated after insert** | `baseEntity.ts:31` | Dead column — set on insert, never touched by `@BeforeUpdate` |

---

## 10. Architectural Decision Records (ADR)

### ADR-001: Vertical-Slice CQRS Architecture

**Status**: Accepted

**Context**: The team needed a scalable architecture for a feature-rich social media platform with 15+ platform integrations.

**Decision**: Adopt vertical-slice CQRS using `@nestjs/cqrs` with each use case as an isolated directory containing endpoint + handler.

**Consequences**:
- + Feature isolation and independence
- + Clear separation of HTTP and business logic
- + Easy to add new features without touching existing code
- - Some cross-feature wiring complexity (e.g., `commandBus.execute()` for cross-cutting concerns)
- - Role module deviates from the pattern (wired directly in module)

### ADR-002: PostgreSQL with Multiple Schemas

**Status**: Accepted

**Context**: Data spans user identity, notifications, and analytics — different access patterns and retention needs.

**Decision**: Use 3 PostgreSQL schemas (`identity`, `notification`, `analytics`) plus default public schema.

**Consequences**:
- + Logical data separation
- + Schema-level access control possible
- - TypeORM entity decorator `schema:` is used inconsistently — some entities in `default` schema belong logically in `analytics` (e.g., `YoutubeAnalytic`, `YoutubeAccount`)
- - Query complexity for cross-schema joins

### ADR-003: Dual Authentication (JWT + Better Auth)

**Status**: Accepted

**Context**: Need session-based auth for SSR (Next.js) and token-based auth for SPA/API calls.

**Decision**: Primary JWT auth via `@nestjs/jwt` with Better Auth as fallback for cross-subdomain session verification.

**Consequences**:
- + SSR compatibility via cookies
- + SPA compatibility via Bearer tokens
- - `HttpContextMiddleware` has 3-level auth fallback (Bearer → Better Auth cookie → access_token cookie) — complex
- - Better Auth SDK not used client-side

### ADR-004: BullMQ for Background Processing

**Status**: Accepted

**Context**: Content imports from 15 platforms are slow, rate-limited, and need retry logic.

**Decision**: Use BullMQ (Redis-backed) with dedicated queues per platform. Worker toggle via `DISABLE_WORKERS` env.

**Consequences**:
- + Horizontal scaling — web and worker instances can be separated
- + Platform-specific rate limiting per queue
- + Bull Board dashboard for monitoring
- - 11 queues registered globally — high Redis memory usage
- - 3 processor files exist but don't appear to be registered in queue definitions

### ADR-005: Joi for Validation (not class-validator)

**Status**: Accepted

**Context**: Request validation needed in handlers.

**Decision**: Use Joi schemas validated in handler `execute()` methods.

**Consequences**:
- + Lightweight, no decorator overhead
- + Inline with handler code
- - Inconsistent with NestJS ecosystem (class-validator is standard)
- - No Swagger auto-generation of request DTOs from validation schemas

### ADR-006: Cloudflare R2 + Cloudinary Split Storage

**Status**: Accepted

**Context**: Need storage for large video files and small profile images.

**Decision**: Cloudflare R2 (S3-compatible) for video/file storage; Cloudinary for profile images with transformation.

**Consequences**:
- + Optimized for each use case (R2 for large files, Cloudinary for image transforms)
- + Profile images served via CDN with on-the-fly resizing
- - Two separate storage configurations to maintain

### ADR-007: Console.log Instead of Logger

**Status**: Technical Debt

**Context**: Debugging during development led to `console.log` statements.

**Decision**: None — this is unintentional.

**Consequences**:
- - 100+ `console.log` statements leaking sensitive data (tokens, API keys, user data) to stdout/logs
- - Winston logger (`logger.*`) is properly configured but inconsistently used
- - Production logs will contain sensitive information

---

## 11. Assumptions and Constraints

### Assumptions

1. PostgreSQL 14+ is used (based on SSL config and JSONB usage)
2. Redis 4.x is used for session caching and BullMQ
3. The frontend (`E:\SocialApp`) is the only consumer of this API
4. Cloudflare R2 is the production file storage (not local disk)
5. Brevo is the production email provider
6. The `DATABASE_URL` env var points to a Neon serverless Postgres in production
7. All 45 migrations have been run against the production database
8. The `DataSeeder` was intended to run on first boot to create the Admin role

### Constraints

1. **No test files exist** — zero unit, integration, or e2e tests found
2. **TypeORM `synchronize: false`** in production — schema changes require migrations
3. **`migrationsRun: true`** — migrations auto-execute on startup (risk in multi-instance deployments)
4. **Single-process architecture** — BullMQ workers run in the same process as the web server (unless `DISABLE_WORKERS=true`)
5. **No shared types** between backend and frontend — separate type definitions lead to drift
6. **15 OAuth integrations** — each requires separate credential management and API version tracking
7. **SSL disabled for local dev** — `POSTGRES_SSL_REJECTUNAUTHORIZED=false`

---

## 12. Open Questions

| # | Question | Context | Priority |
|---|----------|---------|----------|
| 1 | Should the `Notification` entity gain a `link` column to match frontend expectations? | Frontend type requires `link: string \| null` | HIGH |
| 2 | Should `UserClaim` be migrated to UUID PK + BaseEntity for consistency? | Breaks pattern of all other entities | HIGH |
| 3 | Should the `RoleClaim.role` type bug (`Role[]` → `Role`) be fixed with a migration or just code change? | TypeORM may recreate column | HIGH |
| 4 | Is the `DataSeeder` intentionally disabled? Should Admin role seeding be re-enabled? | RBAC depends on it | HIGH |
| 5 | Should all 100+ `console.log` statements be replaced with `logger.*` calls? | Security risk in production | CRITICAL |
| 6 | Should `.env.development` be removed from version control and added to `.gitignore`? | Contains real API keys | CRITICAL |
| 7 | Should the 25+ missing FK decorators be added via a single migration? | Data integrity | HIGH |
| 8 | Should `SpotifyImportProcessor`, `ThreadsImportProcessor`, `BehanceImportProcessor` be registered in queue definitions? | 14 processors but 11 queues | MEDIUM |
| 9 | Should the `NotificationEvent` and `NotificationTemplate` dead entities be removed? | Dead code | LOW |
| 10 | Should the project adopt `class-validator` + Swagger decorators for request validation? | Consistency with NestJS ecosystem | MEDIUM |
| 11 | Should a monorepo or codegen tool (e.g., OpenAPI → TypeScript) be adopted to share types? | Type drift between frontend/backend | MEDIUM |
| 12 | Should email/push notification channels be implemented? | `NotificationChannel` enum exists but unused | MEDIUM |
| 13 | Should the `UserRole`, `UserLogin`, `LinkedAccount`, `Notification` entities gain `@ManyToOne` with `onDelete: 'CASCADE'`? | 12 orphan-risk relationships | HIGH |

---

*Architecture review complete. 38 entities inspected across 3 schemas + default. 14 auth handlers mapped. 190+ API endpoints catalogued. 100+ console.log statements identified. 45 migrations tracked. 14 JWT claim URIs verified. 15 platform integrations documented.*
