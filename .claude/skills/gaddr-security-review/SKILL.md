---
name: gaddr-security-review
description: Security review for the Gaddr backend and frontend. Use when touching authentication, authorization, guards, tokens, sessions, cookies, CORS, rate limiting, webhooks, or when asked to review changes for security. Encodes the known open findings so they are not re-discovered or accidentally reintroduced.
when_to_use: Trigger phrases include "is this secure", "security review", "add a guard", "@UseGuards", "permissions", "can this user access", "IDOR", "expired token", "refresh token", "session revocation", "log out everywhere", "securityStamp", "CORS", "rate limit", "webhook signature", "XSS", "CSP", "secret in env", and any edit under src/core/passport/ or to cors.config.ts, configs.ts or an auth handler.
---

# Gaddr security review

Read `docs/audit/2026-07_Security_And_Correctness_Audit.md` before anything else.
It records verified findings, remediation status, and — importantly — a
**"Checked and cleared"** section of plausible bugs that turned out not to be
real. Skipping it wastes effort re-investigating settled ground.

## Non-negotiables for this codebase

### Token expiry is enforced in the guard, not the middleware

`HttpContextMiddleware` verifies every JWT with `ignoreExpiration: true` **on
purpose** — the refresh handler resolves identity from
`HttpContext.getCurrentUserId`, i.e. from the lapsed access token. Setting it to
`false` breaks refresh for every user.

Expiry lives in `account.guard.ts`, gated on the `ignoreExpiration` flag.
`RefreshTokenGuard` is the only guard that may accept an expired token.

**If you add a guard**, build it with `createAccountGuard` rather than reading
`HttpContext.user` directly, or it will silently accept expired tokens.
`src/core/passport/account.guard.spec.ts` pins this — with the check removed, 6
tests fail.

### Permissions are exact-match only

`PermissionsGuard` once used `requiredPermission.includes(granted)`. An
empty-string grant authorised every endpoint. Never reintroduce substring or
prefix comparison. `permissions.guard.spec.ts` pins it.

Permissions are issued as `Controller.method` by
`Permissions.discoverControllerPermissions()`. Both sides derive from runtime
class and method names, so **minification breaks permissions** — prefer explicit
metadata (`@RequirePermission('user.delete')` read via `Reflector`) for anything new.

### Secrets get no defaults

Every new env var goes in `src/configs.ts`. Anything secret is `.required()` with
no `.default()`. A guessable default is a vulnerability, not a convenience — see
findings M2 (`SYSTEM_ADMIN_PASSWORD` defaulting to a published string) and M6
(`default_verify_token`).

### Fail closed, with a fallback — C5 is CLOSED

`account.guard.ts` used to skip the `securityStamp` revocation check entirely on a
Redis cache miss, so password changes did not reliably end sessions. It now reads the
authoritative stamps from the database on a miss, repopulates the cache, and compares.
If neither Redis nor the database can confirm the session, it **rejects**.

The ordering mattered: failing closed *without* the database fallback would have logged
out every user with a cold cache. The DB read had to come first. Keep that shape —
a cache miss must never be more permissive than a cache hit, and it must never be an
outage either.

Note the guards now take a second constructor argument (`IIdentityRepository`), and
`authGuard.module` provides it plus `TypeOrmModule.forFeature`. A new guard needs the
same wiring.

## Review checklist

Work through these against the diff:

1. **AuthN** — does every new endpoint have a guard? 201 endpoints exist; a
   missing `@UseGuards` is silent. Search endpoints are intentionally public but are
   now rate-limited.
2. **AuthZ / IDOR** — does the handler verify the caller owns the resource, or
   only that they are logged in? Check every `userId` that arrives from the
   request body rather than from `HttpContext.getCurrentUserId`.
3. **Input** — there is **no global `ValidationPipe`** and `class-validator` is not
   installed. Validation is hand-rolled Joi per handler. Unvalidated input reaches
   387 raw SQL call sites. Those are parameterised (no injection found), but
   type confusion and oversized payloads are unguarded.
4. **Rate limiting** — `searchRateLimit.guard.ts` covers search with atomic Redis
   `INCR`. The older `RateLimitMiddleware` still covers only 4 auth routes via a
   non-atomic DB read-then-write; anything new that fans out to a metered third-party
   API should use the guard, not the middleware.
5. **Secrets in logs** — route through `core/utils/winston.util` (which redacts),
   never `console.log`. Never log tokens, even their length.
6. **CORS** — `cors.config.ts` is environment-split. Never add a tunnel
   (`*.ngrok*`) or preview domain to `PRODUCTION_ORIGINS`; free tunnel subdomains
   are reassignable and CORS runs with `credentials: true`.
7. **Webhooks** — verify signatures/tokens and fail closed when unconfigured.
8. **Crypto** — `cryptoUtils.encrypt` now produces authenticated AES-256-GCM, so it
   is safe to call. Never pass `keyParam`/`ivParam` (that forces the legacy CBC path),
   and never remove the legacy branch in `decrypt()` — every stored token is still
   CBC. See the `gaddr-encryption` skill.

## Frontend specifics

- Access tokens live in `localStorage` (finding H3), so any XSS is account
  takeover. The backend already accepts `httpOnly` cookies and `proxy.ts` reads
  them — prefer cookies; do not add `localStorage` token reads.
- `proxy.ts`'s `config.matcher` is the real auth gate. Code inside the middleware
  never runs for unmatched paths, and the matcher disagrees with
  `PROTECTED_ROUTES` (finding H4). `/u/` is listed as protected but is the
  **public** profile page — "fixing" that alignment would put every public profile
  behind a login.
- No CSP anywhere. That is what makes the `localStorage` exposure exploitable.

## Verify

```bash
./scripts/ci.sh
```

Runs typecheck, lint, 119 tests, and a gitleaks scan configured in
`.gitleaks.toml`. Add a regression test for any security fix — the audit's
findings are a ready-made specification.
