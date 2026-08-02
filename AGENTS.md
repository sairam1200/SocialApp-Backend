<<<<<<< HEAD
# AGENTS.md — the Gaddr agent system, across both repositories

This is the **cross-repo** document: what the agent system is, how the two halves fit
together, and the rules for extending it. It does not restate either repository's own
`AGENTS.md` — those are the per-repo entry points, and they are the ones an agent
working in a checkout actually reads.

| If you are | Read |
|---|---|
| Working in the backend checkout | [`backend/AGENTS.md`](backend/AGENTS.md) |
| Working in the frontend checkout | [`frontend/AGENTS.md`](frontend/AGENTS.md) |
| Extending or maintaining the agent system itself | this file, then [`index.md`](index.md) |

---

## What the system is

Two products — **Gaddr Search** (cross-platform social search) and **Gaddr Me**
(universal profile) — built as two repositories that deploy independently. Each carries
its own agent configuration under `.claude/`:

```
backend/                            frontend/
  AGENTS.md         entry point       AGENTS.md         entry point
  docs/index.md     doc index         docs/index.md     doc index
  .claude/
    agents/   4 sub-agents              agents/   4 sub-agents
    skills/   7 skills                  skills/   3 skills
```

**Skills and sub-agents are scoped to the directory tree they live in.** Backend skills
do not load while you are working in the frontend, and vice versa. This is a feature —
it keeps ten skill descriptions out of context when only three are relevant — but it
means a task spanning both repos is two pieces of work, not one. Do not expect a single
session to carry both sets of domain knowledge.

## The two layers, and when each applies

**Skills** are knowledge. Only a skill's `description` and `when_to_use` sit in context;
the body loads when one matches the task or you type `/skill-name`. That is why the
descriptions carry literal trigger phrases — a skill that never fires is worse than no
skill, because the knowledge exists and is not applied.

**Sub-agents** are workers with their own context window, tool set and system prompt.
Delegate when a side task would flood the main conversation, or when a constraint should
be enforced rather than requested.

| Repo | Agents | Skills |
|---|---|---|
| backend | `architect`, `backend`, `redis`, `reviewer` | `gaddr-security-review`, `gaddr-encryption`, `gaddr-database`, `gaddr-platform-integration`, `gaddr-testing`, `gaddr-payments`, `gaddr-fraud-identity` |
| frontend | `architect`, `frontend`, `reviewer`, `ui-tester` | `gaddr-frontend-ui`, `gaddr-i18n`, `gaddr-frontend-testing` |

Both repos use the same shape: **architect plans → an implementer writes → a reviewer
checks**, with a specialist alongside (backend `redis`, frontend `ui-tester`).

### Enforced, not requested

Every agent that "does not write code" says so in its prompt *and* is denied the tools:

```yaml
tools: Read, Grep, Glob, Bash, Skill
disallowedTools: Edit, Write, NotebookEdit
```

An agent told not to edit but able to edit eventually will. `disallowedTools` is applied
before `tools` resolves, so an entry in both is removed.

### Every agent can reach the skills

Each agent lists `Skill` in `tools`, and the ones with a near-universal dependency
preload it via `skills:`, which injects the full body at startup:

| Agent | Preloads | Why |
|---|---|---|
| backend `backend` | `gaddr-testing` | Every change ends at the CI gate, and the env bootstrap blocks everyone once |
| backend `reviewer` | `gaddr-security-review` | Every review checks the diff against the known findings |
| frontend `frontend` | `gaddr-frontend-ui` | Every UI change touches tokens, SEO or copy |
| frontend `reviewer` | `gaddr-frontend-ui` | Same checklist, from the other side |
| frontend `ui-tester` | `gaddr-frontend-testing` | It needs the suite's constraints before it runs anything |

The rest are loaded on demand, routed by a table in each agent's prompt. This was a real
defect worth remembering: the agents used to instruct themselves to "load the
`gaddr-database` skill" while `Skill` was absent from their `tools` list, so the
instruction could not be followed. If a prompt names a capability, check the frontmatter
actually grants it.

## What the two repositories teach each other

Kept here because each lesson was paid for once and applies on both sides.

**Unit tests certify units, not products.** Four defects reached production with every
unit test green: aggregated results persisted and never read back, a migration chain
that could not build from empty, connection variables silently discarded, and a `fuse.js`
import that compiled to `undefined`. Each was a gap *between* correct units. The frontend
acted on this by adding Playwright; the backend still verifies boundary-crossing changes
by hand, which is its largest remaining gap.

**The gate has to be the real gate.** Vercel does not typecheck, so `next build` passed
green while `type-check` reported 130 errors. Cloud Build does more, but not everything.
Both repos now carry `scripts/ci.sh` that mirrors the real pipeline locally, and both are
the thing to run before pushing — not the framework's own build.

**A cache miss must not be more permissive than a cache hit — and must not be an outage.**
Session revocation used to skip its check entirely when Redis was cold. The fix was not
to invert it: failing closed without a database fallback logs out every user with a cold
cache. Read, repopulate, then decide. The same shape governs rate limiting, which
degrades to a bounded local counter rather than to "unlimited".

**Contracts break in the gap between two deployments.** The repos deploy independently,
so for a window an old backend serves a new client. Additive changes only, and a new
field must be safe to be absent on the other side.

**Document the defect you left open.** Where a fix has to wait, the current behaviour is
asserted in a test with a `DOCUMENTS finding <id>` comment naming the expectation to
invert. That paid off twice: C4 and C5 both closed, and the assertions to flip were
already written down. The corollary is a maintenance duty — a `DOCUMENTS` comment
pointing at a closed finding is a test certifying a bug that no longer exists.

## Extending the system

1. **New skill?** One domain per skill. Write the `description` as *what it does* plus
   *when to use it*, in the third person, and put literal trigger phrases in
   `when_to_use`. Combined they are truncated at 1,536 characters. Keep the body under
   500 lines; split into sibling files referenced **one level deep** from `SKILL.md`
   rather than nesting.
2. **New sub-agent?** Only when you keep spawning the same worker with the same
   instructions. Give it the narrowest `tools` that lets it finish, and deny the rest.
3. **New rule?** Put it where it is enforced. A rule about migrations belongs in
   `gaddr-database`, not in `AGENTS.md` — the entry point routes, the skill instructs.
4. **Changed reality?** Fix the document in the same change. Everything measurable in
   these files — test counts, warning budgets, table counts — should be a number someone
   ran, and should carry the date if it will move.
5. **Then run `./sync.sh --check`** from this bundle, so the distributable copy does not
   quietly fall behind. See [`index.md`](index.md).

## Infrastructure constraints that shape both sides

| Resource | Limit | Consequence |
|---|---|---|
| Cloud Run RAM | 512 MB, 0.1 vCPU | Stream, never buffer. No unbounded in-process cache. |
| Redis | 30 MB, 30 connections | Every key gets a TTL. Reuse the shared client. |
| Cloudflare R2 | 10 GB | Media goes to R2, never the container filesystem. |
| YouTube API | ~100 searches/day | `search.list` costs 100 of 10,000 daily units. Any wider fan-out needs a quota answer. |
=======
# AGENTS.md — Gaddr Search & Me, Backend

Entry point for Claude and other AI agents. **This file routes; it does not restate.** Every
section links to the document that owns the detail — read this, then read the one file that
matches your task.

Deliberately kept near 150 lines. Beyond that, context files show diminishing returns and
measurably raise inference cost, and everything here is already written down somewhere more
specific. To add a paragraph, add it to the skill or doc that owns the subject and link it here.

**Companion repo:** [`TeamGaddr/Gaddr-Search-Me-Frontend`](https://github.com/TeamGaddr/Gaddr-Search-Me-Frontend) — see its `AGENTS.md`.
**Full documentation index:** [`docs/index.md`](docs/index.md)

---

## Three things that are true here and nowhere else

Read these even if you read nothing else on this page. Each one cost a real incident.

**1. A green gate is not evidence the application runs.** `tsc` cannot evaluate a DI graph, and
a guard unit test injects a stub by definition. The C5 fix passed typecheck and 174 tests and
left the app unbootable. After touching a provider, module, guard, entity or DI token:

```bash
npm run build && node dist/main.js   # grep for "can't resolve dependencies"
```

**2. A default is a behaviour change.** `POSTGRES_MIGRATIONS` had no default, so the glob was
unresolvable, so `migrationsRun: true` was a silent no-op everywhere. Giving the glob a correct
default switched migrations on in production and broke a deploy on `relation "userRoles"
already exists`. Migrations are now explicit — `npm run migration:run` — and
`POSTGRES_MIGRATIONS_RUN` defaults to **false**. Do not helpfully switch it back.

**3. Validated config is not consumed config.** Three defects were the same shape:
`DATABASE_URL`, `REDIS_URL` and the frontend's `errors` translation namespace were each
validated, exposed, and read by nothing. When you add a variable, grep that something reads it.

---

## Pick your entry point

Eleven skills in [`.claude/skills/`](.claude/skills/). Only their descriptions sit in context;
the body loads when one matches, so **naming the domain in your first sentence is what makes
the right one fire**. Load explicitly with `/skill-name` when you know which you need.

| You are doing | Load this |
|---|---|
| Auth, guards, tokens, sessions, CORS, rate limiting, webhooks, security headers | skill `gaddr-security-review` |
| Storing/reading secrets, OAuth tokens, the CBC→GCM migration | skill `gaddr-encryption` |
| Migrations, schema, entities, indexes, query performance, `LIKE` escaping | skill `gaddr-database` |
| Adding or repairing a platform integration, or MCP exposure | skill `gaddr-platform-integration` |
| Any outbound call — timeouts, retries, 429s, quota, breakers, undiagnosable failures | skill `gaddr-api-resilience` |
| Writing tests, a suite fails to start, or "does this actually work?" | skill `gaddr-testing` |
| Stripe, Gaddr Pay, payouts, marketplace, on-chain | skill `gaddr-payments` |
| BankID, KYC, fraud, abuse, audit trails | skill `gaddr-fraud-identity` |
| The Community social layer — feed, posts, composer, visibility and audiences, messaging, creator economy, livestreaming, learning | skill `gaddr-community` |
| The recommender — candidate retrieval, Reciprocal Rank Fusion, multi-objective ranking, MMR diversification, sponsored blending, topic affinity | skill `gaddr-recommender` |
| Returning text a user reads, error messages, or handling non-Latin scripts in search | skill `gaddr-i18n` |

Each skill carries the defects its area has already produced. Loading one costs less than
rediscovering them.

### Sub-agents

Four in [`.claude/agents/`](.claude/agents/). Delegate when the work would flood this
conversation, or when you want a constraint enforced rather than requested — `architect` and
`reviewer` cannot write files at all.

| Agent | Use it for | Writes code |
|---|---|---|
| **architect** | Planning, root-causing, evaluating a dependency, designing a refactor | No |
| **backend** | Implementing in `src/` — endpoints, handlers, migrations, fixes | Yes |
| **redis** | Cache strategy, BullMQ queues, TTLs, memory and connection budget | Yes |
| **reviewer** | Pre-merge review of a diff or branch | No |

Typical chain: `architect` → `backend` (+ `redis` if caching is involved) → `reviewer`.

---

## Before you touch anything

| Subject | Read first | Why |
|---|---|---|
| **How we build here** | [`docs/ENGINEERING_PHILOSOPHY.md`](docs/ENGINEERING_PHILOSOPHY.md) | Governing document. Reuse before building; one concept, one implementation; never fork logic. |
| **Auth, crypto, permissions** | [`docs/audit/2026-07_Security_And_Correctness_Audit.md`](docs/audit/2026-07_Security_And_Correctness_Audit.md) | Five critical findings, which are closed, which are open and *why*, plus a "checked and cleared" list so you don't re-investigate settled ground. |
| **The social layer** (~36 tables, 17 services) | [`docs/social/ARCHITECTURE.md`](docs/social/ARCHITECTURE.md) | Four load-bearing decisions that are easy to undo by accident — one table for every timeline object, one visibility decision applied in SQL. |
| **Search returns nothing** | [`docs/integrations/RESILIENCE_AND_LOGGING.md`](docs/integrations/RESILIENCE_AND_LOGGING.md) §5 | Cheapest-first diagnosis. The first two checks answer most cases without reading code. |
| **"Does search actually work?"** | [`docs/integrations/END_TO_END_VERIFICATION.md`](docs/integrations/END_TO_END_VERIFICATION.md) | A real run of the full chain against five live APIs, with the defects it exposed, measured precision, and how to reproduce it. |
| **Platform credentials** | [`docs/integrations/STATUS.md`](docs/integrations/STATUS.md) | Five platforms work; four need no credential. Dribbble and Behance have **no search API** — debugging them is wasted time. |
| **What's planned** | [`docs/roadmap/IMPLEMENTATION_PLAN.md`](docs/roadmap/IMPLEMENTATION_PLAN.md) | Sequenced plan and what is deliberately deferred. |

Two closed findings whose **shape is load-bearing** — don't undo them:

- **C4, token encryption.** `crypto.util.ts` emits authenticated AES-256-GCM as
  `v2:<iv>:<ct>:<tag>`. **Never delete the legacy CBC branch** in `decrypt()` — every stored
  OAuth token is still CBC, so removing it is data loss. Never pass `keyParam`/`ivParam`.
- **C5, session revocation.** Guards read the authoritative `securityStamp` from the database
  on a cache miss, then fail closed. Resolvable only because
  [`modules/identityAccess.module.ts`](src/modules/identityAccess.module.ts) is `@Global()`:
  Nest resolves a guard's dependencies where the guard is *used*, across ~147 endpoints.

---

## What this service is

The API behind **Gaddr Search** (cross-platform social search) and **Gaddr Me** (universal
profile). NestJS 11 · TypeScript · TypeORM 0.3 · PostgreSQL (Neon) · Redis (**ioredis**) ·
BullMQ · Socket.IO · Cloudflare R2. Deployed to GCP Cloud Run.

```
features/        HTTP use-cases — vertical slices, CQRS
domain/          Models, entities, repository + service interfaces, mappers
infrastructure/  Concrete implementations — repositories, gateways, processors
modules/         NestJS module wiring
core/            Cross-cutting — guards, middleware, utils, exceptions, config
shared/          Cross-feature services (R2, video processing)
```

`features → domain interfaces → infrastructure implementations`. Never import
`infrastructure` from `features`; resolve through a DI token. Each layer has a README — read
the one you are working in: [features](src/features/README.md) · [domain](src/domain/README.md) ·
[infrastructure](src/infrastructure/README.md) · [core](src/core/README.md) ·
[modules](src/modules/README.md). **Individual features have their own READMEs too** —
`src/features/<name>/README.md` exists for auth, search, integrations, profile, user,
onboarding, notification, playlist and role. Check for one before reading the code.

**Request lifecycle, for auth work:** `HttpContextMiddleware` resolves the caller into
`AsyncLocalStorage` — `HttpContext.user` looks like shared static state but is **per-request
safe**. It verifies JWTs with `ignoreExpiration: true` *by design*, so expiry is enforced in
`account.guard.ts` per guard. Inherit from `createAccountGuard`; reading `HttpContext.user` raw
silently accepts expired tokens.

### Non-obvious constraints

| Constraint | Consequence |
|---|---|
| RAM 512 MB, 0.1 vCPU | Estimate memory for anything that buffers. No unbounded in-process caches. |
| Redis 30 MB, 30 connections | Reuse the shared client (`core/utils/redis.util`). TTL on every key. |
| Redis is optional at boot | `main.ts` continues without it. Any path *requiring* Redis must degrade explicitly. |
| R2 10 GB | Media goes to R2, never the container filesystem beyond temp. |

Known naming defects, safe to correct on sight: `UserAccoutGuard` / `AdminAccoutGuard` /
`GuestAccoutGuard` are misspelled (128 files); `core/passport/` holds plain Nest guards, not
Passport strategies; the `userBiometrics` table holds profile image URLs.

---

## Working rules

1. **Search before creating.** `grep`/`glob` first; say what you are reusing.
2. **Extend, don't fork.** Two parallel auth systems already exist — don't make it three.
3. **Preserve API contracts.** Additive changes only unless versioning.
4. **Never build a `LIKE` pattern by hand.** Use `containsPattern` from
   `core/utils/likePattern.util.ts` — a keyword of `%` used to return the whole table.
5. **Never call `axios` directly** in a platform path. Use `resilientGet`/`resilientPost`, and
   guard on credentials before calling out.
6. **No `TODO`, no `console.log`, no hardcoded secrets.** Route logging through Winston
   (`core/utils/winston.util`), which redacts. Pass an Error or a plain object as meta — both
   work; a bare string is dropped.
7. **Every new env var goes in `src/configs.ts`** with `.required()` and no default for secrets.
   Add it to `test/jest-setup-env.ts` too, or every suite fails at import.
8. **A 500 must never echo an internal message.** The exception filter returns a fixed title
   plus a `reference` UUID; the real cause goes to the log under that reference.
9. **Validate input.** No global `ValidationPipe` and `class-validator` is not installed, so
   hand-rolled Joi is the norm. Add it per slice.

## Verify your work

```bash
./scripts/ci.sh        # the whole gate — run this before pushing
./scripts/ci.sh --fast # skip the build step
```

Typecheck, lint, tests, secret scan, build — same order as
[`cloudbuild.yaml`](cloudbuild.yaml). **The live Cloud Run trigger is a GCP-managed Developer
Connect trigger that does not run `cloudbuild.yaml`**, so these gates only run where you run
them. Lint has a **warning budget, not a zero target** (276, mostly `no-unused-vars`);
`scripts/ci.sh` fails if the count rises. Lower it as you clean up, never raise it.

Coverage is concentrated on auth, search and startup configuration — the areas that produced
critical findings. Everything else is uncovered; if you touch it, you are the first.

**All green on `main`. Keep it that way.**
>>>>>>> other/staging
