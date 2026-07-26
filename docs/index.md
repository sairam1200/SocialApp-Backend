# Documentation index — Gaddr Search & Me, Backend

Every document in this repository, with what it is for and whether it is current.
Start from [`../AGENTS.md`](../AGENTS.md) if you are an AI agent.

**Frontend counterpart:** [`TeamGaddr/Gaddr-Search-Me-Frontend`](https://github.com/TeamGaddr/Gaddr-Search-Me-Frontend) → `docs/index.md`

---

## 1. Start here

| Document | Purpose |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Agent entry point — architecture, request lifecycle, conventions, working rules |
| [`../README.md`](../README.md) | Human onboarding — setup, environment, running locally |
| [`audit/2026-07_Security_And_Correctness_Audit.md`](audit/2026-07_Security_And_Correctness_Audit.md) | **Read before touching auth, crypto or permissions.** Verified findings, remediation status, and settled non-issues |
| [`roadmap/IMPLEMENTATION_PLAN.md`](roadmap/IMPLEMENTATION_PLAN.md) | **Where the platform is and what to build next.** Sequenced phases, what is deliberately deferred and why, plus the legal questions needing professional review |
| [`integrations/STATUS.md`](integrations/STATUS.md) | **Which platform credentials actually work**, verified by live API call. Check this before debugging "search returns nothing" |
| [`integrations/RESILIENCE_AND_LOGGING.md`](integrations/RESILIENCE_AND_LOGGING.md) | Outbound HTTP protections (timeout, jittered retry, per-platform circuit breaker), credential guards, and why 86 log sites recorded no cause — plus how to diagnose "this platform returns nothing" |
| [`integrations/END_TO_END_VERIFICATION.md`](integrations/END_TO_END_VERIFICATION.md) | A real run of the full search chain — five live platform APIs → Postgres → user-facing endpoint — with the five defects it exposed and how to reproduce it |

## 1b. Skills and sub-agents

Loadable capability documents, kept beside the code so they stay accurate. Only the
`description` and `when_to_use` of each sits in context at rest; the body loads when
one matches the task, or on an explicit `/skill-name`.

| Skill | Covers |
|---|---|
| [`gaddr-security-review`](../.claude/skills/gaddr-security-review/SKILL.md) | Auth, guards, tokens, sessions, CORS, webhooks, rate limiting |
| [`gaddr-encryption`](../.claude/skills/gaddr-encryption/SKILL.md) | Data at rest, key management, the CBC→GCM migration |
| [`gaddr-database`](../.claude/skills/gaddr-database/SKILL.md) | Migrations, entities, indexes, query performance, provisioning |
| [`gaddr-platform-integration`](../.claude/skills/gaddr-platform-integration/SKILL.md) | Adding or repairing a platform; API and MCP exposure |
| [`gaddr-api-resilience`](../.claude/skills/gaddr-api-resilience/SKILL.md) | Outbound HTTP: timeouts, retries, jittered backoff, circuit breakers, rate limits, quota, and diagnostic logging |
| [`gaddr-testing`](../.claude/skills/gaddr-testing/SKILL.md) | Writing and running tests; the env bootstrap; end-to-end verification |
| [`gaddr-payments`](../.claude/skills/gaddr-payments/SKILL.md) | Stripe, Gaddr Pay, marketplace payouts, SCA/VAT, on-chain |
| [`gaddr-fraud-identity`](../.claude/skills/gaddr-fraud-identity/SKILL.md) | Mobile BankID, KYC tiers, fraud signals, abuse defence |

Sub-agents in [`../.claude/agents/`](../.claude/agents/), with the skills each one
carries into its own context:

| Agent | Role | Writes code | Preloaded skill |
|---|---|---|---|
| `architect` | Plans, root-causes, evaluates dependencies | No — `Edit`/`Write` denied | none; loads per domain |
| `backend` | Implements in `src/` | Yes | `gaddr-testing` |
| `redis` | Cache strategy, BullMQ, TTL and memory budget | Yes | none; loads per domain |
| `reviewer` | Pre-merge review | No — `Edit`/`Write` denied | `gaddr-security-review` |

All four hold the `Skill` tool, so they can load any of the seven on demand. The
read-only pair enforce that with `disallowedTools`, not just wording — an agent that
is told not to edit but can still edit eventually does.

> Frontend skills live in the other repository and do **not** load here: skills are
> scoped to the directory tree they sit in. The frontend has `gaddr-frontend-ui`,
> `gaddr-i18n` and `gaddr-frontend-testing`.

## 1c. Build and CI

| File | Purpose |
|---|---|
| [`../cloudbuild.yaml`](../cloudbuild.yaml) | Cloud Build pipeline → Cloud Run. GitHub Actions deliberately unused (cost) |
| [`../scripts/ci.sh`](../scripts/ci.sh) | Same gate, locally. Typecheck, lint, tests, secret scan, build |
| [`../.gitleaks.toml`](../.gitleaks.toml) | Secret-scan config. Allowlists verified false positives; adds a rule catching committed DB dumps by content |
| [`../test/jest-setup-env.ts`](../test/jest-setup-env.ts) | Env bootstrap that makes importing real modules in tests possible |

## 2. Source-tree documentation

Layer READMEs live beside the code they describe, so they stay honest.

| Layer | Document |
|---|---|
| Overview | [`../src/README.md`](../src/README.md) |
| Features (vertical slices, CQRS) | [`../src/features/README.md`](../src/features/README.md) |
| Domain (models, interfaces) | [`../src/domain/README.md`](../src/domain/README.md) |
| Infrastructure (implementations) | [`../src/infrastructure/README.md`](../src/infrastructure/README.md) |
| Core (cross-cutting) | [`../src/core/README.md`](../src/core/README.md) |
| Modules (DI wiring) | [`../src/modules/README.md`](../src/modules/README.md) |

**Infrastructure detail:**
[persistence](../src/infrastructure/persistence/README.md) ·
[repositories](../src/infrastructure/repositories/README.md) ·
[services](../src/infrastructure/services/README.md) ·
[migrations](../src/infrastructure/migrations/README.md) ·
[background jobs](../src/infrastructure/background/README.md) ·
[websocket](../src/infrastructure/websocket/README.md)

**Feature detail:**
[auth](../src/features/auth/README.md) ·
[search](../src/features/search/README.md) ·
[integrations](../src/features/integrations/README.md) ·
[profile](../src/features/profile/README.md) ·
[user](../src/features/user/README.md) ·
[onboarding](../src/features/onboarding/README.md) ·
[notification](../src/features/notification/README.md) ·
[playlist](../src/features/playlist/README.md) ·
[role](../src/features/role/README.md)

> **Known drift:** [`../src/modules/README.md`](../src/modules/README.md) states that
> `DataSeeder.initializeAsync()` runs on bootstrap. It does not — the call is
> commented out at `app.module.ts:76`, so roles are never seeded on a fresh
> environment. See finding M2 in the audit before re-enabling it.

## 3. API contracts

| Document | Purpose |
|---|---|
| [`asyncapi.yaml`](asyncapi.yaml) | WebSocket/event contract (AsyncAPI) |
| [`AsyncAPI/index.html`](AsyncAPI/index.html) | Rendered AsyncAPI reference |
| Swagger / Scalar | Served at runtime, **non-production only** (`main.ts` gates on `configs.env`) |

## 4. Architecture and migration history

These document the Search + Me consolidation. They use generic `ProjectA` /
`ProjectB` naming; `_v2` supersedes the unsuffixed version where both exist.

| Document | Purpose |
|---|---|
| [`01_ProjectA_Architecture_v2.md`](01_ProjectA_Architecture_v2.md) | Project A architecture (current) |
| [`02_ProjectB_Architecture_v2.md`](02_ProjectB_Architecture_v2.md) | Project B architecture (current) |
| [`03_Schema_Comparison_v2.md`](03_Schema_Comparison_v2.md) | Schema differences |
| [`04_Shared_Identity_Architecture_v2.md`](04_Shared_Identity_Architecture_v2.md) | Shared identity model — relevant to the two-auth-systems problem (H2) |
| [`05_Migration_Strategy_v2.md`](05_Migration_Strategy_v2.md) | Migration approach |
| [`06_ProjectA_Changes_v2.md`](06_ProjectA_Changes_v2.md) · [`07_ProjectB_Changes_v2.md`](07_ProjectB_Changes_v2.md) | Required changes per project |
| [`08_Master_Architecture_Review.md`](08_Master_Architecture_Review.md) | Consolidated review |
| [`08_Final_Architecture_Review.md`](08_Final_Architecture_Review.md) · [`08_Architecture_Review_Summary.md`](08_Architecture_Review_Summary.md) | Earlier review passes |
| [`09_Build_Compatibility_Report.md`](09_Build_Compatibility_Report.md) | Build compatibility |
| [`09_Table_Comparison.md`](09_Table_Comparison.md) | Table-level comparison |
| [`10_Risk_Register.md`](10_Risk_Register.md) | Migration risks |
| [`10_Rename_Strategy_Investigation.md`](10_Rename_Strategy_Investigation.md) · [`11_Domain_Rename_Analysis.md`](11_Domain_Rename_Analysis.md) · [`12_UserRepository_Rename_Analysis_Project_B.md`](12_UserRepository_Rename_Analysis_Project_B.md) | Rename analyses |
| [`11_Rollback_Strategy.md`](11_Rollback_Strategy.md) | Rollback plan |
| [`12_Critical_Blocker_Decisions.md`](12_Critical_Blocker_Decisions.md) | Blocker decisions |
| [`analysis-youtube-analytics-import.md`](analysis-youtube-analytics-import.md) | YouTube analytics import design |
| [`../audit/`](../audit/) | Superseded first-pass architecture docs (`01`, `06`) — kept for history |
| [`../RESTORE_REPORT.md`](../RESTORE_REPORT.md) | Restore operation record |

## 5. Conventions for adding documentation

- **Layer and feature docs live beside the code** (`src/**/README.md`) so they are
  reviewed in the same diff. Cross-cutting documents live here in `docs/`.
- **Add every new document to this index.** An unlisted document is one an agent
  will not find.
- **Date and scope point-in-time analyses** (audits, reviews) and record the commit
  they were verified against.
- **Prefer correcting a document over adding a `_v3`.** The `_v2` proliferation
  above is what to avoid; git history is the version record.
- **When code contradicts a document, fix the document in the same change** — or
  flag the drift explicitly, as done for `DataSeeder` in §2.

## 6. Known gaps

Tracked so they are not rediscovered. Detail in the audit, §6 "Gaps against the
stated product mandate".

| Gap | State |
|---|---|
| Test coverage | **238 tests, 13 suites**, all passing (was 0). Concentrated on auth and search — the areas with critical findings. Everything else is uncovered. No suite here starts a real server, so backend end-to-end verification is still manual; see `integrations/END_TO_END_VERIFICATION.md`. |
| Request validation | No global `ValidationPipe`; `class-validator` not installed. Joi is used per-handler and for env config. |
| Rate limiting | ✅ Search is limited by `searchRateLimit.guard.ts` using atomic Redis `INCR`, per user when authenticated and per client IP otherwise, with a bounded per-instance fallback when Redis is down. `trust proxy` is set, so `req.ip` is correct. **Outstanding:** the older `RateLimitMiddleware` still covers only 4 auth routes via a non-atomic DB read-then-write. |
| Security headers | No `helmet`; no CSP, HSTS, or frame options. This is what makes the frontend's `localStorage` token exposure (H3) exploitable. |
| Session revocation | ✅ **Closed (C5).** Cache miss now falls back to the database, repopulates, and fails closed. Guards take `IIdentityRepository`, resolvable because `modules/identityAccess.module.ts` is `@Global()` — Nest resolves a guard's dependencies where the guard is *used*, and these cover ~147 endpoints across a dozen-plus modules. |
| Token encryption | ✅ **Closed (C4).** AES-256-GCM, per-message random IV, HKDF-derived key, `v2:` format, with dual-read so stored CBC values stay readable. **Outstanding:** `ENCRYPTION_KEY` rotation (needs production access) and removal of the legacy branch once legacy reads reach zero. |
| Redis client | ✅ **Fixed.** `ioredis` is now a declared dependency; it was imported while arriving only transitively via BullMQ. The unused `redis` (node-redis v4) and `@types/redis` are removed. They were a live trap, not clutter: node-redis silently *ignores* ioredis's positional `set(k, v, 'EX', ttl, 'NX')` — measured as NX not honoured (lock not exclusive) and TTL `-1` (key never expires). |
| Fresh-environment boot | ✅ **Fixed.** `POSTGRES_ENTITIES` and `POSTGRES_MIGRATIONS` are optional in `configs.ts`, and `data.source.ts` concatenated `undefined` into the path when unset — TypeORM then found zero migrations, created the bookkeeping table, and reported a **successful start against an empty database** (1 table where 42 were expected, nothing in the log). Both globs now default correctly, and an unresolvable migration glob throws instead of booting. Verified: a fresh database reaches 42 tables and 53 migrations with neither variable set. |
| Search correctness | ✅ **Verified 2026-07-26.** 100% precision on three sampled queries; result set and order byte-identical across 6 repeats; 0 duplicate `(platform, externalId)` pairs under 8 concurrent writes; blank and 600-char keywords rejected; injection payload left all rows intact. One real defect found and fixed: a keyword of `%` returned the whole table because it was interpolated into an `ILIKE` pattern unescaped — see [`integrations/END_TO_END_VERIFICATION.md`](integrations/END_TO_END_VERIFICATION.md). |
| Result caching | ✅ **13 of 16 platforms persist to `contentStreams`.** The three that do not — snapchat, threads, behance — are stubs making zero outbound calls, so nothing is collected to cache. Behance has no public API at all. |
| Migrations on boot | ✅ **`POSTGRES_MIGRATIONS_RUN` now defaults to `false`.** It defaulted to `true` while the glob was unresolvable, so it was a silent no-op; fixing the glob switched migrations on everywhere and broke a production deploy on `InitialCreate` → `relation "userRoles" already exists`. Applying migrations is now the explicit `npm run migration:run`. Cloud Run runs up to 4 instances, so auto-apply was a race hazard regardless. |
| Payments / KYC | Nothing built. Both land on the auth layer — settle the open C-series findings first. |
| Result attribution | ✅ **Fixed.** `renderPlatformIcon` in the frontend returned `null` for any platform without a bundled brand SVG — four of the five that actually return data. Results rendered with no indication of their source, which for an aggregation product reads as Gaddr's own content. Now a monogram badge plus a full source name in the card footer, so a newly added platform is attributed with no UI change. Openverse licence and creator now travel the whole chain: an unattributed CC-BY image is a licence breach, not a cosmetic gap. |
| Platform credentials | **Five platforms verified end to end**, four needing no credential (GitHub, Apple, Openverse, Hacker News) plus YouTube on an API key. YouTube's ~100 searches/day quota is the binding limit on the one keyed source. Seven remain blocked on their owners' portals, 2FA or app review; Dribbble and Behance have no search API at all. See [`integrations/STATUS.md`](integrations/STATUS.md). |

Full sequencing in [`roadmap/IMPLEMENTATION_PLAN.md`](roadmap/IMPLEMENTATION_PLAN.md).
