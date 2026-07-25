---
name: gaddr-testing
description: Write and run tests in the Gaddr backend, and verify a change actually works end to end. Use when adding or fixing a test, when a suite fails to start with a Joi or config error, when asked about coverage or the CI gate, or when deciding how to prove a change works. Covers the env bootstrap that makes importing real modules possible.
when_to_use: Trigger phrases include "add a test", "write tests", "the tests fail", "suite won't start", "how do I verify this", "does this actually work", "run CI", "ci.sh", "jest", "coverage", "no tests exist for this", and any change that crosses HTTP to handler to repository to database or calls a third-party API.
---

# Gaddr testing

## The thing that blocks everyone once

`src/configs.ts` validates `process.env` with Joi **at import time** and throws on
the first missing `.required()` variable. Almost every module transitively imports
`configs`, so a suite without a populated environment dies during module
resolution — before a single assertion runs. That is why this repository had zero
tests across 818 files.

`test/jest-setup-env.ts` fixes it, wired via `setupFiles` in the `jest` block of
`package.json`. It supplies deterministic placeholder values for every required
variable, using `??=` so a real environment always wins.

**When you add a `.required()` variable to `configs.ts`, add it to
`test/jest-setup-env.ts` too**, or every suite starts failing at import with a Joi
error that looks unrelated to your change.

Also configured: `modulePaths: ["<rootDir>"]`, so `baseUrl`-style imports like
`core/utils/const` resolve in tests as they do in the build.

## Running

```bash
npx jest                                   # all suites
npx jest src/core/passport                 # one directory
npx jest -t "rejects an expired token"     # one test by name
npx jest --coverage
./scripts/ci.sh                            # the full gate: types, lint, tests, secrets, build
./scripts/ci.sh --fast                     # skip the build
```

The frontend is a separate repository with its own runners — **Vitest 4** for units
and **Playwright** for browser tests, both gated by `frontend/scripts/ci.sh`. It has
its own `gaddr-frontend-testing` skill; use that when working there, not this one.

## What is covered

**Backend: 119 tests, 7 suites**, all passing. Concentrated on auth and search,
because that is where the audit found critical defects:

| Suite | Pins |
|---|---|
| `account.guard.spec.ts` | Token expiry (finding C1). Ordinary guards reject expired tokens; `RefreshTokenGuard` still accepts them. |
| `permissions.guard.spec.ts` | Exact-match permissions (C3). Empty-string and coarse-substring grants must be rejected. |
| `crypto.util.spec.ts` | 30 tests. GCM round-trips (Swedish/Arabic/CJK, multi-block), non-determinism, tamper detection on ciphertext and auth tag, HKDF derivation, the `timingSafeEqual` regression, and the dual-read path keeping legacy CBC readable. |
| `searchRateLimit.guard.spec.ts` | Atomic counting — 25 concurrent requests admit exactly the limit. Bounded fallback when Redis is down. |
| `database-search.handler.spec.ts` | The aggregated projection. Mostly `buildSourceUrl`, because a wrong URL still renders a card and just 404s. |
| `limitAllocator.util.spec.ts` | Result-limit conservation, exhaustive over all 15 skip combinations. |
| `fuse.util.spec.ts` | Query normalisation — the search cache key. |

**Frontend: 52 Vitest tests** (3 files — locale registry, content normaliser,
colour-scheme provider) **and 12 Playwright tests** (6 cases in
`e2e/search-aggregated.spec.ts`, run against desktop Chrome and a Pixel 7).

There is still **no end-to-end coverage in this repository** — no suite here starts a
real server. That gap is why the section below exists: for the backend, "end to end"
is currently something you do by hand.

## Conventions

- **Co-locate**: `foo.ts` → `foo.spec.ts` beside it. `testRegex` is `.*\.spec\.ts$`.
- **Name the behaviour, not the method.** `'rejects an expired token'`, not
  `'canActivate works'`. The name is what a future reader sees when it fails.
- **Import real modules.** The env bootstrap exists so you do not have to mock the
  world. Mock only I/O boundaries — Redis, the database, HTTP.
- **Never hit the network.** If a test reaches a real API it is a bug; the
  placeholder credentials are invalid on purpose.
- **Reference the finding.** Security tests cite their audit ID in a comment so the
  reason survives a refactor.

## Unit tests are not enough — run the thing

Every unit test in this repo passed while four defects made the core product not work.
All four were found by starting a real server against a real Postgres and a real API,
and none was visible from reading code or from green unit tests:

1. Aggregated results were persisted and never read back — the read path had zero
   references to `contentStreams`.
2. The migration chain could not build a database from empty (two separate holes).
3. `data.source.ts` discarded five connection variables and hardcoded TLS, so
   `POSTGRES_*` and `POSTGRES_SSL_REJECTUNAUTHORIZED` did nothing.
4. `fuse.js` was imported in a way that compiled to `undefined` at runtime.

The common shape: **each was a gap *between* correctly-written units.** Unit tests
verify the pieces; only execution verifies the wiring.

The frontend reached the same conclusion independently and acted on it: its
`e2e/search-aggregated.spec.ts` exists because unit tests on **both** sides were green
while aggregated results were saved, returned by this API, and never rendered. That
suite is currently the only automated proof that a result this service persists
reaches a user. If you change the search read path — `database-search.handler.ts`, the
`AggregatedSearchResult` projection, or the shape of `GET /search/results` — say so in
your summary, because the assertion that catches the regression lives in the other
repository.

So for anything that crosses a boundary — HTTP → handler → repository → database, or
our code → a third-party API — do this before claiming it works:

```bash
createdb gaddr_e2e                       # scratch database
# .env.development (gitignored). Two traps:
#   POSTGRES_ENTITIES must be RECURSIVE: /../../domain/entities/**/*.entity.js
#   POSTGRES_PASSWORD must be non-empty — Joi rejects ''
npm run build && node dist/main.js
# then: real request -> query the table -> call the read endpoint
```

Full worked example, including the exact curl and psql commands:
`docs/integrations/END_TO_END_VERIFICATION.md`.

Two things that will bite you: the anonymous rate limit on `POST /search` is **5/min**,
so a readiness-probe loop trips it (that is the limiter working); and
`GET /search/suggestions` requires a keyword of **at least 3 characters**.

**Check the compiled output, not just the transform.** ts-jest and `tsc` can disagree
with `nest build` on module interop. The `fuse.js` bug reproduced only in `dist/`:

```bash
node -e "console.log(require('./dist/core/utils/fuse.util.js').normalizeSearchTerm('x',['xy']))"
```

## Two habits worth keeping

**Prove your test can fail.** Break the code, confirm the test goes red, restore it.
A test that passes against broken code is worse than no test — it certifies a bug.
Done for the expiry fix: with the check disabled, 6 tests fail.

**Assert known-broken behaviour deliberately.** Where a defect must stay open for a
while, the *current* behaviour is asserted with a `DOCUMENTS finding <id>` comment
naming the expectation to invert once it is fixed. Failing tests there are the intended
signal, not a regression.

This has now paid off twice. C4 and C5 were both documented this way and are both
closed; when the fixes landed, the assertions to flip were already written down.
`crypto.util.spec.ts` went from asserting "identical plaintext yields identical
ciphertext" to asserting the opposite, and grew a dual-read case so the legacy CBC path
cannot be deleted silently.

**Check what a `DOCUMENTS` comment still refers to before trusting it.** A closed
finding whose assertion was never inverted is a test certifying a bug that no longer
exists.

## What to test next

Highest value first, given zero coverage before this:

1. `httpContext.middleware.ts` — dual auth paths (JWT and Better Auth), and that
   Better Auth sessions get the right `UserType` (currently hardcoded to `User`).
2. `refresh-token.handler.ts` — the flow whose dependence on expired tokens shaped
   the C1 fix.
3. `rate-limit.middleware.ts` — the non-atomic read-then-write is provably
   bypassable under concurrency; a test would demonstrate it.
4. `search.service.ts` staleness and lock logic — `shouldFetchFromAPI` decides when
   to spend paid API quota.
5. Repository query correctness against a real Postgres via Testcontainers.
