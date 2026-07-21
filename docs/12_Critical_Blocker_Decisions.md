# 12 — Critical Blocker Decisions

> **Purpose**: Present architectural options and trade-offs for the 5 critical blockers identified in the Master Architecture Review (08).
> **Status**: DRAFT — Pending stakeholder decisions
> **Created**: 2026-07-19

---

# Decision Required

The review identified 5 critical blockers that prevent implementation. Each requires a binary or multi-choice decision from stakeholders. This document presents the options, trade-offs, and a recommended choice for each.

---

## Decision 1: Auth Ownership

**Blocker**: ARCH-001 — Doc 07 proposes removing auth endpoints from Project B, but the frontend exclusively calls those 22 endpoints for all auth flows.

### Option A — Project B owns auth endpoints (RECOMMENDED)
- Project B keeps all 22 auth endpoints (login, register, OAuth, 2FA, password reset, profile)
- Project B generates JWT tokens
- Project A reads from the same database but does NOT serve auth to the frontend
- Better Auth in Project A is used only for Project A's internal Next.js app (admin panel, if needed)

**Pros**: Zero frontend changes. All existing API contracts preserved. Minimal risk.
**Cons**: Project B has auth complexity. Two auth systems coexist (Better Auth in A, JWT in B).

### Option B — Project A owns auth endpoints
- Project B's auth endpoints are removed
- A new API gateway or proxy routes frontend auth calls to Project A
- Project A serves JWT tokens

**Pros**: Single auth owner.
**Cons**: Frontend must change (violates hard constraint). Requires building a proxy layer. High risk.

### Option C — Shared auth microservice
- Extract auth into a third service
- Both projects depend on it

**Pros**: Clean separation.
**Cons**: Massive scope increase. Three services to deploy/maintain. Over-engineering for current scale.

### Recommendation
**Option A.** The frontend cannot change. Project B already works. Keep it.

---

## Decision 2: Canonical User Table

**Blocker**: ARCH-002 — Two user tables exist (`public.user` text PK vs `identity.users` UUID PK). 18+ tables have FK dependencies on `identity.users`.

### Option A — `identity.users` is canonical with UUID PK (RECOMMENDED)
- `identity.users` stays as the single source of truth
- Add missing columns from `public.user` (stripeCustomerId, subscriptionStatus, etc.) to `identity.users`
- Migrate 49 rows from `public.user` into `identity.users`
- Project A switches from `public.user` to `identity.users`
- Drop `public.user` after migration

**Pros**: 18+ FK constraints remain intact. No FK rewrites needed. UUID is globally unique.
**Cons**: Project A must change its Better Auth config to use UUID PKs (text → UUID). Requires data migration for 49 users.

### Option B — `public.user` is canonical with text PK
- `public.user` stays, `identity.users` is dropped
- 18+ FK references in Project B must change from UUID to text
- All Project B entities that reference users.id must be rewritten

**Pros**: Project A schema unchanged.
**Cons**: 18+ FK rewrites. All entity types in Project B change. High breakage risk.

### Option C — New unified table
- Create a fresh `public.users` table with a new schema
- Migrate data from both tables
- Both projects update to use the new table

**Pros**: Clean slate.
**Cons**: Maximum work. Both projects change. Both data sets must be merged. Highest risk.

### Recommendation
**Option A.** Minimizes total changes. The 18+ FK dependencies make `identity.users` the anchor.

---

## Decision 3: PK Type Unification

**Blocker**: REPO-001 — Project A uses text PKs, Project B uses UUID PKs. FK constraints cannot span both.

### Option A — UUID everywhere (RECOMMENDED)
- Project A's `user.id` changes from `text` to `uuid`
- Better Auth config updated to generate UUIDs
- `user_id_mapping` table is no longer needed
- All of Project A's internal FKs (session, account, passkey) updated to UUID

**Pros**: Single PK type. Mapping table eliminated. FK constraints work across projects.
**Cons**: Project A must update its auth schema and all internal references. Data migration needed for existing text IDs.

### Option B — Text everywhere
- Project B changes all UUID columns to text
- Project B's `BaseEntity` changes `@PrimaryGeneratedColumn('uuid')` to a text-based ID

**Pros**: Project A schema unchanged.
**Cons**: Loses UUID v4 generation benefits. 18+ entities change. TypeORM UUID auto-generation disabled.

### Option C — Keep mapping table permanently
- `user_id_mapping` stays forever
- Every cross-project query goes through the mapping

**Pros**: Neither project changes PK type.
**Cons**: Permanent性能 overhead. Every FK lookup requires a JOIN through the mapping table. Technical debt.

### Recommendation
**Option A.** UUID is the industry standard for distributed systems. The mapping table was always meant to be temporary.

---

## Decision 4: JWT Claims (securityStamp/concurrencyStamp)

**Blocker**: ARCH-004 — Frontend reads `securityStamp` and `concurrencyStamp` from JWT. Removing them breaks TypeScript compilation.

### Option A — Keep claims in JWT (RECOMMENDED)
- `securityStamp` and `concurrencyStamp` remain in the JWT payload
- Frontend code unchanged
- These are already generated by Project B on every user update

**Pros**: Zero frontend changes. No type changes needed.
**Cons**: Security stamps are exposed to client (they already are — this is existing behavior, not a new exposure).

### Option B — Remove claims from JWT, remove from frontend type
- Remove from JWT generation in `token.service.ts`
- Remove from frontend `JwtPayload` type and `AuthUserType`
- Remove from `AuthHydrationProvider.tsx`

**Pros**: Cleaner JWT. Server-side values not exposed.
**Cons**: Frontend changes required (violates hard constraint). TypeScript compilation breaks until frontend is updated.

### Option C — Keep in JWT but stop reading in frontend
- Keep in JWT (backward compatible)
- Frontend stops using them in future iteration
- Gradual removal

**Pros**: Non-breaking now. Can clean up later.
**Cons**: Dead claims in JWT. Minor bloat.

### Recommendation
**Option A.** These values are already exposed in production. There's no security regression. The frontend hard constraint makes removal impossible.

---

## Decision 5: Password Hashing Unification

**Blocker**: DB-003 — Project A uses Argon2id, Project B uses bcrypt. Passwords created in one project cannot be verified by the other.

### Option A — Dual-hash with rehash-on-login (RECOMMENDED)
- User table stores `passwordHash` (bcrypt, used by Project B) and `argon2Hash` (used by Project A)
- Project B verifies against bcrypt, generates bcrypt hashes
- Project A verifies against Argon2id, generates Argon2id hashes
- On login, if the "other" hash is missing, compute it and store it
- New passwords are stored in both formats

**Pros**: Both projects work immediately. No password resets required. Gradual convergence.
**Cons**: Two hash columns. Slight storage overhead. Two verification paths.

### Option B — Standardize on bcrypt everywhere
- Project A switches to bcrypt (requires overriding Better Auth's hasher)
- All new passwords use bcrypt
- Existing Argon2id hashes verified via rehash-on-login

**Pros**: Single hash algorithm long-term.
**Cons**: Better Auth doesn't natively support bcrypt. Requires custom hasher implementation in Better Auth.

### Option C — Standardize on Argon2id everywhere
- Project B switches to Argon2id
- All new passwords use Argon2id
- Existing bcrypt hashes verified via rehash-on-login

**Pros**: Argon2id is the modern standard (OWASP recommended).
**Cons**: bcrypt is deeply embedded in Project B's user repository. Requires adding `@node-rs/argon2` dependency and rewriting hash/verify logic.

### Option D — Force password reset for all users
- All users must reset their passwords after migration
- Single hash algorithm from that point forward

**Pros**: Clean break. No dual-hash complexity.
**Cons**: Terrible UX. Users who don't reset can't log in. High support burden.

### Recommendation
**Option A** for the short term (zero disruption), with a long-term plan to converge on **Option C** (Argon2id) during a future maintenance window.

---

# Decision Matrix Summary

| # | Decision | Recommended | Risk if Wrong | Effort | Frontend Impact |
|---|----------|-------------|---------------|--------|-----------------|
| 1 | Auth ownership | Option A: B keeps auth | HIGH | LOW | NONE |
| 2 | Canonical table | Option A: identity.users | HIGH | MEDIUM | NONE |
| 3 | PK type | Option A: UUID everywhere | MEDIUM | MEDIUM | NONE |
| 4 | JWT claims | Option A: Keep claims | LOW | NONE | NONE |
| 5 | Password hashing | Option A: Dual-hash | MEDIUM | LOW | NONE |

---

# Next Steps

1. Stakeholders review this document
2. Make a decision on each of the 5 blockers
3. Decisions are recorded here with rationale
4. Revised implementation plans (06, 07) are issued reflecting the decisions
5. Re-review against the revised plans
