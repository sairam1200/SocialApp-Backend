---
name: gaddr-testing
description: Write and run tests in the Gaddr repos. Use when adding tests, when a test suite fails to start, or when asked about coverage, the CI gate, or how to verify a change. Covers the env bootstrap that makes importing real modules possible.
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

Frontend has **no test runner yet**. Recommended: Vitest + Testing Library, with
Playwright for login, search and profile journeys. `yarn type-check` and
`yarn lint` already work and are gated by `frontend/scripts/ci.sh`.

## What is covered

87 tests, 5 suites. Concentrated on the auth and search core, because that is where
the audit found critical defects:

| Suite | Pins |
|---|---|
| `account.guard.spec.ts` | Token expiry (finding C1). Ordinary guards reject expired tokens; `RefreshTokenGuard` still accepts them. |
| `permissions.guard.spec.ts` | Exact-match permissions (C3). Empty-string and coarse-substring grants must be rejected. |
| `crypto.util.spec.ts` | `timingSafeEqual` length crash (C4), round-trips including Swedish/Arabic/CJK. |
| `limitAllocator.util.spec.ts` | Result-limit conservation, exhaustive over all 15 skip combinations. |
| `fuse.util.spec.ts` | Query normalisation — the search cache key. |

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

## Two habits worth keeping

**Prove your test can fail.** Break the code, confirm the test goes red, restore it.
A test that passes against broken code is worse than no test — it certifies a bug.
Done for the expiry fix: with the check disabled, 6 tests fail.

**Assert known-broken behaviour deliberately.** Where a defect is open because the
fix needs a migration (C4's static IV, C5's fail-open revocation), the current
behaviour is asserted with a `DOCUMENTS finding <id>` comment saying which
expectation to invert when it is fixed. Failing tests there are the intended
signal, not a regression.

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
