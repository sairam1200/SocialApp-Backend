# AGENTS.md — Gaddr Search & Me, Backend

Entry point for Claude and other AI agents. Deliberately short: it routes you to
the authoritative document rather than restating it. Read this, then read the one
file that matches your task.

**Companion repo:** [`TeamGaddr/Gaddr-Search-Me-Frontend`](https://github.com/TeamGaddr/Gaddr-Search-Me-Frontend) — see its `AGENTS.md`.
**Full documentation index:** [`docs/index.md`](docs/index.md)

---

## Pick your entry point

Seven skills live in [`.claude/skills/`](.claude/skills/). Only their descriptions sit
in context; the body loads when one matches, so **naming the domain in your first
sentence is what makes the right one fire**. Load explicitly with `/skill-name` when
you already know which you need.

| You are doing | Load this |
|---|---|
| Anything touching auth, guards, tokens, sessions, CORS, rate limiting, webhooks | skill `gaddr-security-review` |
| Storing/reading secrets, OAuth tokens, the CBC→GCM migration | skill `gaddr-encryption` |
| Migrations, schema, entities, indexes, query performance, provisioning | skill `gaddr-database` |
| Adding or repairing a platform integration, or MCP exposure | skill `gaddr-platform-integration` |
| Writing tests, a suite fails to start, or "does this actually work?" | skill `gaddr-testing` |
| Stripe, Gaddr Pay, payouts, marketplace, on-chain | skill `gaddr-payments` |
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
**Search returning nothing?** Check
[`docs/integrations/STATUS.md`](docs/integrations/STATUS.md) before debugging code —
several platform credentials are dead, and a 401 is silent by design. For how the
whole chain was verified against the live YouTube API, and the four defects that
found, see [`docs/integrations/END_TO_END_VERIFICATION.md`](docs/integrations/END_TO_END_VERIFICATION.md).

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
  `IIdentityRepository` as a second constructor argument — a new guard needs the same
  wiring via `authGuard.module`.
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

The API behind **Gaddr Search** (cross-platform social search and aggregation)
and **Gaddr Me** (universal profile). Part of the Gaddr family alongside Gaddr
Jobs, Gaddr Pay and Gaddr Chains.

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
npx jest                            # 119 tests, 7 suites
npm run build
```

**All green on `main`. Keep it that way.**

Two things to know:

- **Lint has a warning budget, not a zero target.** 284 warnings remain (239
  `no-unused-vars`). `scripts/ci.sh` fails if the count *rises*. Lower
  `LINT_WARNING_BUDGET` as you clean up; never raise it. Errors always fail.
- **Adding a `.required()` env var to `src/configs.ts`?** Add it to
  `test/jest-setup-env.ts` too, or every suite fails at import with a Joi error
  that looks unrelated to your change. See skill `gaddr-testing`.

Test coverage is concentrated on auth and search, where the audit found critical
defects. Everything else is uncovered — if you touch it, you are the first.

### CI/CD

GitHub Actions is deliberately unused (cost). [`cloudbuild.yaml`](cloudbuild.yaml)
runs install → (typecheck ‖ lint ‖ test ‖ secret-scan) → compile → docker →
deploy to Cloud Run, pinned to the immutable `$SHORT_SHA` tag so rollback is a
traffic switch. Secret scanning is configured in
[`.gitleaks.toml`](.gitleaks.toml) — it allowlists verified false positives and
adds a rule that catches committed database dumps by content.
