# 08 — Master Architecture Review

> **Review Gate**: Final production-readiness assessment before implementation.
> **Reviewers**: Lead Software Architect, Principal Database Engineer, Principal Backend Engineer, Auth & Identity Architect, Security Reviewer, Performance Reviewer, Build & Release Engineer, QA Lead.
> **Date**: 2026-07-19
> **Documents Reviewed**: 01–07 (7 planning documents)
> **Repositories Validated**: Project A (`E:\Github\gaddep`), Project B Backend (`E:\gaddr-backend-api`), Project B Frontend (`E:\SocialApp`)

---

# Executive Summary

This review evaluates whether the proposed shared-database, shared-auth architecture is production-ready for implementation. After exhaustive cross-referencing of all 7 planning documents against all 3 repositories, the review identifies **4 critical findings** that block implementation, **8 major findings** requiring resolution before implementation proceeds, and **12 minor findings** that should be addressed but do not block.

**The core blocker is a fundamental contradiction in the proposed architecture**: Document 07 proposes removing auth code (registration, password reset, OAuth, 2FA) from Project B, yet the frontend (`E:\SocialApp`) exclusively calls Project B's REST API endpoints for ALL authentication operations. Removing these endpoints breaks every user flow. The frontend cannot be changed per the stated constraint.

Additionally, the two projects use **different user table schemas** (`public.user` in Project A vs `identity.users` in Project B) with **different PK types** (text vs UUID), **different password hashing algorithms** (Argon2id vs bcrypt), and **different session models** (database-backed sessions vs JWT). The planning documents do not adequately reconcile these incompatibilities.

---

# Overall Readiness

## ❌ NOT READY FOR IMPLEMENTATION

The architecture has **4 critical blockers** that must be resolved before any implementation begins. The implementation plans (06, 07) contain contradictory directives that, if followed, would break the frontend and existing production data.

---

# Cross-Document Consistency Review

## Finding ARCH-001 — Contradictory Auth Ownership

**Severity**: CRITICAL

**Source Documents**:
- 04_Shared_Identity_Architecture.md (§6.2: "Keep JWT as primary. Retire Better Auth.")
- 06_ProjectA_Implementation_Plan.md (§10: "Remove Better Auth entirely. Replace with custom JWT.")
- 07_ProjectB_Implementation_Plan.md (§2: "Remove auth flows Project A owns — registration, password reset, 2FA, OAuth, profile updates")

**Repository Evidence**:
- **Frontend** (`E:\SocialApp\src\services\apiClient.service.ts`): All API calls go to `NEXT_PUBLIC_API_BASE_URL` = `http://localhost:8080/api/v1` (Project B)
- **Frontend** (`E:\SocialApp\src\app\(auth)\login\LoginFormClient.tsx`): Calls `apiClient.Token.loginAsync()` → `POST /api/v1/auth/access-token` (Project B)
- **Frontend** (`E:\SocialApp\src\app\(auth)\signup\SignupFormClient.tsx`): Calls `apiClient.Account.registerNewUserAsync()` → `POST /api/v1/account/register` (Project B)
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\auth\index.ts`): Better Auth runs at `/api/auth/[...all]` (Next.js API route)

**Description**: Document 07 proposes deleting 14 auth feature directories from Project B (registration, password reset, forgot-password, email-verify, 2FA setup/enable/disable/verify, Google/Facebook OAuth, profile updates, onboarding). However, the frontend exclusively calls Project B's REST API endpoints for ALL of these operations. The frontend has NO Better Auth client — it uses `restfit` to call Project B's NestJS endpoints.

**Impact**: If 07 is followed as written, every frontend auth flow breaks: login, register, password reset, OAuth, 2FA, profile update, onboarding. The frontend constraint ("must NOT change") makes this a hard blocker.

**Recommendation**: The correct architecture is:
- Project A owns the **schema** (user table definition, migrations)
- Project B owns the **auth code** (endpoints, handlers, JWT generation)
- Both projects share the same database
- Project B reads from the shared user table, writes JWT tokens, manages sessions
- Registration, password reset, OAuth, 2FA code continue to be served by Project B endpoints
- Project A uses Better Auth internally for its own Next.js app, but the shared auth is via the database schema

**Blocks Implementation?**: YES

---

## Finding ARCH-002 — Contradictory User Table Identity

**Severity**: CRITICAL

**Source Documents**:
- 01_ProjectA_Architecture.md (§4: User table is `public.user`, 38 columns, text PK)
- 02_ProjectB_Architecture.md (§3: User entity is `identity.users`, 30+ columns, UUID PK)
- 03_Schema_Comparison.md (§3.1: Full column comparison of `identity.users`)
- 07_ProjectB_Implementation_Plan.md (§3.1: Proposes rewriting User entity to match Project A's 38 columns)

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts:12-57`): `pgTable("user", { id: text("id").primaryKey(), ... })` — text PK, 38 columns, snake_case DB names
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\user.entity.ts`): `@Entity({ name: 'users', schema: 'identity' })` — UUID PK, 30+ columns, camelCase entity
- **RESTORE_REPORT.md**: Documents two separate user tables in the same database: `public.user` (49 rows) and `identity.users` (14 rows)

**Description**: Project A and Project B currently use **two different user tables** in the same PostgreSQL database:
- Project A: `public.user` (text PK, Better Auth-managed, 38 columns)
- Project B: `identity.users` (UUID PK, TypeORM-managed, 30+ columns)

These tables have different primary key types, different column sets, different naming conventions (snake_case DB vs camelCase entity), and different default values. The planning documents propose that Project B's entity should be rewritten to match Project A's table, but do not address the PK type incompatibility or the data migration path for merging 14+49=63 user rows across two tables.

**Impact**: Without resolving which table is canonical and migrating all data into it, the shared-database goal is unachievable. FK constraints from Project B's 18+ feature tables reference `identity.users.id` (UUID). If Project B switches to reading `public.user.id` (text), all FK constraints break.

**Recommendation**:
1. Designate ONE canonical user table (recommended: `identity.users` with UUID PK, since it has 18+ FK dependencies)
2. Migrate Project A's `public.user` data into `identity.users`
3. Project A switches to reading `identity.users` instead of `public.user`
4. Add missing columns from Project A's schema to `identity.users` (isVerified, stripeCustomerId, etc.)
5. Drop the old `public.user` table after all references are updated

**Blocks Implementation?**: YES

---

## Finding ARCH-003 — Contradictory Table Ownership for Split Tables

**Severity**: MAJOR

**Source Documents**:
- 04_Shared_Identity_Architecture.md (§3.1: Proposes `user_profiles`, `user_security`, `user_preferences` tables in identity schema)
- 07_ProjectB_Implementation_Plan.md (§2.2: "Delete `userBiometric.entity.ts` — Project A owns", "Delete `userPreference.entity.ts` — Project A owns")

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\userBiometric.entity.ts`): TypeORM entity managing profile images
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\userPreference.entity.ts`): TypeORM entity for user preferences
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts`): Does NOT have `user_profiles`, `user_security`, or `user_preferences` tables

**Description**: Document 04 proposes splitting the fat User table into 5 tables (`users`, `user_profiles`, `user_security`, `user_preferences`, `user_oauth_providers`). Document 06 lists these as new files to create in Project A. However, Document 07 simultaneously tells Project B to delete its existing entity files for biometrics and preferences, claiming "Project A owns" them. But Project A does NOT currently have these tables — they would need to be created by the migration.

**Impact**: If Project B deletes its entities before Project A creates the new split tables, Project B has no way to access user data during the transition period. The execution order is unclear.

**Recommendation**: Clarify the execution sequence:
1. Phase 1: Project A creates split tables (non-breaking, additive)
2. Phase 2: Project A migrates data from fat User to split tables
3. Phase 3: Both projects read from split tables simultaneously
4. Phase 4: Project B adapts its entities to read from new tables
5. Phase 5: Old columns dropped

**Blocks Implementation?**: YES

---

## Finding ARCH-004 — Schema Owner Cannot Remove Auth From Consumer

**Severity**: CRITICAL

**Source Documents**:
- 07_ProjectB_Implementation_Plan.md (§2: Lists 14 auth feature directories to delete from Project B)
- 06_ProjectA_Implementation_Plan.md (§10: Lists 9 auth files to remove/rewrite in Project A)

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\auth\index.ts`): Better Auth config — this is Next.js-specific, uses `drizzleAdapter`, runs inside Next.js API routes
- **Project B** (`E:\gaddr-backend-api\src\features\auth\login\login.handler.ts`): NestJS CQRS handler with bcrypt password verification
- **Project B** (`E:\gaddr-backend-api\src\modules\auth.module.ts`): Wires auth handlers as NestJS module
- **Frontend** (`E:\SocialApp\src\services\apiClient.service.ts`): `baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL` → `http://localhost:8080/api/v1` (Project B)

**Description**: The stated constraint is "Project A remains the ONLY schema owner. Project B adapts to the shared schema." However, 06 and 07 propose far more than schema ownership — they propose removing entire auth feature sets from both projects and rewriting them. Project A's Better Auth is a Next.js-specific library that runs inside `gaddr-jobs/src/server/auth/index.ts` using `drizzleAdapter(db)`. It cannot serve as the auth backend for Project B's NestJS API. The two apps use completely different frameworks (Next.js vs NestJS), different ORM layers (Drizzle vs TypeORM), and different server runtimes.

**Impact**: Project A's Better Auth instance is designed for Next.js server-side rendering and API routes. It is NOT an API server. Project B's NestJS app IS the API server that the frontend calls. Removing auth from Project B means the frontend has no auth endpoint to call.

**Recommendation**: Schema ownership ≠ Auth code ownership. The correct model is:
- **Schema ownership**: Project A defines the `identity.users` table schema in Drizzle, generates migrations
- **Auth code ownership**: Project B implements the auth endpoints (login, register, JWT, etc.) in NestJS, reading from the shared schema
- **Cross-project auth**: Project A's Next.js app can call Project B's API endpoints for auth, or use Better Auth to validate sessions from the shared database

**Blocks Implementation?**: YES

---

# Repository Consistency Review

## Finding REPO-001 — PK Type Mismatch Across All FK References

**Severity**: CRITICAL

**Source Documents**:
- 01_ProjectA_Architecture.md (§4: `id: text("id").primaryKey()`)
- 03_Schema_Comparison.md (§3.1: `userId: varchar` in TypeORM refers to UUID)

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts:14`): `id: text("id").primaryKey()` — text PK
- **Project B** (`E:\gaddr-backend-api\src\domain\baseEntity.ts:14`): `@PrimaryGeneratedColumn('uuid') id: string` — UUID PK
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts:65-82`): `session.userId: text` — text FK to user.id
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\userRole.entity.ts`): `userId: string` — stores UUID strings in varchar columns

**Description**: Project A uses `text` PKs (UUID format stored as text). Project B uses PostgreSQL `uuid` type PKs. These are different PostgreSQL data types. A `text` column containing a UUID string and a `uuid` column are NOT directly comparable for FK constraints. Project B's 18+ feature tables have FK references to `identity.users.id` using varchar columns that store UUID values. If Project B switches to reading Project A's `public.user` table (text PK), all FK references must change from uuid to text, which is a massive schema migration.

**Impact**: Every FK constraint, every join query, every TypeORM relation decorator, and every BullMQ job payload that references user IDs would need to change. This is a database-wide migration affecting all 4 schemas.

**Recommendation**: Migrate Project A's user table to UUID PK type BEFORE the shared-database integration. This is documented in `05_Migration_Strategy.md` Phase 2 but needs to be the FIRST action taken, not Phase 2.

**Blocks Implementation?**: YES

---

# Shared User Model Review

## Finding USER-001 — Password Hashing Algorithm Incompatibility

**Severity**: MAJOR

**Source Documents**:
- 01_ProjectA_Architecture.md (§2.4: Argon2id via `@node-rs/argon2`)
- 02_ProjectB_Architecture.md (§2: bcrypt with cost 10)

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\package.json`): `"@node-rs/argon2": "^2.0.2"` (trustedDependency)
- **Project A**: Better Auth internally uses Argon2id to hash passwords in `account.password` column
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\repositories\user.repository.ts:79`): `const hashedPassword = await bcrypt.hash(password, 10);`
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\repositories\user.repository.ts:429`): `return await bcrypt.compare(password, user.passwordHash!);`

**Description**: Project A hashes passwords with Argon2id (stored in `account.password` column). Project B hashes passwords with bcrypt cost 10 (stored in `identity.users.passwordHash` column). These hashes are not cross-compatible. If users are consolidated into one table, password verification from either project fails for users registered in the other.

**Impact**: Users registered in Project A cannot log in via Project B (bcrypt can't verify Argon2id hashes). Users registered in Project B cannot log in via Project A (Argon2id can't verify bcrypt hashes). Cross-project single sign-on is impossible without password migration.

**Recommendation**: Standardize on ONE hashing algorithm. Recommended: Argon2id (superior security, already used by Project A). Implement dual-hash migration: on first successful login with legacy hash, re-hash with Argon2id and store alongside. Remove legacy hash after all users have migrated.

**Blocks Implementation?**: NO (but blocks cross-project login)

---

## Finding USER-002 — Email Normalization Inconsistency

**Severity**: MAJOR

**Source Documents**:
- 01_ProjectA_Architecture.md (§2.10: Gmail dot/plus canonicalization)
- 02_ProjectB_Architecture.md (§2: normalizeEmail = trim().toLowerCase())

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\lib\email\normalize.ts`): Gmail dot-stripping, plus-addressing removal
- **Project B** (`E:\gaddr-backend-api\src\core\utils\string.util.ts:81`): `email?.trim().toLowerCase() ?? email` — simple lowercase
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\user.entity.ts:145`): `this.normalizedEmail = request.email?.toUpperCase()` — uppercase in entity
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\repositories\user.repository.ts:164`): `email?.toUpperCase()` — uppercase for DB lookups

**Description**: Project A strips Gmail dots and plus-addressing (e.g., `john.doe+work@gmail.com` → `johndoe@gmail.com`). Project B simply lowercases. The same Gmail address registered in Project A could be normalized differently than in Project B, creating duplicate accounts. Additionally, Project B's entity and repository use UPPERCASE normalization while the handler uses lowercase — a triple-inconsistency within a single project.

**Impact**: Duplicate accounts for the same email address across projects. User confusion. Data fragmentation.

**Recommendation**: Adopt a single normalization strategy: `trim().toLowerCase()` with Gmail dot/plus canonicalization. Apply at the database level via a generated column or at the application level in a shared normalization utility. The `normalizedEmail` column in `identity.users` should use this consistent strategy.

**Blocks Implementation?**: NO

---

## Finding USER-003 — Soft Delete Strategy Divergence

**Severity**: MAJOR

**Source Documents**:
- 01_ProjectA_Architecture.md (§4: `status` text + `deletedAt` timestamp)
- 02_ProjectB_Architecture.md (§3: `isActive` boolean)

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts:53-54`): `status: text("status").default("active")`, `deletedAt: timestamp("deleted_at")`
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\user.entity.ts:74`): `isActive?: boolean` with `default: true`
- **Project B** (`E:\gaddr-backend-api\src\features\auth\login\login.handler.ts`): Checks `user.isActive === false` for login blocking
- **Project B** (`E:\gaddr-backend-api\src\features\auth\login\login.handler.ts`): Also checks `user.isLockedOut === true`

**Description**: Project A uses a two-field soft delete: `status` text ("active"/"deleted") + `deletedAt` timestamp. Project B uses a single boolean `isActive`. Project A also has `bannedAt` + `banReason` for bans. Project B uses `isLockedOut` + `lockoutEnd` + `accessFailedCount` for lockout. These are fundamentally different concepts (soft delete vs ban vs lockout) conflated in Project B's entity.

**Impact**: All login checks, all queries filtering active users, all guards checking user status must change. Project B has 10+ locations checking `isActive`, `isLockedOut`, `emailConfirmed` — all need updating.

**Recommendation**: Adopt Project A's model: `status` ("active"/"deleted"/"banned") + `deletedAt` + `bannedAt` + `banReason`. Remove `isActive`, `isLockedOut`, `lockoutEnd`, `accessFailedCount` from Project B's entity. Update all login guards.

**Blocks Implementation?**: NO

---

## Finding USER-004 — JWT Claims Removing Security-Stamp and Concurrency-Stamp

**Severity**: MAJOR

**Source Documents**:
- 07_ProjectB_Implementation_Plan.md (§6.6: "Remove SecurityStamp, ConcurrencyStamp from JWT")
- 02_ProjectB_Architecture.md (§2: security-stamp and concurrency-stamp in JWT claims)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\core\globals.ts:10-11`): `SecurityStamp = 'http://gaddr.com/claims/security-stamp'`, `ConcurrencyStamp = 'http://gaddr.com/claims/concurrency-stamp'`
- **Project B** (`E:\gaddr-backend-api\src\features\auth\refresh-token\refresh-token.handler.ts`): Validates `securityStamp` match on refresh
- **Frontend** (`E:\SocialApp\src\types\jwtPayload.type.ts:12-13`): `securityStamp` and `concurrencyStamp` in JwtPayload type
- **Frontend** (`E:\SocialApp\src\constants\globals.ts:10-11`): ClaimType constants for both stamps

**Description**: Document 07 proposes removing `security-stamp` and `concurrency-stamp` JWT claims. However, Project B's refresh token handler uses `securityStamp` to validate that the user's security state hasn't changed since the token was issued. Removing it breaks the refresh token rotation security mechanism. Additionally, the frontend's `JwtPayload` type includes both stamps — removing them from the JWT would cause TypeScript compilation errors in the frontend (which cannot change).

**Impact**: 
1. Refresh token validation breaks (security stamp mismatch check removed)
2. Frontend TypeScript compilation fails (type mismatch)
3. All existing JWT tokens with these claims become invalid on next decode

**Recommendation**: Keep `security-stamp` and `concurrency-stamp` in JWT claims. If Project A doesn't have these columns, add them to the shared user table or derive them from another source. Do NOT remove claims that the frontend depends on.

**Blocks Implementation?**: YES (frontend cannot change)

---

# Database Review

## Finding DB-001 — 18+ Tables Missing FK Constraints

**Severity**: MAJOR

**Source Documents**:
- 02_ProjectB_Architecture.md (§6: "18 tables have NO FK at all")
- 04_Shared_Identity_Architecture.md (§1.2: FK integrity gap analysis)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\userRole.entity.ts`): No `@ManyToOne` decorator to User
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\userLogin.entity.ts`): No FK to User
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\linkedAccount.entity.ts`): No FK to User
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\migrations\1783167267345-userContentAddForeignKey.ts`): Only 1 of 18 tables has FK added via migration

**Description**: 18+ tables reference `identity.users.id` but have no FK constraint in the database. This means user deletion leaves orphaned rows. The `RESTORE_REPORT.md` had to use `SET CONSTRAINTS ALL DEFERRED` to sidestep this during data import.

**Impact**: Silent data corruption on user deletion. Orphan accumulation degrades query performance over time.

**Recommendation**: Add FK constraints as part of Phase 1 (additive schema). Use `ON DELETE RESTRICT` for feature→identity to prevent accidental cascading deletes.

**Blocks Implementation?**: NO

---

## Finding DB-002 — varchar-as-uuid Columns Prevent FK Constraints

**Severity**: MAJOR

**Source Documents**:
- 03_Schema_Comparison.md (§3.3: "varchar-as-uuid issue on userId/roleId")

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\userRole.entity.ts`): `userId: string` stored as `varchar` in DB
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\userLogin.entity.ts`): `userId: string` stored as `varchar`
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\linkedAccount.entity.ts`): `userId: string` stored as `varchar`
- **RESTORE_REPORT.md**: Documents that user_content userId was migrated from varchar to UUID type

**Description**: Multiple tables store UUID values in `varchar` columns instead of `uuid` type columns. PostgreSQL FK constraints require matching types. A `varchar` column cannot have an FK to a `uuid` column without a type cast. This prevents adding proper FK constraints to 10+ tables.

**Impact**: FK constraints cannot be added without a data migration to change column types. This is a prerequisite for the FK cleanup in Phase 1.

**Recommendation**: Execute column type migrations (`ALTER COLUMN ... TYPE uuid USING ...::uuid`) for all varchar-as-uuid columns BEFORE adding FK constraints. This is high-risk and requires the 5-15 minute maintenance window described in `05_Migration_Strategy.md` Phase 2.

**Blocks Implementation?**: NO (but blocks FK constraint addition)

---

## Finding DB-003 — Two Separate User Tables in Same Database

**Severity**: MAJOR

**Source Documents**:
- 01_ProjectA_Architecture.md (§4: `public.user` table)
- 02_ProjectB_Architecture.md (§3: `identity.users` table)
- RESTORE_REPORT.md (§6: Documents merge of two user tables)

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts:12`): `pgTable("user", ...)` — public schema
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\user.entity.ts:12`): `@Entity({ name: 'users', schema: 'identity' })` — identity schema
- **RESTORE_REPORT.md**: "Production uses `public.user` (49 rows, mixed PKs), backup uses `identity.users` (14 rows, UUID PKs)"

**Description**: The same PostgreSQL database contains TWO user tables:
1. `public.user` — Project A's table (text PK, Better Auth-managed, 38 columns)
2. `identity.users` — Project B's table (UUID PK, TypeORM-managed, 30+ columns)

These have different schemas, different PKs, different column sets. 4 users were found with matching emails but different IDs during the RESTORE_REPORT merge. This dual-table state is the result of the incomplete merger documented in migration 0063.

**Impact**: Until one table is designated canonical and the other is retired, no true shared-identity is possible. Both projects currently write to their own table, creating a split-brain scenario.

**Recommendation**: Designate `identity.users` as canonical (UUID PK, 18+ FK dependencies). Migrate `public.user` data into `identity.users`. Project A switches to reading `identity.users`. Drop `public.user` after migration.

**Blocks Implementation?**: YES

---

# Foreign Key Review

## Finding FK-001 — ON DELETE Behavior Not Aligned With Ownership Rules

**Severity**: MINOR

**Source Documents**:
- 04_Shared_Identity_Architecture.md (§4: FK behavior rules — CASCADE within identity, RESTRICT for feature→identity)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\userBiometric.entity.ts:18`): `@OneToOne(() => User, (u) => u.biometrics, { cascade: true, onDelete: 'CASCADE' })`
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts`): 94.7% of FKs use CASCADE, 4 use SET NULL, 4 have no onDelete

**Description**: Document 04 proposes RESTRICT for all feature→identity FKs. However, the current codebase has CASCADE on most FKs. Changing to RESTRICT requires explicit user-deletion protocol implementation before any hard deletes can proceed.

**Impact**: If RESTRICT is added before the deletion protocol is implemented, user hard-delete attempts will fail with FK constraint violations.

**Recommendation**: Implement the deletion protocol (§4.4 of 04) BEFORE changing FK behavior to RESTRICT. Alternatively, keep CASCADE for now and change to RESTRICT in a later phase.

**Blocks Implementation?**: NO

---

# Authentication Review

## Finding AUTH-005 — Dual Auth System (JWT + Better Auth) Coexistence

**Severity**: MAJOR

**Source Documents**:
- 02_ProjectB_Architecture.md (§2: "Triple auth detection: Bearer header → Better Auth cookie → custom access_token cookie")
- 07_ProjectB_Implementation_Plan.md (§6.3: "Remove Better Auth fallback from HttpContext middleware")

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\core\middlewares\httpContext.middleware.ts:64-144`): `tryBetterAuthSession()` — queries `session` table first, falls back to JWT
- **Project B** (`E:\gaddr-backend-api\src\core\utils\betterAuthSession.util.ts`): Extracts Better Auth cookie token
- **Project B** (`E:\gaddr-backend-api\src\core\config\betterAuth.config.ts`): Better Auth config for cookie name and secret

**Description**: Project B's HttpContext middleware currently tries Better Auth session validation FIRST, then falls back to JWT. This means some users may be authenticated via Better Auth cookies (from Project A's cross-subdomain cookies), while others use JWT Bearer tokens. The middleware doesn't clearly document which auth method is primary.

**Impact**: Removing the Better Auth fallback (as 07 proposes) may break sessions for users who authenticated via Project A's Better Auth and are now accessing Project B endpoints.

**Recommendation**: During the transition period, keep the dual-auth detection. After the shared auth is established, remove the Better Auth fallback. Document which users are affected.

**Blocks Implementation?**: NO

---

## Finding AUTH-006 — Better Auth Session Table Access From Project B

**Severity**: MINOR

**Source Documents**:
- 01_ProjectA_Architecture.md (§5.1: Session table in public schema)
- 07_ProjectB_Implementation_Plan.md (§6.3: Remove raw SQL to session table)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\core\middlewares\httpContext.middleware.ts`): Raw SQL query to `session` table: `SELECT userId FROM session WHERE token = $1 AND expiresAt > NOW()`

**Description**: Project B's middleware executes raw SQL against Project A's `session` table. This creates a direct dependency on Project A's schema. If Project A changes the session table, Project B breaks silently.

**Impact**: Tight coupling between projects. Schema changes in Project A's session table break Project B's auth.

**Recommendation**: Either formalize the dependency (add the session table to Project B's entity definitions) or remove the Better Auth session lookup entirely.

**Blocks Implementation?**: NO

---

## Finding AUTH-007 — Argon2id Not Available in Project B

**Severity**: MINOR

**Source Documents**:
- 01_ProjectA_Architecture.md (§2.4: `@node-rs/argon2`)
- 02_ProjectB_Architecture.md (§2: bcrypt)

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\package.json`): `"@node-rs/argon2": "^2.0.2"` (trustedDependency)
- **Project B** (`E:\gaddr-backend-api\package.json`): `"bcrypt": "^6.0.0"` — no argon2 dependency

**Description**: Project B does not have `@node-rs/argon2` in its dependencies. If passwords are consolidated into one table using Argon2id hashes, Project B cannot verify them without adding this dependency.

**Impact**: Password verification from Project B fails for users registered in Project A until argon2 is added.

**Recommendation**: Add `@node-rs/argon2` to Project B's `package.json` as part of the password hashing standardization.

**Blocks Implementation?**: NO

---

# Drizzle vs TypeORM Compatibility

## Finding ORM-001 — Entity Definition Mismatch

**Severity**: MAJOR

**Source Documents**:
- 03_Schema_Comparison.md (§3.1: Full column comparison)
- 07_ProjectB_Implementation_Plan.md (§3.1: Entity rewrite plan)

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts:12-57`): 38 columns with snake_case DB names
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\identity\user.entity.ts`): 30+ columns with camelCase entity names
- **Project B**: Has columns NOT in Project A: `normalizedEmail`, `normalizedUserName`, `passwordHash`, `securityStamp`, `concurrencyStamp`, `twoFactorSecret`, `bio`, `registeredOn`
- **Project A**: Has columns NOT in Project B: `isVerified`, `stripeCustomerId`, `stripePriceId`, `stripeSubscriptionId`, `subscriptionStatus`, `subscriptionPlan`, `jobPostLimit`, `activeJobPostCount`, `walletAddress`, `privateSearchMode`, `blockedEmployers`, `aiAnalysisOptOut`, `dateOfBirth`, `sourceApp`, `status`, `deletedAt`, `bannedAt`, `banReason`, `twoFaVerifiedAt`

**Description**: The two entities have 12+ columns unique to Project B and 19+ columns unique to Project A. Document 07 proposes rewriting Project B's entity to match Project A's 38 columns, but this is not a simple rename — it requires adding 19 new columns and removing 12 old ones.

**Impact**: TypeORM will attempt to read/write columns that don't exist (Project A columns) or miss columns that do exist (Project B columns). Runtime errors on any query.

**Recommendation**: Phase 1 must add ALL Project A columns to `identity.users` as nullable with defaults BEFORE Project B rewrites its entity. This is additive and non-breaking.

**Blocks Implementation?**: NO (if phased correctly)

---

## Finding ORM-002 — Drizzle Journal Mismatch

**Severity**: MINOR

**Source Documents**:
- 01_ProjectA_Architecture.md (§8.1: "Only 14 of 86 migrations tracked")

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\gaddr-jobs\drizzle\meta\_journal.json`): 14 entries (idx 0-13)
- **Project A** (`E:\Github\gaddep\gaddr-jobs\drizzle\`): 89 SQL migration files

**Description**: Project A's Drizzle migration journal tracks only 14 of 89 migration files. This means 75 migrations were applied via `drizzle-kit push` or manual SQL, not through the normal Drizzle Kit migration pipeline. Running `drizzle-kit generate` may attempt to recreate already-applied migrations.

**Impact**: Future `drizzle-kit generate` calls may produce incorrect migrations. `drizzle-kit migrate` won't know about 75 applied migrations.

**Recommendation**: Rebuild the journal to track all 89 migrations. This is a maintenance issue, not a blocker.

**Blocks Implementation?**: NO

---

## Finding ORM-003 — TypeORM synchronize Risk

**Severity**: MINOR

**Source Documents**:
- 05_Migration_Strategy.md (§5: "synchronize: false in production")

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\configs.ts:88`): `POSTGRES_SYNCHRONIZE: Joi.boolean().default(false)`
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\persistence\data.source.ts:13`): `synchronize: configs.postgres.synchronize`

**Description**: `synchronize` defaults to `false`, which is correct. However, if a developer accidentally sets `POSTGRES_SYNCHRONIZE=true` in production, TypeORM would auto-sync entity changes to the database, potentially breaking the schema.

**Recommendation**: Add a hard guard: if `NODE_ENV=production`, override `synchronize` to `false` regardless of env var.

**Blocks Implementation?**: NO

---

# Migration Review

## Finding MIG-001 — Auto-Migration on Startup With Multiple Instances

**Severity**: MAJOR

**Source Documents**:
- 05_Migration_Strategy.md (§Cross-Cutting: "POSTGRES_MIGRATIONS_RUN=true means every deployment auto-runs pending migrations")

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\configs.ts:89-91`): `POSTGRES_MIGRATIONS_RUN: Joi.boolean().default(true)`
- **Project B**: Cloud Run can spin up multiple instances simultaneously

**Description**: With `POSTGRES_MIGRATIONS_RUN=true`, every Cloud Run instance attempts to run pending migrations on startup. If 3 instances start simultaneously, 3 concurrent migration attempts occur. TypeORM tracks executed migrations in a `migrations` table, but there's no advisory lock to prevent concurrent execution.

**Impact**: Concurrent migration execution can cause duplicate table creation, partial migration states, or deadlocks.

**Recommendation**: Use PostgreSQL advisory locks (`pg_advisory_lock`) in migration runner, or move migrations to a separate CI/CD step that runs once before deployment.

**Blocks Implementation?**: NO

---

## Finding MIG-002 — Phase 2 PK Type Migration Risk

**Severity**: MAJOR

**Source Documents**:
- 05_Migration_Strategy.md (§5: "Recommended downtime: 5-15 minutes for PK type migrations")

**Repository Evidence**:
- **RESTORE_REPORT.md**: Documents that `upload_jobs`, `youtube_accounts`, `youtube_videos`, `newsletter_subscribers` have PK type conflicts between TypeORM and Drizzle
- **Project B** (`E:\gaddr-backend-api\src\domain\entities\uploadJob.entity.ts`): UUID PK
- **RESTORE_REPORT.md**: Production has serial PK for upload_jobs

**Description**: The PK type migration (serial→UUID, text→UUID) requires: add new column → populate UUIDs → update all FKs → drop old PK → add new PK. This is a multi-step operation that must complete atomically. If it fails halfway, the database is in an inconsistent state.

**Impact**: Partial migration leaves tables with dual PK columns, broken FK references, and orphaned rows.

**Recommendation**: Wrap each PK migration in a single transaction with a complete `down()` method. Test on staging with production-like data volume. Schedule during lowest-traffic window.

**Blocks Implementation?**: NO

---

# Existing Data Compatibility

## Finding DATA-001 — User Merge Creates Duplicate Account Risk

**Severity**: MAJOR

**Source Documents**:
- RESTORE_REPORT.md (§6: "4 shared emails with different UUIDs — different user records")
- 01_ProjectA_Architecture.md (§5.5: UserIdMapping table)

**Repository Evidence**:
- **RESTORE_REPORT.md**: "4 users only in backup, 40 users only in production"
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts:59-63`): `userIdMapping` table bridges text PK ↔ UUID PK

**Description**: The RESTORE_REPORT found 4 users with matching emails but different UUIDs across the two user tables. These are the same person registered in both apps. When consolidating into one table, these must be merged, not duplicated. The `userIdMapping` table exists but was designed for the gaddr.com → gaddr-jobs merger, not for the identity consolidation.

**Impact**: Duplicate accounts for the same person. Loss of data if one record is deleted instead of merged.

**Recommendation**: Build a merge script that: (1) identifies users by email match, (2) designates one record as canonical (prefer the one with more data), (3) migrates FK references from the non-canonical record, (4) deletes the non-canonical record.

**Blocks Implementation?**: NO

---

# Backend Compatibility

## Finding BE-001 — Token Service Column Mapping Change

**Severity**: MAJOR

**Source Documents**:
- 07_ProjectB_Implementation_Plan.md (§6.1: Token service rewrite)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\services\token.service.ts`): Builds JWT from 10+ User entity columns
- **Project B** (`E:\gaddr-backend-api\src\core\globals.ts`): 14 claim URIs
- **Frontend** (`E:\SocialApp\src\types\jwtPayload.type.ts`): JwtPayload type with 12 claim URIs

**Description**: Document 07 proposes changing JWT claim sources: `userName` → `name`, `emailConfirmed` → `emailVerified`, `type` → `isAdmin`, `isActive` → `status`, `securityStamp` → removed, `concurrencyStamp` → removed. Each change affects every consumer that reads JWT claims.

**Impact**: All guards, all middleware, all frontend claim readers must update simultaneously. Removing claims breaks the frontend (which cannot change).

**Recommendation**: Keep ALL existing JWT claim URIs. Map new column names to existing claim names in the token service. Do NOT remove claims that the frontend depends on.

**Blocks Implementation?**: YES (frontend dependency)

---

# API Compatibility

## Finding API-001 — Frontend Calls 40+ Project B Endpoints

**Severity**: CRITICAL

**Source Documents**:
- 07_ProjectB_Implementation_Plan.md (§2: Lists 14 auth feature directories to delete)
- 07_ProjectB_Implementation_Plan.md (§5.1: Lists auth features to remove)

**Repository Evidence**:
- **Frontend** (`E:\SocialApp\src\services\apiClient.service.ts`): `baseUrl: http://localhost:8080/api/v1` — ALL API calls go to Project B
- **Frontend** (`E:\SocialApp\src\app\(auth)\login\LoginFormClient.tsx`): `apiClient.Token.loginAsync()` → Project B
- **Frontend** (`E:\SocialApp\src\app\(auth)\signup\SignupFormClient.tsx`): `apiClient.Account.registerNewUserAsync()` → Project B
- **Frontend** (`E:\SocialApp\src\app\(auth)\forgot-password\`): `apiClient.Account.forgotPasswordAsync()` → Project B
- **Frontend** (`E:\SocialApp\src\app\(auth)\reset-password-code\`): `apiClient.Account.resetPasswordAsync()` → Project B
- **Frontend** (`E:\SocialApp\src\features\auth\services\`): 2FA, OAuth, profile update → all Project B

**Description**: The frontend makes ALL API calls to Project B's NestJS backend at `http://localhost:8080/api/v1`. Document 07 proposes deleting 14 auth feature directories from Project B (32+ files). These files implement the REST endpoints that the frontend calls. Removing them removes the endpoints. The frontend constraint ("must NOT change") makes this a hard blocker.

**Impact**: Frontend login, register, password reset, OAuth, 2FA, profile update, onboarding — ALL break.

**Recommendation**: DO NOT remove auth endpoints from Project B. Instead:
- Project B KEEPS all auth endpoints
- Project B ADAPTS to read from Project A's shared schema
- Project B UPDATES column references to match the new schema
- Project B does NOT remove any endpoints that the frontend calls

**Blocks Implementation?**: YES

---

## Finding API-002 — Token Response Shape Compatibility

**Severity**: MINOR

**Source Documents**:
- 02_ProjectB_Architecture.md (§4: "Backend doesn't return `success` boolean, frontend expects it")

**Repository Evidence**:
- **Frontend** (`E:\SocialApp\src\types\serviceResponse.type.ts`): `{ success: boolean; data?: T; error?: string }`
- **Project B** (`E:\gaddr-backend-api\src\features\auth\login\login.handler.ts`): Returns `TokenResponseModel` without `success` field

**Description**: The frontend wraps all responses in `ServiceResponse<T>` which expects a `success` boolean. Project B's login handler doesn't include this field. The frontend's `wrapResponses: true` config in the API client may handle this, but it's a potential mismatch.

**Impact**: Potential runtime error if the frontend tries to read `response.success` and gets `undefined`.

**Recommendation**: Verify that the `wrapResponses: true` config in restfit adds the `success` field. If not, add it to all response DTOs.

**Blocks Implementation?**: NO

---

# Build Risk Assessment

## Finding BUILD-001 — Zero Test Coverage

**Severity**: MAJOR

**Source Documents**:
- 05_Migration_Strategy.md (§Current State: "Zero unit tests")
- 01_ProjectA_Architecture.md (§1: "Vitest (unit + integration), Playwright (E2E)")

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\`): No `.spec.ts` files found via glob search
- **Project B** (`E:\gaddr-backend-api\test\app.e2e-spec.ts`): Single E2E spec (likely scaffolded, not maintained)
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\`): Has Vitest + Playwright tests

**Description**: Project B has zero unit tests. Every change — entity rewrite, auth handler modification, repository update — must be verified manually. This makes the migration extremely high-risk.

**Impact**: Regression detection is entirely manual. Bugs discovered in production.

**Recommendation**: Write critical-path tests BEFORE implementation:
1. Login flow test (email + password → JWT)
2. Registration flow test (create user → verify email)
3. Refresh token test (rotate token → new JWT)
4. User query test (read user by ID → correct columns)

**Blocks Implementation**: NO

---

## Finding BUILD-002 — Circular Dependency Risk With Module Rewrites

**Severity**: MINOR

**Source Documents**:
- 06_ProjectA_Implementation_Plan.md (§12: Build impacts)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\repositories\user.repository.ts:49-52`): `forwardRef` for IRoleRepository and IUserRoleRepository
- **Project B** (`E:\gaddr-backend-api\src\modules\app.module.ts`): Module dependency graph — no circular imports

**Description**: Project B currently has no circular dependencies (only `forwardRef` usage). However, rewriting the auth module and user module simultaneously introduces risk of new circular imports if module boundaries are not carefully maintained.

**Impact**: NestJS fails to start if circular dependencies are detected at runtime.

**Recommendation**: After each module rewrite, run `npm run build` to verify no circular dependency errors.

**Blocks Implementation?**: NO

---

# Performance Review

## Finding PERF-001 — Email Lookup Query Change

**Severity**: MINOR

**Source Documents**:
- 07_ProjectB_Implementation_Plan.md (§6.4: UserRepository adaptation)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\repositories\user.repository.ts:164`): `const normalizedEmail = email?.toUpperCase()` → queries by `normalizedEmail`
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts:17`): `email: text("email").notNull().unique()` — email is unique

**Description**: Project B looks up users by `normalizedEmail` (uppercased). Project A stores email as-is (lowercased by normalization). After schema alignment, email lookups should use the `email` column directly (which has a unique constraint and index).

**Impact**: If `normalizedEmail` column is removed, all email lookup queries must change to use `email` column. Performance impact is negligible since both have unique constraints.

**Recommendation**: Use `email` column for lookups. Remove `normalizedEmail` column in cleanup phase.

**Blocks Implementation?**: NO

---

# Security Review

## Finding SEC-001 — JWT Secret in Frontend .env.local

**Severity**: MAJOR

**Source Documents**:
- 02_ProjectB_Architecture.md (§13: C1: "JWT secret exposed in frontend .env.local")

**Repository Evidence**:
- **Frontend** (`E:\SocialApp\.env.local`): `JWT_SECRET=this is my custom Secret key for authentication`
- **Frontend** (`E:\SocialApp\.env.local`): Also contains ALL OAuth provider secrets (Google, Facebook, Instagram, etc.)

**Description**: The frontend's `.env.local` contains the JWT signing secret and all OAuth provider secrets. If the repository is public or leaked, tokens can be forged and OAuth flows compromised.

**Impact**: Token forgery. Account takeover. OAuth credential theft.

**Recommendation**: 
1. Move JWT validation to server-side only (Next.js API route)
2. Use asymmetric JWT (RS256) — frontend gets public key for validation only
3. Remove OAuth secrets from frontend env (use backend proxy for OAuth flows)
4. Ensure `.env.local` is in `.gitignore`

**Blocks Implementation?**: NO

---

## Finding SEC-002 — bcrypt Cost Factor 10

**Severity**: MINOR

**Source Documents**:
- 02_ProjectB_Architecture.md (§2: bcrypt cost 10)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\infrastructure\repositories\user.repository.ts:79`): `bcrypt.hash(password, 10)`

**Description**: bcrypt cost factor 10 is adequate but below modern recommendations (12-14). Combined with the argon2id migration, this should be addressed.

**Recommendation**: When migrating to argon2id, the cost factor question is moot. Argon2id provides superior security with configurable memory/time parameters.

**Blocks Implementation?**: NO

---

## Finding SEC-003 — Refresh Token Rotation Not Validated

**Severity**: MINOR

**Source Documents**:
- 02_ProjectB_Architecture.md (§2: Refresh token flow)

**Repository Evidence**:
- **Project B** (`E:\gaddr-backend-api\src\features\auth\refresh-token\refresh-token.handler.ts`): Validates `securityStamp` match, rotates token

**Description**: Project B rotates refresh tokens on every use (good), but the `securityStamp` validation that prevents token reuse after password change will be removed per Document 07. This weakens the refresh token security.

**Recommendation**: Keep `securityStamp` validation in the refresh token flow. If Project A doesn't have this column, derive it from another source (e.g., a hash of the password hash + a salt).

**Blocks Implementation?**: NO

---

# Deployment Review

## Finding DEP-001 — Deployment Order Undefined

**Severity**: MAJOR

**Source Documents**:
- 05_Migration_Strategy.md (§Phase 1-7)
- 07_ProjectB_Implementation_Plan.md (§9: Execution order)

**Description**: The deployment sequence is unclear. Document 07 has 5 phases but doesn't specify which project deploys first. If Project B deploys its schema changes before Project A creates the shared tables, queries fail. If Project A deploys first, Project B's old entity doesn't match the new schema.

**Impact**: Wrong deployment order causes downtime.

**Recommendation**: Define explicit deployment sequence:
1. Phase 0: Both projects back up
2. Phase 1: Project A adds columns to `identity.users` (additive, non-breaking)
3. Phase 2: Project B adds `@node-rs/argon2` dependency (non-breaking)
4. Phase 3: Project B rewrites User entity to match new schema
5. Phase 4: Project B deploys new entity code
6. Phase 5: Verify cross-project login

**Blocks Implementation?**: NO

---

## Finding DEP-002 — No Blue/Green Deploy Strategy

**Severity**: MINOR

**Source Documents**:
- 05_Migration_Strategy.md (§6: "Cloud Run supports rolling deploys")

**Description**: Cloud Run uses rolling deploys, not blue/green. During deploy, old and new instances coexist. If the new instance has a different entity definition, old instances may fail to read new schema.

**Recommendation**: Use Cloud Run traffic splitting for gradual rollout. Keep old version warm during transition.

**Blocks Implementation?**: NO

---

# Rollback Review

## Finding RB-001 — Phase 4 Column Drop Is Point of No Return

**Severity**: MINOR

**Source Documents**:
- 04_Shared_Identity_Architecture.md (§7.6: "Phase 4 is the point of no return")

**Description**: Document 04 correctly identifies that dropping old columns from `identity.users` is irreversible without a backup restore. However, it also states "All prior phases are fully reversible" which is only true if the Phase 0 backup is verified and accessible.

**Recommendation**: Keep Phase 0 backup for minimum 30 days after Phase 4. Verify backup integrity before proceeding.

**Blocks Implementation?**: NO

---

# Long-Term Maintainability Review

## Finding MAINT-001 — Shared-Schema Package Already Out of Sync

**Severity**: MAJOR

**Source Documents**:
- 01_ProjectA_Architecture.md (§7.1: "shared-schema missing 9 columns vs auth-schema")

**Repository Evidence**:
- **Project A** (`E:\Github\gaddep\packages\shared-schema\src\auth.ts`): Missing `twoFaVerifiedAt`, `dateOfBirth`, `status`, `deletedAt`, `bannedAt`, `banReason`, `privateSearchMode`, `blockedEmployers`, `aiAnalysisOptOut`
- **Project A** (`E:\Github\gaddep\gaddr-jobs\src\server\db\auth-schema.ts`): Has all 38 columns

**Description**: The `@gaddr/shared-schema` package (used by both gaddr-jobs and gaddr.com) defines a user table that is MISSING 9 columns compared to the actual auth-schema in gaddr-jobs. This drift was introduced during the merger and never resolved.

**Impact**: If gaddr.com uses shared-schema to query users, it will miss 9 columns. Drizzle Kit `push` may attempt to drop the missing columns.

**Recommendation**: Rebuild `packages/shared-schema/src/auth.ts` from the authoritative `auth-schema.ts` definition. This should be done BEFORE any further schema changes.

**Blocks Implementation?**: NO

---

## Finding MAINT-002 — No Migration Governance Process

**Severity**: MINOR

**Source Documents**:
- 08_Final_Architecture_Review.md (§5.3: Recommended governance process)

**Description**: No formal process exists for approving schema changes that affect both projects. Currently, either project can modify the shared database without coordinating with the other.

**Recommendation**: Implement a Schema Change RFC process: any change to `identity.*` tables requires approval from both project owners. Document in a shared `SCHEMA_GOVERNANCE.md`.

**Blocks Implementation?**: NO

---

# Critical Issues

| ID | Finding | Blocker |
|----|---------|---------|
| ARCH-001 | Contradictory auth ownership — 07 removes auth from B, frontend calls B | YES |
| ARCH-002 | Two separate user tables — different PKs, different schemas | YES |
| ARCH-004 | Schema owner cannot remove auth from consumer | YES |
| API-001 | Frontend calls 40+ Project B endpoints — removing them breaks frontend | YES |
| REPO-001 | PK type mismatch (text vs UUID) prevents FK constraints | YES |

---

# Major Issues

| ID | Finding | Impact |
|----|---------|--------|
| ARCH-003 | Contradictory table ownership for split tables | Execution order unclear |
| USER-001 | Password hash incompatibility (Argon2id vs bcrypt) | Cross-project login fails |
| USER-002 | Email normalization inconsistency | Duplicate accounts |
| USER-003 | Soft delete strategy divergence | Login checks break |
| USER-004 | JWT claims removal breaks frontend | Frontend TypeScript fails |
| DB-001 | 18+ tables missing FK constraints | Orphan records |
| DB-002 | varchar-as-uuid prevents FK constraints | FK addition blocked |
| DB-003 | Two user tables in same database | Split-brain |
| AUTH-005 | Dual auth system coexistence | Session ambiguity |
| ORM-001 | Entity definition mismatch (12+ and 19+ unique columns) | Runtime errors |
| MIG-001 | Auto-migration with multiple instances | Concurrent migration risk |
| MIG-002 | PK type migration is high-risk | Data loss possible |
| DATA-001 | User merge creates duplicate accounts | Data integrity |
| BE-001 | Token service column mapping changes | JWT payload breaks |
| BUILD-001 | Zero test coverage | No regression detection |
| DEP-001 | Deployment order undefined | Downtime risk |
| MAINT-001 | Shared-schema package out of sync | Schema drift |

---

# Minor Issues

| ID | Finding |
|----|---------|
| FK-001 | ON DELETE behavior not aligned with ownership rules |
| AUTH-006 | Better Auth session table access from Project B (raw SQL) |
| AUTH-007 | Argon2id not available in Project B |
| ORM-002 | Drizzle journal tracks 14/89 migrations |
| ORM-003 | TypeORM synchronize risk in production |
| SEC-002 | bcrypt cost factor 10 (below modern recommendation) |
| SEC-003 | Refresh token rotation loses security stamp validation |
| DEP-002 | No blue/green deploy strategy |
| RB-001 | Phase 4 column drop is point of no return |
| MAINT-002 | No migration governance process |
| PERF-001 | Email lookup query change |
| API-002 | Token response shape compatibility |

---

# Suggestions

| # | Suggestion | Priority |
|---|-----------|----------|
| 1 | Write critical-path tests (login, register, refresh) BEFORE implementation | HIGH |
| 2 | Add `@node-rs/argon2` to Project B's package.json | HIGH |
| 3 | Rebuild shared-schema package from authoritative definition | HIGH |
| 4 | Add advisory lock to migration runner to prevent concurrent execution | MEDIUM |
| 5 | Standardize email normalization: `trim().toLowerCase()` with Gmail canonicalization | MEDIUM |
| 6 | Add `tsc --noEmit` to CI pipeline | MEDIUM |
| 7 | Add health check endpoint for Cloud Run | MEDIUM |
| 8 | Remove vestigial `prisma.config.ts` from Project B | LOW |
| 9 | Expand ESLint enforcement in CI | LOW |
| 10 | Document shared-schema change process in SCHEMA_GOVERNANCE.md | LOW |

---

# Open Questions

| # | Question | Blocks |
|---|----------|--------|
| 1 | Which user table is canonical: `public.user` (Project A) or `identity.users` (Project B)? | YES |
| 2 | Will Project A's Better Auth be removed or retained for Project A's own Next.js app? | NO |
| 3 | What is the target password hashing algorithm: Argon2id or bcrypt? | YES (for cross-project login) |
| 4 | How will the 4 duplicate users (matching emails, different IDs) be merged? | NO |
| 5 | What is the deployment order: A first or B first? | YES |
| 6 | How will existing JWT tokens be handled during the transition? | NO |
| 7 | Should Project B's `identity.userLogins` table be kept (JWT sessions) or replaced by Project A's `session` table (Better Auth)? | YES |
| 8 | Who maintains the shared user table schema after initial setup? | NO |
| 9 | How will the frontend OAuth flow change if Project B keeps auth endpoints? | NO |
| 10 | What is the rollback window for each phase? | NO |

---

# Production Readiness Score

| Category | Score | Notes |
|----------|-------|-------|
| Architecture | 3/10 | Contradictory ownership rules, dual user tables, dual auth systems |
| Database | 4/10 | Two user tables, PK mismatch, 18+ tables without FKs, varchar-as-uuid |
| Authentication | 3/10 | Password hash mismatch, email normalization inconsistency, dual auth system |
| ORM Compatibility | 4/10 | Entity mismatch, Drizzle journal drift, varchar-as-uuid columns |
| Security | 5/10 | JWT secret in frontend, weak bcrypt cost, missing security stamp validation |
| Performance | 7/10 | No blocking performance issues, but email lookup changes needed |
| Deployment | 4/10 | Undefined deploy order, no blue/green, auto-migration risk |
| Maintainability | 5/10 | Shared-schema drift, no governance process, zero tests |
| **Overall** | **4/10** | **Not ready for implementation** |

---

# Final Recommendation

## ❌ NOT READY FOR IMPLEMENTATION

**The architecture and implementation plans contain 5 critical blockers that, if followed as written, would break the frontend and existing production data.**

Before implementation can begin, the following MUST be resolved:

1. **Resolve auth ownership contradiction** (ARCH-001, ARCH-004): Project B MUST keep all auth endpoints that the frontend calls. Schema ownership ≠ code ownership. Project A owns the schema definition; Project B owns the auth API.

2. **Designate canonical user table** (ARCH-002, DB-003): Choose ONE user table (`identity.users` recommended). Migrate all data into it. Retire the other.

3. **Resolve PK type mismatch** (REPO-001): Migrate Project A's text PKs to UUID PKs BEFORE shared-database integration.

4. **Keep all JWT claims** (USER-004, BE-001): Do NOT remove `security-stamp` or `concurrency-stamp` claims. The frontend depends on them.

5. **Define deployment sequence** (DEP-001): Specify which project deploys first and how the transition is phased.

**Estimated effort to resolve blockers**: 3-5 days of architecture design, followed by revised implementation plans.

**Recommended next step**: Hold an architecture alignment session with both project teams to resolve the 5 critical blockers, then re-issue revised implementation plans (06 and 07) for re-review.
