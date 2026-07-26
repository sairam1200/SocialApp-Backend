# AGENTS.md — Gaddr Search & Me, Backend

Entry point for Claude and other AI agents. Deliberately short: it routes you to
the authoritative document rather than restating it. Read this, then read the one
file that matches your task.

**Companion repo:** [`TeamGaddr/Gaddr-Search-Me-Frontend`](https://github.com/TeamGaddr/Gaddr-Search-Me-Frontend) — see its `AGENTS.md`.
**Full documentation index:** [`docs/index.md`](docs/index.md)

---

## How we build here

**[`docs/ENGINEERING_PHILOSOPHY.md`](docs/ENGINEERING_PHILOSOPHY.md) is a
governing document.** Read it once, apply it always. In one screen:

1. **Reuse before you build.** Search first, say what you are reusing. Extend >
   generalise > new. Never fork logic — two implementations of one idea is one
   bug that has to be fixed twice and will not be.
2. **Abstract, generalise, deduplicate.** One concept, one implementation, one
   place. The test is not elegance: *when this changes, how many places change?*
   More than one means the abstraction is wrong or missing.
3. **Make the wrong thing impossible**, not merely discouraged. Allow-lists over
   deny-lists. Fail closed. Money is `bigint` minor units so a float cannot
   appear; a balance is `SUM()` over a ledger so it cannot disagree with itself.
4. **Push work where it happens once.** Filter in SQL, batch at the boundary,
   derive at write time.
5. **Degrade, don't fail** — but never degrade an authorisation decision.
6. **Comment the *why*.** Every rule in these files was paid for once already.
7. **Prove it end to end.** A green gate is not evidence the application runs.
8. **The user is not the product's opponent.** Where they could diverge, choose
   the person.

Generalise on the *second* case, not the first — but deduplicate the moment you
are about to write the second copy. That is the cheapest it will ever be.

---

## Pick your entry point

Ten skills live in [`.claude/skills/`](.claude/skills/). Only their descriptions sit
in context; the body loads when one matches, so **naming the domain in your first
sentence is what makes the right one fire**. Load explicitly with `/skill-name` when
you already know which you need.

| You are doing | Load this |
|---|---|
| Anything touching auth, guards, tokens, sessions, CORS, rate limiting, webhooks | skill `gaddr-security-review` |
| Storing/reading secrets, OAuth tokens, the CBC→GCM migration | skill `gaddr-encryption` |
| Migrations, schema, entities, indexes, query performance, provisioning | skill `gaddr-database` |
| Adding or repairing a platform integration, or MCP exposure | skill `gaddr-platform-integration` |
| Any outbound call to a third-party API — timeouts, retries, 429s, quota, circuit breakers, or a failure you cannot diagnose from the logs | skill `gaddr-api-resilience` |
| Writing tests, a suite fails to start, or "does this actually work?" | skill `gaddr-testing` |
| Stripe, Gaddr Pay, payouts, marketplace, on-chain | skill `gaddr-payments` |
| The feed, posts, profiles, the composer, visibility, streaming, the creator economy | skill `gaddr-community` |
| Ranking, retrieval, candidate sources, why a post appears, the algorithm controls | skill `gaddr-recommender` |
| BankID, KYC, fraud, abuse, audit trails | skill `gaddr-fraud-identity` |

Each skill carries the defects its area has already produced. Loading one costs less
than rediscovering them — every rule in them was paid for once already.

### Sub-agents

Four in [`.claude/agents/`](.claude/agents/). Delegate when the work would otherwise
flood this conversation, or when you want the constraint enforced rather than merely
requested — `architect` and `reviewer` cannot write files at all.

| Agent | Use it for | Writes code |
|---|---|---|
| **architect** | Planning a feature, root-causing a bug, evaluating a dependency, designing a refactor | No |
| **backend** | Implementing in `src/` — endpoints, handlers, migrations, fixes | Yes |
| **redis** | Cache strategy, BullMQ queues, TTLs, memory and connection budget | Yes |
| **reviewer** | Pre-merge review of a diff or branch | No |

Typical chain: `architect` → `backend` (+ `redis` if caching is involved) → `reviewer`,
iterating until the reviewer reports no Critical or Major findings.

**Planning work?** [`docs/roadmap/IMPLEMENTATION_PLAN.md`](docs/roadmap/IMPLEMENTATION_PLAN.md)
has the sequenced plan and what is deliberately deferred.
**Search returning nothing?** Work through
[`docs/integrations/RESILIENCE_AND_LOGGING.md`](docs/integrations/RESILIENCE_AND_LOGGING.md)
§5 — it orders the checks cheapest-first, and the first two (is it configured, is its
circuit open) answer most cases without reading any code. Then
[`docs/integrations/STATUS.md`](docs/integrations/STATUS.md). A
platform whose credential is dead returns an empty array, not an error — by design, so
one bad integration cannot fail the whole search. That means "no results" is far more
often a credential than a bug. Two entries there are not credential problems at all:
**Dribbble's v2 API has no search endpoint**, and **Behance has no public API** — its
handler is a stub returning empty arrays, so debugging it is wasted time.

Five platforms return real data today, and **four of them need no credential**: GitHub,
Apple/iTunes, Openverse and Hacker News, plus YouTube on an API key. Verified end to end
as one search: 41 real results in 1.15 s, persisted to `contentStreams`, served back
through the read path in 0.46 s. See
[`docs/integrations/END_TO_END_VERIFICATION.md`](docs/integrations/END_TO_END_VERIFICATION.md)
for the trace and the defects it found. Adding another open source is a mapping function
on top of `searchOpenSourceAsync`, not new infrastructure — skill
`gaddr-platform-integration` has the template.

---

## Read this first

**[`docs/audit/2026-07_Security_And_Correctness_Audit.md`](docs/audit/2026-07_Security_And_Correctness_Audit.md)**

Non-negotiable before touching auth, crypto, or permissions. It records five
critical findings, which of them are fixed, which are deliberately left open and
*why*, and — importantly — a "Checked and cleared" section listing plausible bugs
that turned out not to be real. Reading it prevents you re-investigating settled
ground or "fixing" something that is already correct.

Two of the five critical findings are now **closed**, and the shape of each fix is
load-bearing — don't undo it:

- **C5, session revocation — closed.** `account.guard.ts` now reads the authoritative
  `securityStamp` from the database on a Redis cache miss, repopulates the cache, and
  rejects if neither can confirm. The ordering mattered: failing closed *without* the
  DB read would have logged out every user with a cold cache. Guards now take
  `IIdentityRepository` as a second constructor argument, resolvable because
  [`modules/identityAccess.module.ts`](src/modules/identityAccess.module.ts) is
  **`@Global()`**. That is not a shortcut: Nest resolves a guard's dependencies in the
  module where the guard is *used*, and these guards are applied across ~147 endpoints in
  a dozen-plus modules. The alternative is re-registering the repository's whole
  transitive graph in each one, which silently breaks the next module someone guards.
- **C4, token encryption — closed.** `crypto.util.ts` emits authenticated
  **AES-256-GCM** with a per-message random IV, keyed by HKDF, formatted
  `v2:<iv>:<ciphertext>:<authTag>`. `decrypt()` still routes hex CBC values to
  `encryptLegacy`. **Never delete that legacy branch** until stored tokens have been
  rewritten — every OAuth token in the database today is still CBC, so removing it is
  data loss, not cleanup. Never pass `keyParam`/`ivParam`; either forces the legacy path.

Still open:

- **`ENCRYPTION_KEY` has not been rotated.** It was in the committed dump. Needs
  production access, so it cannot be done from code.
- **A production DB dump is still in git history** at `e4b5f3b`. Removed from
  `HEAD`; the blob persists. Never re-add dumps — `.gitignore` blocks them.
- **Better Auth session tokens are stored in plaintext** in the `session` table
  (H2). Store `sha256(token)` and compare hashes.
- **`better-auth` is installed with zero imports** and its session logic is
  hand-rolled in raw SQL. Adopt-or-remove is a product decision; don't drift further.

One fixed defect worth remembering, because the shape recurs: `fuse.util.ts` used
`import Fuse from 'fuse.js'`, but fuse.js declares `export =`, and this tsconfig
sets `allowSyntheticDefaultImports` **without** `esModuleInterop`. That silences the
type error while emitting `new fuse_js_1.default(...)` — `undefined` at runtime. It
produced 500s on every global search once search history existed, so it worsened
gradually rather than failing on day one. Use `import X = require('…')` for any
`export =` dependency, and check the compiled `dist/` output, not just the types.

---

## What this service is

The API behind **Gaddr Search** (cross-platform social search and aggregation),
**Gaddr Me** (universal profile) and **Community** (the social layer — feed,
creator economy, livestreaming, learning). Part of the Gaddr family alongside
Gaddr Jobs, Gaddr Pay and Gaddr Chains.

NestJS 11 · TypeScript · TypeORM 0.3 · PostgreSQL (Neon) · Redis · BullMQ ·
Socket.IO · Cloudflare R2. Deployed to GCP Cloud Run. Live at `demo.gaddr.com`.

## Architecture in one screen

```
features/        HTTP use-cases — vertical slices, CQRS (431 command/query refs)
domain/          Models, entities, repository + service interfaces, mappers
infrastructure/  Concrete implementations — repositories, gateways, processors
modules/         NestJS module wiring
core/            Cross-cutting — guards, middleware, utils, exceptions, config
shared/          Cross-feature services (R2, video processing)
```

Dependency direction: `features → domain interfaces → infrastructure implementations`.
Never import `infrastructure` from `features` directly; resolve through a DI token.

Each layer has its own README — read the one you are working in:
[`src/features`](src/features/README.md) ·
[`src/domain`](src/domain/README.md) ·
[`src/infrastructure`](src/infrastructure/README.md) ·
[`src/core`](src/core/README.md) ·
[`src/modules`](src/modules/README.md)

Per-feature READMEs exist for
[auth](src/features/auth/README.md),
[search](src/features/search/README.md),
[integrations](src/features/integrations/README.md),
[profile](src/features/profile/README.md),
[user](src/features/user/README.md),
[onboarding](src/features/onboarding/README.md),
[notification](src/features/notification/README.md),
[playlist](src/features/playlist/README.md) and
[role](src/features/role/README.md).

## Community — the social layer

~36 tables in a `social` schema, 17 services, 8 controllers. Read
[`docs/social/ARCHITECTURE.md`](docs/social/ARCHITECTURE.md) before touching
any of it. Four decisions are load-bearing and easy to undo by accident:

- **One table for every timeline object.** `social.posts` with a `kind` column.
  A comment is a post with a parent, a repost is a post with a target, a story
  is a post that expires. Splitting them forks visibility, ranking, moderation,
  metrics, notifications and search — nine ways.
- **One visibility decision.** `visibilityPredicate()` in
  `core/utils/recommendation/visibility-scope.ts`, applied **in SQL**. A flat
  `visibility IN (...)` is wrong: it shows every author's close-friends posts to
  anyone who is somebody else's close friend. The predicate pairs each narrower
  level with the authors that granted it. Filtering after the query also
  silently shrinks pages and breaks the keyset cursor at boundaries.
- **One follow graph.** Community dispatches `FollowUserCommand` against
  `identity.user_follows`. Do not add a second graph keyed by profile.
  Do **not** re-register those handlers in `CommunityModule` — `CqrsModule`
  registers every handler into one global bus, and a second copy fails at boot
  on `ProfileCacheService`.
- **Sponsored posts are never boosted.** `blendSponsored` places them at a fixed
  cadence; their score is computed identically and multiplied by 1.0. If you are
  adding a ranker term for paid content, stop.

The recommender's pure kernel is in `core/utils/recommendation/` — no Nest, no
database, no clock — and has 87 unit tests. Put behaviour there, not in the
service, wherever it can be a function of its arguments.

**Crossing the layers?** `node scripts/community-smoke.js` drives 44 assertions
over HTTP against a real Postgres. It is not in `ci.sh` (which must run without
a database), so it is a manual gate before shipping social changes.
See [`scripts/README-smoke.md`](scripts/README-smoke.md).

## Request lifecycle — know this before touching auth

1. `HttpContextMiddleware` (`core/middlewares/`) runs on every route. It resolves
   the caller from a Better Auth session cookie *or* a JWT (header or cookie) and
   stores it in `AsyncLocalStorage`. **`HttpContext.user` is per-request safe** —
   it looks like shared static state but is not.
2. It verifies JWTs with `ignoreExpiration: true` **by design**, so the refresh
   endpoint can identify a caller from a lapsed token.
3. **Expiry is therefore enforced in `account.guard.ts`**, per guard, via the
   `ignoreExpiration` flag. `RefreshTokenGuard` is the only exemption. If you add
   a guard, inherit from `createAccountGuard` rather than reading `HttpContext.user`
   raw, or you will silently accept expired tokens.
4. `PermissionsGuard` verifies independently (expiry enforced) and requires an
   **exact** `Controller.method` permission match.

## Non-obvious constraints

| Constraint | Consequence |
|---|---|
| RAM 512 MB, 0.1 vCPU | Estimate memory for anything that buffers. No in-process caches of unbounded size. |
| Redis 30 MB, 30 connections | Reuse the shared client (`core/utils/redis.util`). Set a TTL on every key. |
| Redis is optional at boot | `main.ts` continues without it. Any code path that *requires* Redis must degrade explicitly, not assume presence. |
| R2 10 GB | Media goes to R2, never the container filesystem beyond temp. |
| Migrations auto-run on start | `POSTGRES_MIGRATIONS_RUN` defaults true — beware races across instances. |

## Conventions

| Category | Convention | Example |
|---|---|---|
| Feature directories | `kebab-case` | `create-user/` |
| Endpoints / handlers | `*.endpoint.ts` / `*.handler.ts` | `create-user.endpoint.ts` |
| Entities | `*.entity.ts` | `user.entity.ts` |
| Repository / service interfaces | `i*.repository.ts` / `i*.service.ts` | `iuser.repository.ts` |
| DI token constants | `IUPPERCASE` | `IUSER_REPOSITORY` |
| Redis keys | `gaddr:<domain>:<id>` | `gaddr:user_account:userId123` |

Key files: DI registry `infrastructure/dependency.ts` · DI tokens
`core/utils/const.ts` · Redis client `core/utils/redis.util.ts` · base entity
`domain/baseEntity.ts` · root module `modules/app.module.ts` · env schema
`src/configs.ts` (Joi — add every new variable here).

Known naming defects, safe to correct on sight: `UserAccoutGuard` /
`AdminAccoutGuard` / `GuestAccoutGuard` are misspelled (128 files);
`core/passport/` contains plain Nest guards, not Passport strategies; the
`userBiometrics` table holds profile image URLs, not biometrics.

## Working rules

1. **Search before creating.** `grep`/`glob` first; say what you are reusing.
   This is rule 1 of [`docs/ENGINEERING_PHILOSOPHY.md`](docs/ENGINEERING_PHILOSOPHY.md)
   and it is first for a reason.
2. **Extend, don't fork.** No parallel implementation of existing logic. Two
   parallel auth systems already exist — don't make it three.
3. **Preserve API contracts.** Additive changes only unless versioning.
4. **State resource impact** for anything touching RAM, Redis, DB or WebSocket.
5. **No `TODO`, no `console.log`, no hardcoded secrets.** Route logging through
   Winston (`core/utils/winston.util`), which redacts sensitive keys. There are
   already 136 stray `console.log` calls; don't add the 137th.
6. **Every new env var goes in `src/configs.ts`.** Secrets get no default —
   `.required()` and fail at boot. A guessable default is a vulnerability
   (see M2/M6 in the audit).
7. **Validate input.** There is no global `ValidationPipe` and `class-validator`
   is not installed, so hand-rolled Joi is the current norm. If you add DTO
   validation, add it per slice — enabling a global pipe with
   `forbidNonWhitelisted` before DTOs exist would reject live traffic.

## Verify your work

```bash
./scripts/ci.sh        # the whole gate — run this before pushing
./scripts/ci.sh --fast # skip the build step
```

Runs typecheck, lint, tests, secret scan and build in the same order as
[`cloudbuild.yaml`](cloudbuild.yaml), so a failure here is a failure in CI.
Individually:

```bash
npx tsc -p tsconfig.json --noEmit   # must stay at 0 errors
npx eslint src --ext .ts            # must stay at 0 errors
npx jest                            # 238 tests, 13 suites
npm run build
```

**All green on `main`. Keep it that way.**

Two things to know:

- **Lint has a warning budget, not a zero target.** 276 warnings remain, mostly
  `no-unused-vars`. `scripts/ci.sh` fails if the count *rises* — it fired once at 285 vs
  284 over a single new `case` block. Lower `LINT_WARNING_BUDGET` as you clean up; never
  raise it. Errors always fail.
- **Adding a `.required()` env var to `src/configs.ts`?** Add it to
  `test/jest-setup-env.ts` too, or every suite fails at import with a Joi error
  that looks unrelated to your change. See skill `gaddr-testing`.

Test coverage is concentrated on auth and search, where the audit found critical
defects. Everything else is uncovered — if you touch it, you are the first.

### A green gate is not evidence that the application runs

Learn this from the C5 fix rather than by repeating it. Adding a constructor dependency
to the account guards passed **typecheck and all 174 tests**, then failed at startup:

```
Nest can't resolve dependencies of the AccessLevelGuard (JwtService, ?).
Please make sure that the argument "IIdentityRepository" at index [1] is available…
```

Neither gate could have caught it. `tsc` does not evaluate a DI graph, and the guard
tests inject a stub repository directly — that is what makes them unit tests. **So after
any change to a provider, module, guard, entity or DI token, boot the process:**

```bash
npm run build && node dist/main.js   # watch for "Nest can't resolve dependencies"
```

The same class of gap explains three other defects here: the `fuse.js` interop 500 (types
fine, `dist/` wrong), the non-recursive entity glob (`Entity metadata … not found`), and
`searchText` landing NULL on every row because a raw bulk INSERT names its columns
explicitly and the entity default never ran. Typecheck, unit tests and a real process
each see something the others cannot.

### CI/CD

GitHub Actions is deliberately unused (cost). [`cloudbuild.yaml`](cloudbuild.yaml)
runs install → (typecheck ‖ lint ‖ test ‖ secret-scan) → compile → docker →
deploy to Cloud Run, pinned to the immutable `$SHORT_SHA` tag so rollback is a
traffic switch. Secret scanning is configured in
[`.gitleaks.toml`](.gitleaks.toml) — it allowlists verified false positives and
adds a rule that catches committed database dumps by content.
