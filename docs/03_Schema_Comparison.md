# 03 — Schema Comparison: TypeORM Entities vs Drizzle ORM

> **Status:** No Drizzle schema exists in this codebase. All definitions below are the
> **Drizzle target schema** derived from reverse-engineering the existing TypeORM entities.
> This document serves as the migration blueprint.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Conventions & Base Layer](#2-conventions--base-layer)
3. [Identity Schema (8 tables)](#3-identity-schema)
4. [Notification Schema (4 tables)](#4-notification-schema)
5. [Analytics Schema (7 tables)](#5-analytics-schema)
6. [Public Schema (19 tables)](#6-public-schema)
7. [Tables Missing From Current Schema](#7-tables-missing-from-current-schema)
8. [Enum Comparison](#8-enum-comparison)
9. [Global Compatibility Matrix](#9-global-compatibility-matrix)
10. [Action Items Summary](#10-action-items-summary)

---

## 1. Overview

| Metric | TypeORM (Current) | Drizzle (Target) |
|---|---|---|
| Total Tables | 38 | 38 + future tables |
| PostgreSQL Schemas | `identity`, `notification`, `analytics`, `public` | Same |
| PK Strategy | UUID (`uuid_generate_v4()`) | UUID (`gen_random_uuid()`) |
| Base Entity | Class inheritance (`BaseEntity`) | Shared columns (no inheritance) |
| Enums | `pg-enum` via `CREATE TYPE` | `pgEnum()` in Drizzle |
| Timestamps | Manual `@BeforeInsert`/`@BeforeUpdate` hooks | `timestamps` helper (insertedAt/updatedAt) |
| Relations | Decorator-based (`@ManyToOne`) | `relations()` function API |

---

## 2. Conventions & Base Layer

### 2A. TypeORM BaseEntity

```ts
// src/domain/baseEntity.ts
export abstract class BaseEntity extends TypeORMBaseEntity {
  id: string;              // UUID PK (PrimaryGeneratedColumn('uuid'))
  createdBy?: string;      // varchar, nullable
  createdOn: Date;         // timestamp, DEFAULT now()
  lastModifiedBy?: string; // varchar, nullable
  lastModifiedOn?: Date;   // timestamp nullable, DEFAULT now()
  lastRefreshed: Date;     // timestamp, DEFAULT CURRENT_TIMESTAMP
}
```

### 2B. Drizzle Base Columns (Target)

```ts
// Target: shared base columns for every table
export const baseColumns = {
  id:          uuid('id').primaryKey().defaultRandom(),
  createdBy:   varchar('createdBy'),
  createdOn:   timestamp('createdOn', { withTimezone: true }).defaultNow().notNull(),
  lastModifiedBy: varchar('lastModifiedBy'),
  lastModifiedOn: timestamp('lastModifiedOn', { withTimezone: true }),
  lastRefreshed:  timestamp('lastRefreshed', { withTimezone: true }).defaultNow().notNull(),
};
```

### Base Compatibility Matrix

| Column | TypeORM | Drizzle | Compatible | Action |
|---|---|---|---|---|
| `id` | `PrimaryGeneratedColumn('uuid')` → `uuid_generate_v4()` | `uuid().primaryKey().defaultRandom()` → `gen_random_uuid()` | **YES** | Both produce PostgreSQL UUIDs. Function name differs but output is identical. |
| `createdBy` | `Column({ nullable: true })` → `varchar` | `varchar('createdBy')` → nullable by default | **YES** | Direct mapping |
| `createdOn` | `@CreateDateColumn()` → `timestamp DEFAULT now()` | `timestamp().defaultNow().notNull()` | **PARTIAL** | TypeORM `@CreateDateColumn` auto-sets on INSERT; Drizzle needs `defaultNow()` + app logic |
| `lastModifiedBy` | `Column({ nullable: true })` → `varchar` | `varchar('lastModifiedBy')` | **YES** | Direct mapping |
| `lastModifiedOn` | `@UpdateDateColumn({ nullable: true })` → `timestamp DEFAULT now()` | `timestamp().defaultNow()` | **PARTIAL** | TypeORM auto-sets on UPDATE; Drizzle needs `$onUpdate()` or trigger |
| `lastRefreshed` | `Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })` | `timestamp().defaultNow().notNull()` | **YES** | Direct mapping |

---

## 3. Identity Schema

Schema: `identity` (PostgreSQL namespace)

---

### 3.1 `identity.users`

**TypeORM:** `src/domain/entities/identity/user.entity.ts`

#### Column-by-Column Comparison

| Column | TypeORM Type | TypeORM Nullable | TypeORM Default | Drizzle Type | Drizzle Nullable | Drizzle Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | None |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | None |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | None |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | None |
| `firstName` | `varchar` | NO | — | `varchar` | NO | — | YES | None |
| `lastName` | `varchar` | NO | — | `varchar` | NO | — | YES | None |
| `isActive` | `boolean` | NO | `true` | `boolean` | NO | `true` | YES | None |
| `registeredOn` | `timestamp` | YES | — | `timestamp` | YES | — | YES | None |
| `userName` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `email` | `varchar` | NO | — | `varchar` | NO | — | YES | None |
| `gender` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `phoneNumber` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `bio` | `text` | YES | — | `text` | YES | — | YES | None |
| `googleId` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `newEmail` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `lastEmailModifiedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | None |
| `newPhoneNumber` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `lastPhoneNumberModifiedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | None |
| `lastUserNameModifiedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | None |
| `normalizedEmail` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `normalizedUserName` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `emailConfirmed` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | None |
| `twoFactorEnabled` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | None |
| `twoFactorSecret` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `passwordHash` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `lastPasswordModifiedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | None |
| `isLockedOut` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | None |
| `lockoutEnd` | `timestamp` | YES | — | `timestamp` | YES | — | YES | None |
| `accessFailedCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | None |
| `concurrencyStamp` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `securityStamp` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `referralCode` | `varchar` | YES | UNIQUE | `varchar` | YES | — | **PARTIAL** | Add `.unique()` in Drizzle |
| `referredBy` | `varchar` | YES | — | `varchar` | YES | — | YES | None |
| `profilePrivacy` | `enum ProfilePrivacy` | NO | `'Public'` | `pgEnum` | NO | `'Public'` | YES | Define `profilePrivacyEnum` |
| `type` | `enum UserType` | NO | `'User'` | `pgEnum` | NO | `'User'` | YES | Define `userTypeEnum` |
| `onboardingStep` | `enum OnboardingStep` | YES | `'NotStarted'` | `pgEnum` | YES | `'NotStarted'` | YES | Define `onboardingStepEnum` |

#### Indexes

| Index Name | TypeORM Definition | Columns | Unique | Drizzle Equivalent | Compatible | Action |
|---|---|---|---|---|---|---|
| PK | `PrimaryGeneratedColumn('uuid')` | `id` | YES | `primaryKey()` | YES | None |
| Unique | `@Column({ unique: true })` on `referralCode` | `referralCode` | YES | `unique('referralCode')` | YES | None |

#### Foreign Keys

| FK | TypeORM Relation | On Delete | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| OneToOne → `userBiometrics` | `@OneToOne(() => UserBiometric)` | CASCADE | `one(userBiometrics)` | YES | None |
| OneToMany → `playlists` | `@OneToMany(() => Playlist)` | — | `many(playlists)` | YES | None |
| OneToMany → `playlistMembers` | `@OneToMany(() => PlaylistMember)` | — | `many(playlistMembers)` | YES | None |
| OneToMany → `user_follows` (followers) | `@OneToMany(() => UserFollow)` | — | `many(userFollows)` | YES | None |
| OneToMany → `user_follows` (following) | `@OneToMany(() => UserFollow)` | — | `many(userFollows)` | YES | None |
| OneToMany → `userTopics` | `@OneToMany(() => UserTopic)` | — | `many(userTopics)` | YES | None |

#### Notes

- TypeORM has `@BeforeInsert` hook to auto-populate `normalizedEmail`/`normalizedUserName` from `email`/`userName`. **Action:** Drizzle requires explicit app-level logic or `beforeInsert` middleware.
- `registeredOn` is set in constructor, not via decorator. **Action:** Ensure application code sets `registeredOn` on insert.

---

### 3.2 `identity.roles`

**TypeORM:** `src/domain/entities/identity/role.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `name` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `description` | `varchar` | NO | — | `varchar` | NO | — | **PARTIAL** | Entity declares `description?: string` but DB column is `NOT NULL`. Align. |
| `normalizedName` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `type` | `enum RoleType` | NO | `'Regular'` | `pgEnum` | NO | `'Regular'` | YES | — |
| `isDisabled` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | — |
| `disabledUntil` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |

---

### 3.3 `identity.userRoles`

**TypeORM:** `src/domain/entities/identity/userRole.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | TypeORM stores as `varchar`, but refers to `uuid`. Drizzle should use `uuid` FK type. Verify DB column type. |
| `roleId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | Same issue as `userId`. Verify DB column is `uuid`. |
| `isDisabled` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | — |
| `disabledUntil` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |

#### Notes

- No FK constraints declared in TypeORM entity. **Action:** Add explicit FK constraints in Drizzle schema.
- No unique constraint on `(userId, roleId)`. **Action:** Consider adding unique composite index.

---

### 3.4 `identity.userLogins`

**TypeORM:** `src/domain/entities/identity/userLogin.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `provider` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | Same varchar-as-uuid issue. |
| `tokenValue` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userAgent` | `varchar` | YES* | — | `varchar` | YES | — | YES | Entity declares optional but DB was originally `NOT NULL`. Migration `1748341877376` fixed. |
| `ipAddress` | `varchar` | YES* | — | `varchar` | YES | — | YES | Same as above |
| `deviceId` | `varchar` | YES* | — | `varchar` | YES | — | YES | Same as above |
| `isValid` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | — |
| `addedDateUtc` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `expiryDateUtc` | `timestamp` | NO | — | `timestamp` | NO | — | YES | — |

#### Notes

- No FK constraint declared in TypeORM. **Action:** Add FK to `identity.users.id` in Drizzle.

---

### 3.5 `identity.userClaims`

**TypeORM:** `src/domain/entities/identity/userClaim.entity.ts`

**CRITICAL:** This entity does NOT extend `BaseEntity`. It uses `PrimaryGeneratedColumn('increment')`.

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `int` (PK, auto-increment) | NO | `nextval()` | `serial('id').primaryKey()` or `integer().primaryKey().generatedAlwaysAsIdentity()` | NO | auto | **PARTIAL** | Use `serial()` or `integer().primaryKey().generatedAlwaysAsIdentity()` |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid issue. Add FK. |
| `claimType` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `claimValue` | `varchar` | NO | — | `varchar` | NO | — | YES | — |

#### Notes

- No timestamps (no `createdOn`, etc.). **Action:** Preserve as-is; this table intentionally lacks audit columns.
- No FK constraint declared. **Action:** Add FK to `identity.users.id`.
- Entity name `UserClaim` but migration creates `identity.UserClaims` (capital C). Verify actual DB table name.

---

### 3.6 `identity.roleClaims`

**TypeORM:** `src/domain/entities/identity/roleClaim.entity.ts`

**CRITICAL:** This entity does NOT extend `BaseEntity`. It defines its own `PrimaryGeneratedColumn('uuid')`.

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `roleId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid. Add FK. |
| `claimType` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `claimValue` | `varchar` | NO | — | `varchar` | NO | — | YES | — |

#### Notes

- No timestamps. **Action:** Preserve as-is.
- FK declared in migration (`roleClaims.roleId → roles.id`) but not in TypeORM entity decorators. **Action:** Add explicit FK in Drizzle.
- Constructor manually generates UUID. **Action:** Drizzle handles this via `defaultRandom()`.

---

### 3.7 `identity.userBiometrics`

**TypeORM:** `src/domain/entities/identity/userBiometric.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | NO | UNIQUE | `uuid` | NO | UNIQUE | **NO** | varchar-as-uuid. FK to users.id. |
| `profileImageUrl` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `defaultProfileImageUrl` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `privacy` | `enum ProfileImagePrivacy` | NO | `'Everyone'` | `pgEnum` | NO | `'Everyone'` | YES | Define `profileImagePrivacyEnum` |

#### Relations

| Relation | TypeORM | On Delete | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| OneToOne → User | `@OneToOne(() => User, u => u.biometrics)` | CASCADE | `one(users)` | YES | Match with `foreignKey` |

---

### 3.8 `identity.user_follows`

**TypeORM:** `src/domain/entities/userFollow.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `followerId` | `uuid` | NO | — | `uuid` | NO | — | YES | — |
| `followedId` | `uuid` | NO | — | `uuid` | NO | — | YES | — |
| `status` | `enum FollowStatus` | NO | `'accepted'` | `pgEnum` | NO | `'accepted'` | YES | Define `followStatusEnum` |

#### Indexes

| Index | TypeORM | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|---|
| Unique pair | `@Unique(['followerId', 'followedId'])` | followerId, followedId | YES | `unique('followerFollowed')` | YES | — |
| Follower idx | `@Index('idx_user_follows_follower')` | followerId | NO | `index('idx_user_follows_follower')` | YES | — |
| Followed idx | `@Index('idx_user_follows_followed')` | followedId | NO | `index('idx_user_follows_followed')` | YES | — |

#### Foreign Keys

| FK | TypeORM | On Delete | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| follower → users | `@ManyToOne(() => User)` | CASCADE | `foreignKey({ ... })` | YES | — |
| followed → users | `@ManyToOne(() => User)` | CASCADE | `foreignKey({ ... })` | YES | — |

---

## 4. Notification Schema

Schema: `notification` (PostgreSQL namespace)

---

### 4.1 `notification.notifications`

**TypeORM:** `src/domain/entities/notification/notification.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `metaData` | `json` | YES | — | `json('metaData')` | YES | — | YES | — |
| `type` | `enum NotificationType` | NO | — | `pgEnum` | NO | — | YES | Define `notificationTypeEnum` |
| `title` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `body` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `notifyId` | `uuid` | NO | — | `uuid` | NO | — | YES | — |
| `isLive` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | — |
| `sound` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | — |
| `readAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |

#### Notes

- No FK to users. **Action:** Consider adding `userId` FK column. Currently `notifyId` is a UUID but not linked to any entity.

---

### 4.2 `notification.notificationEvents`

**TypeORM:** `src/domain/entities/notification/notificationEvent.entity.ts`

**Empty entity** — only has `BaseEntity` columns. Likely a stub.

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |

#### Notes

- **Recommendation:** Consider removing if truly empty, or adding schema fields.

---

### 4.3 `notification.notificationTemplates`

**TypeORM:** `src/domain/entities/notification/notificationTemplate.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `name` | `varchar` | NO | — | `varchar` | NO | — | YES | — |

---

### 4.4 `notification.newsletter_subscribers`

**TypeORM:** `src/domain/entities/newsletterSubscriber.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `email` | `varchar(320)` | NO | UNIQUE | `varchar('email', { length: 320 })` | NO | UNIQUE | YES | Define unique constraint |

---

## 5. Analytics Schema

Schema: `analytics` (PostgreSQL namespace)

---

### 5.1 `analytics.analyticsEvents`

**TypeORM:** `src/domain/entities/analyticsEvent.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `eventName` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | YES | — | `uuid` | YES | — | **NO** | varchar-as-uuid. Consider FK. |
| `metadata` | `jsonb` | NO | `{}` | `jsonb('metadata')` | NO | `'{}'` | **PARTIAL** | Drizzle `jsonb` doesn't have native object default. Use `.default({})` or SQL literal. |

---

### 5.2 `analytics.premiumRollups`

**TypeORM:** `src/domain/entities/premiumRollup.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |
| `weekStartDate` | `timestamp` | NO | — | `timestamp` | NO | — | YES | — |
| `totalInteractions` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `topFeatureUsed` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `interactionBreakdown` | `jsonb` | NO | `{}` | `jsonb` | NO | `'{}'` | **PARTIAL** | jsonb default handling |

---

### 5.3 `analytics.youtubeChannelAnalytics`

**TypeORM:** `src/domain/entities/youtubeChannelAnalytics.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `channelId` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |
| `subscriberCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `viewCount` | `bigint` | NO | `0` | `bigint('viewCount')` | NO | `0n` | **PARTIAL** | Drizzle bigint uses `bigint` (JS BigInt). Ensure app code handles BigInt. |
| `videoCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `engagementMetrics` | `jsonb` | NO | `{}` | `jsonb` | NO | `'{}'` | **PARTIAL** | jsonb default |
| `estimatedMinutesWatched` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt handling |
| `averageViewDurationSeconds` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `subscribersGained` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `subscribersLost` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `likes` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `comments` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `shares` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `estimatedRevenueUsd` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `estimatedAdRevenueUsd` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `trafficSources` | `jsonb` | NO | `[]` | `jsonb` | NO | `'[]'` | **PARTIAL** | Array default in jsonb |
| `geography` | `jsonb` | NO | `[]` | `jsonb` | NO | `'[]'` | **PARTIAL** | Array default |
| `devices` | `jsonb` | NO | `[]` | `jsonb` | NO | `'[]'` | **PARTIAL** | Array default |
| `audience` | `jsonb` | NO | `{}` | `jsonb` | NO | `'{}'` | **PARTIAL** | Object default |
| `playbackLocations` | `jsonb` | NO | `[]` | `jsonb` | NO | `'[]'` | **PARTIAL** | Array default |
| `snapshotDate` | `date` | NO | — | `date` | NO | — | YES | — |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | channelId, snapshotDate | YES | `unique()` | YES | — |
| Composite | userId, snapshotDate | NO | `index()` | YES | — |

---

### 5.4 `analytics.youtubeVideoAnalytics`

**TypeORM:** `src/domain/entities/youtubeVideoAnalytics.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `videoId` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |
| `viewCount` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt |
| `likeCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `commentCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `favoriteCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `estimatedMinutesWatched` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt |
| `averageViewDurationSeconds` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `shares` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `publishedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `duration` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `snapshotDate` | `date` | NO | — | `date` | NO | — | YES | — |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | videoId, snapshotDate | YES | `unique()` | YES | — |
| Composite | userId, snapshotDate | NO | `index()` | YES | — |

---

### 5.5 `analytics.facebookPageAnalytics`

**TypeORM:** `src/domain/entities/facebookPageAnalytics.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `pageId` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |
| `followerCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `fanCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `impressions` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt |
| `reach` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt |
| `engagement` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `pageViews` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `clicks` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `snapshotDate` | `date` | NO | — | `date` | NO | — | YES | — |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | pageId, snapshotDate | YES | `unique()` | YES | — |
| Single | pageId | NO | `index()` | YES | — |
| Single | snapshotDate | NO | `index()` | YES | — |
| Single | engagement | NO | `index()` | YES | **CONSIDER** | Indexing `double precision` is unusual. Verify query patterns. |
| Single | impressions | NO | `index()` | YES | **CONSIDER** | Same — unusual index on bigint for analytics |
| Single | reach | NO | `index()` | YES | **CONSIDER** | Same |

---

### 5.6 `analytics.facebookPostAnalytics`

**TypeORM:** `src/domain/entities/facebookPostAnalytics.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `postId` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |
| `reach` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt |
| `impressions` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt |
| `engagement` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `reactionsCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `likeCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `loveCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `hahaCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `wowCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `sadCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `angryCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `commentCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `shareCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `clickCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `videoViews` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `averageWatchTime` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `publishedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `postType` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `snapshotDate` | `date` | NO | — | `date` | NO | — | YES | — |

#### Indexes (same pattern as facebookPageAnalytics)

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | postId, snapshotDate | YES | `unique()` | YES | — |
| Single | postId | NO | `index()` | YES | — |
| Single | snapshotDate | NO | `index()` | YES | — |
| Single | engagement | NO | `index()` | YES | CONSIDER |
| Single | impressions | NO | `index()` | YES | CONSIDER |
| Single | reach | NO | `index()` | YES | CONSIDER |

---

### 5.7 `analytics.facebookVideoAnalytics`

**TypeORM:** `src/domain/entities/facebookVideoAnalytics.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `videoId` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |
| `videoViews` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt |
| `uniqueViewers` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `threeSecondViews` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `oneMinuteViews` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `averageWatchTime` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `totalWatchTime` | `bigint` | NO | `0` | `bigint` | NO | `0n` | **PARTIAL** | BigInt |
| `completionRate` | `double precision` | NO | `0` | `doublePrecision` | NO | `0` | YES | — |
| `publishedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `duration` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `snapshotDate` | `date` | NO | — | `date` | NO | — | YES | — |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | videoId, snapshotDate | YES | `unique()` | YES | — |
| Single | videoId | NO | `index()` | YES | — |
| Single | snapshotDate | NO | `index()` | YES | — |

---

## 6. Public Schema

Schema: `public` (default PostgreSQL schema)

---

### 6.1 `linkedAccounts`

**TypeORM:** `src/domain/entities/linkedAccount.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid. Add FK. |
| `platform` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userName` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `profileImage` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `externalId` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `email` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `allowImport` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | — |
| `followersCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `followingCount` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `verified` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | — |
| `externalUrl` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `metaData` | `json` | YES | — | `json('metaData')` | YES | — | YES | — |
| `isVisible` | `boolean` | NO | `true` | `boolean` | NO | `true` | YES | — |
| `syncEnabled` | `boolean` | NO | `false` | `boolean` | NO | `false` | YES | — |

#### Notes

- No FK constraints declared. **Action:** Add FK to `identity.users.id`.
- No indexes besides PK. **Action:** Add index on `userId`.

---

### 6.2 `manualProfiles`

**TypeORM:** `src/domain/entities/manualProfile.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |
| `platform` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `isActive` | `boolean` | NO | `true` | `boolean` | NO | `true` | YES | — |
| `icon` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `url` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `displayOrder` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |

#### Notes

- FK declared via `@ManyToOne(() => User)` with `@JoinColumn({ name: 'userId' })`. **Action:** Drizzle `foreignKey`.

---

### 6.3 `rateLimits`

**TypeORM:** `src/domain/entities/rateLimit.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `ip` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `route` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `count` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `expiresAt` | `timestamp` | NO | — | `timestamp` | NO | — | YES | — |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | ip, route | YES | `unique()` | YES | — |

---

### 6.4 `rateLimitLogs`

**TypeORM:** `src/domain/entities/rateLimitLog.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `ip` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `route` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `count` | `integer` | NO | — | `integer` | NO | — | YES | — |
| `userId` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `expiredAt` | `timestamp` | NO | — | `timestamp` | NO | — | YES | — |

---

### 6.5 `userContents`

**TypeORM:** `src/domain/entities/userContent.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `uuid` | NO | — | `uuid` | NO | — | YES | — |
| `type` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `title` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `platform` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `externalId` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `text` | `text` | YES | — | `text` | YES | — | YES | — |
| `media` | `jsonb` | YES | — | `jsonb` | YES | — | YES | — |
| `publishedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `sourceUrl` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `engagement` | `jsonb` | YES | — | `jsonb` | YES | — | YES | — |
| `tags` | `simple-array` | YES | — | `text[]` | YES | — | **PARTIAL** | TypeORM `simple-array` is comma-separated varchar. Drizzle `text[]` is native PostgreSQL array. **Different storage format.** |
| `metaData` | `json` | YES | — | `json('metaData')` | YES | — | YES | — |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | userId, platform, externalId | YES | `unique()` | YES | — |

#### Notes

- FK to `identity.users.id` added in migration `1783167267345`. **Action:** Ensure Drizzle `references`.

---

### 6.6 `contentStreams`

**TypeORM:** `src/domain/entities/contentStream.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `type` | `enum StreamEntityType` | NO | — | `pgEnum` | NO | — | YES | Define `streamEntityTypeEnum` |
| `subType` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `title` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `platform` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `externalId` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `metaData` | `json` | YES | — | `json('metaData')` | YES | — | YES | — |

---

### 6.7 `searchHistories`

**TypeORM:** `src/domain/entities/searchHistroy.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `originalQuery` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `normalizedQuery` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `userId` | `varchar` | YES | — | `varchar` | YES | — | YES | — |

#### Notes

- `userId` has `?` in TS but no `nullable` in `@Column`. Verify DB column nullability. Entity declares `@Column()` without `nullable: true`, so DB should be `NOT NULL`.

---

### 6.8 `dataProtectionKeys`

**TypeORM:** `src/domain/entities/dataProtectionKey.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `key` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `value` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `expiresIn` | `integer` | YES | — | `integer` | YES | — | YES | — |

---

### 6.9 `topics`

**TypeORM:** `src/domain/entities/topic.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `name` | `varchar` | NO | UNIQUE | `varchar` | NO | UNIQUE | YES | — |
| `description` | `text` | YES | — | `text` | YES | — | YES | — |
| `icon` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `isActive` | `boolean` | NO | `true` | `boolean` | NO | `true` | YES | — |

---

### 6.10 `userTopics`

**TypeORM:** `src/domain/entities/userTopic.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |
| `topicId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Unique pair | userId, topicId | YES | `unique()` | YES | — |
| Single | userId | NO | `index('idx_user_topics_user')` | YES | — |
| Single | topicId | NO | `index('idx_user_topics_topic')` | YES | — |

#### Foreign Keys

| FK | TypeORM | On Delete | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| userId → users | `@ManyToOne(() => User)` | CASCADE | `foreignKey` | YES | — |
| topicId → topics | `@ManyToOne(() => Topic)` | CASCADE | `foreignKey` | YES | — |

---

### 6.11 `userPreferences`

**TypeORM:** `src/domain/entities/identity/userPreference.entity.ts`

**CRITICAL:** Uses `PrimaryColumn('uuid')` (not auto-generated). PK = userId.

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `userId` | `uuid` (PK) | NO | — | `uuid` (PK) | NO | — | **PARTIAL** | No `defaultRandom()`. Must be explicitly provided. |
| `theme` | `enum Theme` | NO | `'System'` | `pgEnum` | NO | `'System'` | YES | Define `themeEnum` |
| `notificationChannelsEnabled` | `enum NotificationChannel[]` | NO | — | `pgEnum[]` (array) | NO | — | **PARTIAL** | TypeORM `array: true` on enum → PostgreSQL `text[]` or `enum[]`. Drizzle: `pgEnum` + `.array()`. Verify actual DB column type. |

#### Notes

- No audit columns (this entity does not extend BaseEntity).
- FK to users: `@OneToOne(() => User)` with `onDelete: 'CASCADE'`.
- **Action:** Ensure `notificationChannelsEnabled` is stored as PostgreSQL array of enum values.

---

### 6.12 `playlists`

**TypeORM:** `src/domain/entities/collection/playlist.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `name` | `varchar(255)` | NO | — | `varchar('name', { length: 255 })` | NO | — | YES | — |
| `referenceId` | `varchar(255)` | NO | UNIQUE | `varchar('referenceId', { length: 255 })` | NO | UNIQUE | YES | — |
| `description` | `text` | YES | — | `text` | YES | — | YES | — |
| `displayOrder` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |

#### Notes

- `@BeforeInsert()` hook generates `referenceId` from name + nanoid. **Action:** Implement in app-level insert logic.
- FK to user: `@ManyToOne(() => User)` as `owner` → stored as `ownerId` in DB.
- OneToMany to `playlistMembers` and `playlistContent` with cascade `['insert']`.

---

### 6.13 `playlistMembers`

**TypeORM:** `src/domain/entities/collection/playlistMember.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `role` | `enum PlaylistMemberRole` | NO | `'Viewer'` | `pgEnum` | NO | `'Viewer'` | YES | Define `playlistMemberRoleEnum` |
| `joinedAt` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `removedAt` | `timestamp` | YES | — (soft delete) | `timestamp` | YES | — | **PARTIAL** | TypeORM `@DeleteDateColumn()` enables soft deletes. Drizzle: use nullable `removedAt` column manually. |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | playlist, user | YES | `unique()` | YES | — |

#### Notes

- FK to `playlists` and `users`. Both with `onDelete: 'CASCADE'`.
- **`@DeleteDateColumn`**: TypeORM soft-delete pattern. Drizzle has no built-in equivalent. **Action:** Manually filter `WHERE removedAt IS NULL` in queries.

---

### 6.14 `playlistContent`

**TypeORM:** `src/domain/entities/collection/playlistContent.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `type` | `varchar(255)` | NO | — | `varchar('type', { length: 255 })` | NO | — | YES | — |
| `platform` | `varchar(30)` | NO | — | `varchar('platform', { length: 30 })` | NO | — | YES | — |
| `contentId` | `varchar(255)` | NO | — | `varchar('contentId', { length: 255 })` | NO | — | YES | — |
| `contentUrl` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `title` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `description` | `text` | YES | — | `text` | YES | — | YES | — |
| `thumbnailUrl` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `metadata` | `json` | YES | — | `json('metadata')` | YES | — | YES | — |

#### Notes

- FK to `playlists` (CASCADE) and `playlistMembers` (SET NULL on `addedById`).

---

### 6.15 `youtube_accounts`

**TypeORM:** `src/domain/entities/youtubeAccount.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | NO | — | `uuid` | NO | — | **NO** | varchar-as-uuid. Add FK. |
| `channelId` | `varchar` | NO | UNIQUE | `varchar` | NO | UNIQUE | YES | — |
| `channelTitle` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `accessToken` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `refreshToken` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `tokenExpiry` | `timestamp` | NO | — | `timestamp` | NO | — | YES | — |
| `connected` | `boolean` | NO | `true` | `boolean` | NO | `true` | YES | — |
| `disconnectedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |

#### Notes

- No FK constraint to users. **Action:** Add FK.
- Index on `channelId` (unique) declared at entity level.

---

### 6.16 `youtube_videos`

**TypeORM:** `src/domain/entities/youtubeVideo.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `accountId` | `varchar` | NO | INDEX | `uuid` | NO | INDEX | **NO** | varchar-as-uuid. Add FK to youtube_accounts. |
| `youtubeVideoId` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `title` | `varchar` | NO | — | `varchar` | NO | — | YES | — |
| `description` | `text` | YES | — | `text` | YES | — | YES | — |
| `visibility` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `publishAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `publishedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `status` | `varchar` | NO | `'draft'` | `varchar` | NO | `'draft'` | YES | — |
| `thumbnailUrl` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `youtubeUrl` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `videoUrl` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `r2Key` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `tags` | `simple-array` | YES | — | `text[]` | YES | — | **PARTIAL** | Same `simple-array` vs `text[]` issue as userContents |

#### Notes

- FK to youtube_accounts not declared in entity. **Action:** Add FK in Drizzle.
- Index on `accountId`.

---

### 6.17 `youtube_analytics`

**TypeORM:** `src/domain/entities/youtubeAnalytic.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `videoId` | `varchar` | NO | INDEX | `varchar` | NO | INDEX | YES | — |
| `views` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `likes` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `comments` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `watchTime` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `snapshotDate` | `timestamp` | NO | — | `timestamp` | NO | — | YES | — |

#### Indexes

| Index | Columns | Unique | Drizzle | Compatible | Action |
|---|---|---|---|---|---|
| Composite | videoId, snapshotDate | YES | `unique()` | YES | — |
| Single | videoId | NO | `index()` | YES | — |

---

### 6.18 `upload_jobs`

**TypeORM:** `src/domain/entities/uploadJob.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `videoId` | `varchar` | YES | INDEX | `uuid` | YES | INDEX | **NO** | varchar-as-uuid. Add FK to youtube_videos. |
| `status` | `varchar` | NO | `'pending'` | `varchar` | NO | `'pending'` | YES | — |
| `attempts` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `progress` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `statusMessage` | `text` | YES | — | `text` | YES | — | YES | — |
| `lastError` | `text` | YES | — | `text` | YES | — | YES | — |
| `nextRetryAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `r2Key` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `fileSize` | `bigint` | YES | — | `bigint` | YES | — | **PARTIAL** | BigInt handling |

---

### 6.19 `publish_jobs`

**TypeORM:** `src/domain/entities/publishJob.entity.ts`

| Column | TypeORM | Nullable | Default | Drizzle | Nullable | Default | Compatible | Action |
|---|---|---|---|---|---|---|---|---|
| `id` | `uuid` (PK) | NO | `uuid_generate_v4()` | `uuid` (PK) | NO | `gen_random_uuid()` | YES | — |
| `createdBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `createdOn` | `timestamp` | NO | `now()` | `timestamp` | NO | `now()` | YES | — |
| `lastModifiedBy` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `lastModifiedOn` | `timestamp` | YES | `now()` | `timestamp` | YES | `now()` | YES | — |
| `lastRefreshed` | `timestamp` | NO | `CURRENT_TIMESTAMP` | `timestamp` | NO | `now()` | YES | — |
| `userId` | `varchar` | NO | INDEX | `uuid` | NO | INDEX | **NO** | varchar-as-uuid. Add FK. |
| `linkedAccountId` | `varchar` | NO | INDEX | `uuid` | NO | INDEX | **NO** | varchar-as-uuid. Add FK. |
| `platform` | `varchar` | NO | INDEX | `varchar` | NO | INDEX | YES | — |
| `uploadId` | `varchar` | YES | INDEX | `uuid` | YES | INDEX | **NO** | varchar-as-uuid. FK to upload_jobs. |
| `r2Key` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `fileSize` | `bigint` | YES | — | `bigint` | YES | — | **PARTIAL** | BigInt |
| `status` | `varchar` | NO | `'pending'` | `varchar` | NO | `'pending'` | YES | — |
| `attempts` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `progress` | `integer` | NO | `0` | `integer` | NO | `0` | YES | — |
| `statusMessage` | `text` | YES | — | `text` | YES | — | YES | — |
| `lastError` | `text` | YES | — | `text` | YES | — | YES | — |
| `nextRetryAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `platformContentId` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `platformContentUrl` | `varchar` | YES | — | `varchar` | YES | — | YES | — |
| `expiresAt` | `timestamp` | NO | — | `timestamp` | NO | — | YES | — |
| `r2CleanedAt` | `timestamp` | YES | — | `timestamp` | YES | — | YES | — |
| `metadata` | `jsonb` | YES | — | `jsonb` | YES | — | YES | — |

---

## 7. Tables Missing From Current Schema

These tables do NOT exist in the current TypeORM codebase. They would be needed for a complete application.

| Table | Purpose | TypeORM Status | Drizzle Action |
|---|---|---|---|
| `posts` | User-generated content/posts | MISSING | Create new Drizzle table |
| `comments` | Post comments | MISSING | Create new Drizzle table |
| `likes` | Post/comment likes | MISSING | Create new Drizzle table |
| `verification` | Email/phone verification tokens | MISSING | Create new Drizzle table |
| `password_reset` | Password reset tokens | MISSING | Create new Drizzle table |
| `oauth_accounts` | OAuth provider accounts (Google, etc.) | Partially in `linkedAccounts` | Clarify scope vs linkedAccounts |
| `media` | Media/file uploads | Partially in `userContents.media` JSONB | Consider dedicated table |
| `sessions` | Server-side sessions | Partially in `identity.userLogins` | Clarify scope |
| `activity` | User activity feed | Partially in `analytics.analyticsEvents` | Consider dedicated table |
| `settings` | System/app settings | MISSING | Create new Drizzle table |
| `permissions` | Fine-grained permissions | Partially in `identity.roleClaims` / `identity.userClaims` | Clarify scope |

---

## 8. Enum Comparison

### All TypeORM Enums (from `src/domain/enums.ts`)

| Enum | Values | TypeORM Definition | Drizzle Equivalent | Compatible | Action |
|---|---|---|---|---|---|
| `UserType` | `'Admin'`, `'Guest'`, `'User'` | `enum UserType` column | `pgEnum('users_type_enum', ['Admin','Guest','User'])` | YES | — |
| `RoleType` | `'System'`, `'Regular'` | `enum RoleType` column | `pgEnum('roles_type_enum', ['System','Regular'])` | YES | — |
| `NotificationType` | `'Import'` | `enum NotificationType` column | `pgEnum('notifications_type_enum', ['Import'])` | YES | — |
| `NotificationStatus` | `'In-Progress'`, `'Completed'`, `'Cancelled'`, `'Failed'` | Not used in any entity column | **N/A** | N/A | Unused enum. Consider removing or adding to relevant entity. |
| `Theme` | `'System'`, `'Light'`, `'Dark'` | `enum Theme` column | `pgEnum('theme_enum', ['System','Light','Dark'])` | YES | — |
| `NotificationChannel` | `'inApp'`, `'email'`, `'push'` | `enum NotificationChannel[]` (array) | `pgEnum` + `.array()` | **PARTIAL** | Verify PostgreSQL storage is `enum[]` not `text[]` |
| `PlaylistMemberRole` | `'Owner'`, `'Editor'`, `'Viewer'` | `enum PlaylistMemberRole` column | `pgEnum('playlistMembers_role_enum', ['Owner','Editor','Viewer'])` | YES | — |
| `StreamEntityType` | `'Profile'`, `'Content'`, `'Community'` | `enum StreamEntityType` column | `pgEnum('contentStreams_type_enum', ['Profile','Content','Community'])` | YES | — |
| `ProfileImagePrivacy` | `'Everyone'`, `'Interactions'` | `enum ProfileImagePrivacy` column | `pgEnum('userBiometrics_privacy_enum', ['Everyone','Interactions'])` | YES | — |
| `ProfilePrivacy` | `'Public'`, `'Private'` | `enum ProfilePrivacy` column | `pgEnum('users_profilePrivacy_enum', ['Public','Private'])` | YES | — |
| `FollowStatus` | `'requested'`, `'accepted'`, `'blocked'` | `enum FollowStatus` column | `pgEnum('user_follows_status_enum', ['requested','accepted','blocked'])` | YES | — |
| `OnboardingStep` | `'NotStarted'`, `'ProfileData'`, `'Topics'`, `'Platforms'`, `'Confirmation'`, `'Completed'` | `enum OnboardingStep` column | `pgEnum('users_onboardingStep_enum', [...])` | YES | — |
| `YouTubeUserContentFilters` | Various | Not used as DB column | **N/A** | N/A | Query filter only |
| `YouTubeOnlineFilters` | Various | Not used as DB column | **N/A** | N/A | Query filter only |
| `FacebookUserContentFilters` | Various | Not used as DB column | **N/A** | N/A | Query filter only |
| `FacebookOnlineFilters` | Various | Not used as DB column | **N/A** | N/A | Query filter only |
| `PostType` | Various | Not used in any entity | MISSING | **NO** | Needed if posts table is added |

---

## 9. Global Compatibility Matrix

### 9A. Cross-Table Pattern Summary

| Pattern | TypeORM Approach | Drizzle Approach | Compatible | Action Required |
|---|---|---|---|---|
| **UUID PKs** | `PrimaryGeneratedColumn('uuid')` | `uuid().primaryKey().defaultRandom()` | YES | — |
| **Auto-increment PK** | `PrimaryGeneratedColumn('increment')` on UserClaim | `serial().primaryKey()` or `integer().primaryKey().generatedAlwaysAsIdentity()` | YES | — |
| **UUID PK (manual)** | `PrimaryColumn('uuid')` on UserPreference | `uuid().primaryKey()` | YES | — |
| **Audit columns** | `BaseEntity` class + `@BeforeInsert`/`@BeforeUpdate` | Shared `baseColumns` object + app-level hooks | PARTIAL | Need middleware or trigger for `createdOn`/`lastModifiedOn` auto-set |
| **CreateDateColumn** | Auto-set on INSERT | `defaultNow()` + manual set in code | PARTIAL | Drizzle doesn't auto-set; use `$onInsert` callback or DB trigger |
| **UpdateDateColumn** | Auto-set on UPDATE | `defaultNow()` + manual set in code | PARTIAL | Drizzle doesn't auto-set; use `$onUpdate` callback or DB trigger |
| **DeleteDateColumn** | Soft delete via `@DeleteDateColumn` | Nullable `removedAt` column | PARTIAL | Manual WHERE filtering in queries |
| **Enums** | `type: 'enum', enum: MyEnum` | `pgEnum()` + column reference | YES | — |
| **Enum arrays** | `type: 'enum', enum: X, array: true` | `pgEnum().array()` | PARTIAL | Verify actual DB type |
| **JSON columns** | `type: 'json'` or `type: 'jsonb'` | `json()` or `jsonb()` | YES | — |
| **JSONB defaults** | `default: {}` or `default: []` | `.default(sql`'{}'`)` or `.default([])` | PARTIAL | Need SQL template for `{}` defaults |
| **simple-array** | `type: 'simple-array'` → comma-separated `varchar` | `text[]` → native PostgreSQL array | **NO** | Different storage format. Migration needed. |
| **Unique constraints** | `@Column({ unique: true })` or `@Unique(...)` | `unique('name')` on column or table level | YES | — |
| **Composite unique** | `@Unique(['col1', 'col2'])` | `unique('name').on(col1, col2)` | YES | — |
| **Indexes** | `@Index('name')` on column or `@Index(['col'])` on entity | `index('name').on(col)` | YES | — |
| **Composite indexes** | `@Index(['col1', 'col2'])` | `index('name').on(col1, col2)` | YES | — |
| **ManyToOne FK** | `@ManyToOne(() => Target)` | `foreignKey({ columns: [...], foreignColumns: [...] })` | YES | — |
| **OneToOne FK** | `@OneToOne(() => Target)` + `@JoinColumn` | `foreignKey()` + relation | YES | — |
| **OneToMany** | `@OneToMany(() => Target, t => t.backRef)` | `many()` in `relations()` | YES | — |
| **Cascade** | `{ cascade: true }` or `{ cascade: ['insert'] }` | Not built into schema; handle in application logic | **NO** | Drizzle has no cascade option in relations |
| **ON DELETE** | `{ onDelete: 'CASCADE' }` | `foreignKey({ onDelete: 'cascade' })` | YES | — |
| **Eager loading** | `{ eager: true }` | Not supported; use joins manually | **NO** | Drizzle requires explicit joins |
| **BeforeInsert hook** | `@BeforeInsert()` decorator | Application-level or `$onInsert` callback | PARTIAL | Must handle in service layer |
| **BeforeUpdate hook** | `@BeforeUpdate()` decorator | Application-level or `$onUpdate` callback | PARTIAL | Must handle in service layer |
| **Constructor defaults** | Set in `constructor(request)` | Set at insert time | PARTIAL | Ensure all defaults are explicit in schema |

### 9B. Critical Incompatibilities

| # | Issue | Tables Affected | Severity | Resolution |
|---|---|---|---|---|
| 1 | **`simple-array` vs `text[]`** — Different storage format (comma-separated varchar vs native PostgreSQL array) | `userContents.tags`, `youtube_videos.tags` | HIGH | Create migration to convert data. Update queries to use `ANY()` instead of `LIKE`. |
| 2 | **`varchar` columns storing UUIDs** — TypeORM entities declare `@Column()` (no type) but reference UUIDs. Migration created them as `varchar`. | `userRoles.userId/roleId`, `userLogins.userId`, `userClaims.userId`, `roleClaims.roleId`, `userTopics.userId/topicId`, `userBiometrics.userId`, `linkedAccounts.userId`, `manualProfiles.userId`, `analyticsEvents.userId`, `premiumRollups.userId`, all analytics `userId`, `youtube_accounts.userId`, `youtube_videos.accountId`, `upload_jobs.videoId`, `publish_jobs.userId/linkedAccountId/uploadId` | HIGH | Drizzle should use `uuid()` type. **Requires data migration**: `ALTER COLUMN ... TYPE uuid USING ...::uuid`. |
| 3 | **Missing FK constraints** — Many tables reference users but have no FK in DB | `userRoles`, `userLogins`, `userClaims`, `roleClaims`, `linkedAccounts`, `youtube_accounts`, `upload_jobs`, `publish_jobs`, `analyticsEvents`, `premiumRollups`, all analytics tables | HIGH | Add FK constraints in Drizzle schema. Verify no orphans first. |
| 4 | **No `cascade` in Drizzle relations** — TypeORM `{ cascade: true }` doesn't exist in Drizzle | `User.biometrics`, `Playlist.members`, `Playlist.contents` | MEDIUM | Handle cascading inserts/updates in application code. |
| 5 | **`@DeleteDateColumn` soft delete** — No Drizzle equivalent | `playlistMembers.removedAt` | MEDIUM | Manual `WHERE removedAt IS NULL` in all queries touching this table. |
| 6 | **`@CreateDateColumn` / `@UpdateDateColumn`** auto-set behavior | All tables with BaseEntity columns | MEDIUM | Use DB triggers or `$onInsert`/`$onUpdate` callbacks in Drizzle. |
| 7 | **`eager: true`** not supported in Drizzle | `UserBiometric` (via User), manual profiles | LOW | Always use explicit joins/selects. |
| 8 | **jsonb object/array defaults** | Analytics tables (trafficSources, geography, devices, etc.) | LOW | Use `sql` template literals: `.default(sql`'[]'`)` |

---

## 10. Action Items Summary

### Priority 1 — Critical (Data Integrity)

| # | Action | Tables | Effort |
|---|---|---|---|
| A1 | Create UUID migration for `varchar` → `uuid` columns | 17 tables affected | High |
| A2 | Add missing FK constraints | 12+ tables | High |
| A3 | Convert `simple-array` to `text[]` (or keep and align) | `userContents`, `youtube_videos` | Medium |

### Priority 2 — Important (Feature Parity)

| # | Action | Tables | Effort |
|---|---|---|---|
| A4 | Implement audit column auto-set (triggers or middleware) | All BaseEntity tables | Medium |
| A5 | Implement soft-delete filtering pattern | `playlistMembers` | Low |
| A6 | Implement `@BeforeInsert` equivalent for derived columns | `users` (normalizedEmail, normalizedUserName), `roles` (normalizedName), `playlists` (referenceId) | Low |
| A7 | Define all `pgEnum` types in Drizzle schema | 11 enums | Low |
| A8 | Handle jsonb defaults for analytics tables | 7 analytics tables | Low |

### Priority 3 — Future (Missing Tables)

| # | Action | Tables | Effort |
|---|---|---|---|
| A9 | Design and create `posts` table | New | High |
| A10 | Design and create `comments` table | New | Medium |
| A11 | Design and create `likes` table | New | Medium |
| A12 | Design and create `verification` table | New | Low |
| A13 | Design and create `password_reset` table | New | Low |
| A14 | Clarify `oauth_accounts` vs `linkedAccounts` scope | Existing | Low |
| A15 | Design `permissions` table (separate from roleClaims/userClaims) | New | Medium |
| A16 | Design `activity` table (separate from analyticsEvents) | New | Medium |

---

## Appendix: Drizzle Schema File Structure (Target)

```
src/
  db/
    schema/
      base.ts              # Shared base columns
      enums.ts             # All pgEnum definitions
      index.ts             # Barrel export
      identity/
        users.ts
        roles.ts
        userRoles.ts
        userLogins.ts
        userClaims.ts
        roleClaims.ts
        userBiometrics.ts
        userFollows.ts
      notification/
        notifications.ts
        notificationEvents.ts
        notificationTemplates.ts
        newsletterSubscribers.ts
      analytics/
        analyticsEvents.ts
        premiumRollups.ts
        youtubeChannelAnalytics.ts
        youtubeVideoAnalytics.ts
        facebookPageAnalytics.ts
        facebookPostAnalytics.ts
        facebookVideoAnalytics.ts
      public/
        linkedAccounts.ts
        manualProfiles.ts
        rateLimits.ts
        rateLimitLogs.ts
        userContents.ts
        contentStreams.ts
        searchHistories.ts
        dataProtectionKeys.ts
        topics.ts
        userTopics.ts
        userPreferences.ts
        playlists.ts
        playlistMembers.ts
        playlistContent.ts
        youtubeAccounts.ts
        youtubeVideos.ts
        youtubeAnalytics.ts
        uploadJobs.ts
        publishJobs.ts
```

---

> **Generated:** 2026-07-19
> **Source:** 38 TypeORM entities, 44 migrations, `src/domain/enums.ts`
> **Total columns analyzed:** 500+
> **Total indexes analyzed:** 40+
> **Total FK relationships analyzed:** 25+
> **Critical issues found:** 8
