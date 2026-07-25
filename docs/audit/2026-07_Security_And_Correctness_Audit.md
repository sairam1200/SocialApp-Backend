# Gaddr Search & Me — Security & Correctness Audit

**Date:** 2026-07-25
**Scope:** `TeamGaddr/Gaddr-Search-Me-Backend` @ `821a4be`, `TeamGaddr/Gaddr-Search-Me-Frontend` @ `50f7965` (both `main`)
**Method:** Static review of all source, dependency reachability analysis, build + typecheck verification, decompression and content analysis of committed artifacts.

Every finding below was verified against source before being recorded. Where a plausible-sounding issue turned out **not** to be real, it is listed in [Section 7 — Checked and Cleared](#7-checked-and-cleared) so the same ground is not re-covered.

---

## 1. Executive summary

| | Backend | Frontend |
|---|---|---|
| Files (tracked) | 914 (818 `.ts`) | 562 (183 `.tsx`, 138 `.ts`) |
| Production build | ✅ passes | ✅ passes |
| Typecheck | ✅ 0 errors | ❌ 130 errors (own `type-check` script) |
| Unit/integration tests | **0** | **0** (no test runner installed) |
| `console.log` in shipped source | 136 | 109 |
| Endpoints | 201 | 30 routes |

**Headline:** the platform is architecturally coherent — clean-architecture vertical slices, CQRS (431 references), `AsyncLocalStorage`-backed request context, and both projects build green. The problems are concentrated in the **authentication and cryptography layer**, plus one **data-exposure incident** already committed to git history.

Five findings require action before this can be called production-ready:

| # | Severity | Finding |
|---|---|---|
| [C1](#c1-access-tokens-never-expire) | **Critical** | Access tokens never expire — `ignoreExpiration: true` on the global auth path (~147 of 201 endpoints) |
| [C2](#c2-production-database-dump-committed-to-git) | **Critical** | Production DB dump in git: 14 password hashes + TOTP 2FA secrets + 30 emails |
| [C3](#c3-permission-check-uses-substring-matching) | **Critical** | Permission check uses substring matching — grants sweeping access |
| [C4](#c4-oauth-tokens-encrypted-with-a-fixed-iv-and-no-authentication) | **High** | OAuth tokens encrypted with a fixed IV, unauthenticated CBC |
| [C5](#c5-session-revocation-fails-open) | **High** | Session revocation fails open when Redis misses |

---

## 2. Critical findings

### C1. Access tokens never expire

**Files:** `src/core/middlewares/httpContext.middleware.ts:77-82`, `src/core/utils/jwt.util.ts:6-28`

The global request middleware verifies every JWT with expiry checking **disabled**:

```ts
// httpContext.middleware.ts:77
const user = await getUserFromAccessTokenAsync(
  access_token,
  res,
  this.jwtService,
  true,            // ← ignoreExpiration
);
```

which flows straight into:

```ts
// jwt.util.ts:13
return await jwtService.verifyAsync(access_token, {
  secret: configs.jwt.secret,
  issuer: configs.jwt.issuer,
  audience: configs.jwt.audience,
  ignoreExpiration,   // ← true on the global path
});
```

`account.guard.ts` accepts an `ignoreExpiration` parameter (line 20) but **never reads it** in the guard body — so the guard does not compensate. There is no manual `exp` comparison anywhere in the codebase (verified: the only `exp`-related references in `src/` are the `TokenExpiredError` import and its `instanceof` check, which cannot fire when `ignoreExpiration` is true).

**Blast radius.** Guards that read `HttpContext.user` — and therefore inherit the unexpired identity — are used by:

- `UserAccoutGuard` — 125 files
- `AuthenticatedAccountGuard` — 22 files
- `AdminAccoutGuard`, `GuestAccoutGuard`, `TwoFAVerificationGuard`, `RefreshTokenGuard` — 5 more

Only `PermissionsGuard` (14 files) calls the verifier with the default `ignoreExpiration = false` and thus actually enforces expiry.

**Impact.** A leaked, logged, or exfiltrated access token grants access indefinitely. This compounds with:
- `JWT_ACCESS_EXPIRATION_MINUTES` defaulting to `'7d'` (see [M1](#m1-jwt-expiry-variable-is-misnamed))
- tokens stored in `localStorage` on the frontend, readable by any XSS ([H3](#h3-access-tokens-in-localstorage))
- revocation failing open ([C5](#c5-session-revocation-fails-open))

Together these mean there is currently **no reliable way to end a session**.

**Fix.** Set `ignoreExpiration: false` on the global path. Refresh flows need expired-token tolerance, so scope that narrowly: let `RefreshTokenGuard` re-verify the raw token with `ignoreExpiration: true` itself, rather than weakening every request.

---

### C2. Production database dump committed to git

**File:** `neondb_backup_20260717_223225.dump` (232 KB on disk, 595 KB decompressed), added in commit `e4b5f3b` "update/mergeDB"

This is a PostgreSQL custom-format dump containing **41 populated tables**, not a schema skeleton. Verified row counts and column structure (values deliberately not reproduced here):

| Table | Rows | Sensitive columns present |
|---|---|---|
| `identity.users` | 14 | `passwordHash`, **`twoFactorSecret`**, `email`, `phoneNumber`, `googleId`, `securityStamp` |
| `identity."userLogins"` | 161 | external login linkage |
| `public."dataProtectionKeys"` | 34 | `key`, `value` |
| `identity."userBiometrics"` | 12 | profile image URLs (see note) |
| `public."linkedAccounts"` | 10 | `platform`, `externalId`, `email`, `metaData` |
| `public."searchHistories"` | — | user search history |
| `notification.newsletter_subscribers` | — | subscriber emails |

Confirmed by content scan: **14 bcrypt hashes** (`$2a/$2b/$2y$` prefixes) and **30 unique email addresses**.

**The `twoFactorSecret` column is the sharp edge.** It holds TOTP seeds. Anyone with this dump can generate valid second-factor codes for those accounts, so 2FA provides no additional protection for them — the password hash and the 2FA bypass are in the same file.

`public."dataProtectionKeys"` is a `key`/`value` store with 34 rows; treat its contents as compromised until inspected.

**Two mitigating facts, stated precisely:** the repository is **private**, so this is not a public breach. And the table named `userBiometrics` does *not* contain biometric data despite its name — its columns are `profileImageUrl`, `defaultProfileImageUrl`, `privacy`. This is not GDPR Art. 9 special-category data; the table name is simply misleading and should be renamed.

**What it *is*:** every person with repository access — employees, contractors, anyone who ever cloned it, and anyone who obtains the deploy key — holds all users' password hashes and 2FA seeds. Deleting the file is not sufficient; it remains in history at `e4b5f3b` forever.

**Fix, in order:**
1. Rotate now: force password reset for all 14 accounts, re-enrol 2FA, rotate `dataProtectionKeys` contents and `ENCRYPTION_KEY`.
2. Purge from history (`git filter-repo --invert-paths --path neondb_backup_20260717_223225.dump`), force-push, and have every clone re-clone. Coordinate — this rewrites history on `main`.
3. Add `*.dump`, `*.sql`, `*.sql.gz`, `*.tar.gz` to `.gitignore` and add a pre-commit / server-side hook blocking files over ~1 MB and known dump extensions.
4. Under GDPR this is an unauthorised-disclosure risk to personal data. Whether it is a notifiable breach under Art. 33 depends on who accessed it — this needs a documented assessment by whoever owns data protection, not a developer judgement call. Record the decision either way.

---

### C3. Permission check uses substring matching

**File:** `src/core/passport/permissions.guard.ts:50-53`

```ts
const requiredPermission = `${controller.name}.${handler.name}`;

const hasPermission = claimsPrinciple.permission?.some(
  (permission: string) => requiredPermission.includes(permission),
);
```

The test is inverted in effect: it asks whether the **required** permission string contains the **granted** one as a substring. Consequences:

- A granted permission of `""` (empty string) makes `"anything".includes("")` return `true` — **every endpoint authorised**.
- A granted permission of `"User"` satisfies every controller/handler pair whose combined name contains `User` — e.g. `UserEndpoint.deleteUser`, `UserEndpoint.banUser`, `AdminEndpoint.impersonateUser`.
- Any short or generic grant escalates far beyond intent.

**Second defect, same file.** `requiredPermission` is derived from `controller.name` and `handler.name` — runtime JavaScript identifiers. Under any minification or property-mangling in the production build these change, and every permission check silently starts failing (or, given the substring semantics, passing unpredictably). Permissions must key off explicit metadata (e.g. a `@RequirePermission('user.delete')` decorator read via `Reflector`), never class/function names.

**Third, minor:** this guard reads the token via `extractTokenFromHeader` only, ignoring the `access_token` cookie that `httpContext.middleware.ts` accepts. Cookie-authenticated clients cannot use permission-guarded endpoints.

**Fix.** Exact match against a declared permission set, with explicit wildcard support if hierarchy is wanted:

```ts
const granted = new Set(claimsPrinciple.permission ?? []);
const hasPermission =
  granted.has(requiredPermission) ||
  granted.has('*') ||
  granted.has(`${requiredPermission.split('.')[0]}.*`);
```

and reject empty strings when permissions are issued.

---

## 3. High-severity findings

### C4. OAuth tokens encrypted with a fixed IV and no authentication

**File:** `src/core/utils/crypto.util.ts`

```ts
const rawIV = Buffer.from(configs.encryption.iv, 'utf-8');
const iv = rawIV.subarray(0, 16);          // one process-wide IV, from env

function encrypt(text, keyParam = key, ivParam = iv) {
  const cipher = crypto.createCipheriv(algorithm, keyParam, ivParam);  // aes-256-cbc
  ...
}
```

Four distinct problems:

1. **Static IV.** Every ciphertext uses the same IV, making encryption deterministic: identical plaintext always yields identical ciphertext. An attacker with database read access learns which rows share a value without decrypting anything. With CBC this also exposes shared-prefix structure between related plaintexts.
2. **No authentication.** `aes-256-cbc` provides confidentiality only. Callers use the bare `encrypt`/`decrypt` pair, so ciphertexts are malleable — an attacker with write access can flip bits and influence the decrypted plaintext, and decryption failures form a padding oracle.
3. **The authenticated variants exist but are never called.** `encryptWithHMAC` and `verifyWithHMAC` (lines 37-56) have **zero call sites**. The correct primitive was written and then not wired up.
4. **Key and MAC key are the same.** Lines 41 and 50 use the AES key as the HMAC key — no domain separation.

**What is protected by this:** social-platform OAuth access and refresh tokens. Verified call sites:
- `features/integrations/youtube/connect/youtube-connect.handler.ts:257,258,270,271`
- `infrastructure/repositories/identity.repository.ts:827,922`
- `infrastructure/services/publishing/oauth.service.ts:63,80,93`
- `infrastructure/services/youtube/youtube-publishing.service.ts:38,44,57`

**Fifth issue, key derivation.** `Buffer.from(configs.encryption.key, 'utf-8').subarray(0, 32)` treats the env var as raw UTF-8 bytes. A human-typed passphrase has far less than 256 bits of entropy, and a value under 32 bytes yields a short buffer that makes `createCipheriv` throw at runtime rather than at boot.

**Fix.** Move to `aes-256-gcm` with a fresh random 12-byte IV per message, storing `iv || ciphertext || authTag`. Require `ENCRYPTION_KEY` to be 32 bytes supplied as base64/hex and decode it (or derive via HKDF), validating length at startup. Provide a migration path that reads legacy CBC values, re-encrypts under GCM on access, and records progress — the fields are OAuth tokens, so a lazy re-encrypt on next refresh is viable.

**Also fix `verifyWithHMAC` (line 52).** `crypto.timingSafeEqual` throws `RangeError` on length mismatch, so an attacker-supplied HMAC of the wrong length raises an uncaught exception instead of returning `false`. Compare lengths first, then call it.

---

### C5. Session revocation fails open

**File:** `src/core/passport/account.guard.ts:64-78`

```ts
const userAccount = await redis.getFromRedisAsync<{...}>(accountKey);

if (userAccount) {                              // ← only checks when cached
  if (concurrencyStamp !== userAccount.concurrencyStamp) { ... }
  if (securityStamp !== userAccount.securityStamp) {
    throw new UnauthorizedException('Your session has been invalidated...');
  }
}
```

`securityStamp` is the revocation mechanism — rotating it on password change is what should invalidate existing sessions. But the comparison only runs **if the Redis entry is present**. On a cache miss, key expiry, or Redis outage, the entire check is skipped and the request proceeds.

This is reachable by design: `main.ts:44-51` deliberately continues startup when Redis is unavailable ("Continuing without Redis"), which is good availability engineering but means the guard's happy path is the *insecure* one during degradation.

**Impact.** Password changes and forced logouts do not reliably revoke sessions. With [C1](#c1-access-tokens-never-expire) removing expiry as a backstop, a stolen token can outlive every remediation the user attempts.

**Fix.** Fall back to a database read on cache miss and populate the cache from it. Fail closed if neither source can be reached.

---

### H1. Rate limiting covers 4 routes and is bypassable

**Files:** `src/core/middlewares/rate-limit.middleware.ts`, `src/modules/app.module.ts:72`

Registered globally (`forRoutes('*')`) but immediately narrowed:

```ts
private readonly protectedRoutes = [
  '/api/v1/auth/login', '/api/v1/auth/register',
  '/api/v1/auth/forgot-password', '/api/v1/auth/verify-otp',
];

if (!this.protectedRoutes.some((route) => req.path.startsWith(route))) {
  return next();     // everything else: unlimited
}
```

Three problems:

1. **Search and integrations are unlimited.** This product's core endpoints fan out to paid third-party APIs (YouTube, Pinterest, TikTok, Spotify…) each with its own quota. An unauthenticated caller can exhaust those quotas and the associated spend. For a search engine, this is the endpoint that most needs a limiter.
2. **Non-atomic counting.** The middleware reads a row, compares, then writes (`getAsync` → `updateAsync`) with no transaction or atomic increment. Concurrent requests read the same count and each write `count + 1`, so the effective ceiling is far above 120/min under exactly the burst conditions a limiter exists to stop. Redis `INCR` + `EXPIRE` is atomic and already available — the current design instead adds two DB round-trips to every login.
3. **`trust proxy` is never set** (verified absent). Behind Cloud Run and Vercel, `req.ip` is not the client address, so the `(ip, route)` bucket is wrong: either every user shares one bucket — making 120 total logins/minute a platform-wide denial of service — or the limit keys on a spoofable header. Set `app.set('trust proxy', 1)` and confirm what the actual edge sends.

### H2. Better Auth cookie signature is discarded, never verified

**Files:** `src/core/utils/betterAuthSession.util.ts`, `src/core/middlewares/httpContext.middleware.ts:87-144`

```ts
const dotIndex = value.indexOf('.');
if (dotIndex > 0) {
  return value.substring(0, dotIndex);   // signature after '.' is thrown away
}
```

Better Auth issues session cookies as `<token>.<hmac>`. This code splits off the HMAC and discards it. `betterAuthConfig.secret` is loaded from a **`.required()`** env var (`configs.ts:279`) and referenced once, in the config object itself — it is never used to verify anything.

The token is then looked up directly: `WHERE s.token = $1 AND s."expiresAt" > NOW()`. Because the token is a high-entropy DB-stored secret, this is **not directly forgeable** — the database lookup is doing the real work. The consequences are narrower but real:

- Cookie integrity is unverified; tampering degrades to a failed lookup instead of cryptographic rejection.
- **Session tokens are stored in plaintext.** Any read-only database compromise, SQL injection, or leaked backup yields immediately usable sessions. Given [C2](#c2-production-database-dump-committed-to-git) put a dump of this database into git, that path is not hypothetical. Store `sha256(token)` and compare hashes.
- `BETTER_AUTH_SECRET` is a required boot variable that does nothing — misleading to operators.

**Architectural note.** The `better-auth` package has **zero imports** anywhere in `src/` (verified by import-statement analysis). Its session verification has been reimplemented by hand in raw SQL. There are now two parallel authentication systems — custom JWT and this — with divergent claim derivation. Notably `httpContext.middleware.ts:133` hardcodes `[Globals.ClaimTypes.UserType]: UserType.User` for every Better Auth session, so an admin authenticating through that path is silently downgraded and can never satisfy `AdminAccoutGuard`. Pick one system.

### H3. Access tokens in `localStorage`

**Files:** `src/app/(auth)/login/LoginFormClient.tsx:139,170`, `src/app/(auth)/signup/SignupFormClient.tsx:114`, `src/app/(auth)/onboarding/page.tsx:293`, and all five `oauth-callback/*Callback.tsx` components

`localStorage.setItem("accessToken", ...)` makes the token readable by any script on the origin — so any XSS becomes full account takeover, permanently, given [C1](#c1-access-tokens-never-expire).

The backend already accepts `httpOnly` cookies (`httpContext.middleware.ts:71` reads `req.cookies?.access_token`) and `proxy.ts` already reads that cookie at the edge. The secure path exists and is half-wired — the frontend just also keeps a copy in `localStorage`. Standardise on `httpOnly; Secure; SameSite=Lax` cookies and delete the `localStorage` copies.

### H4. Middleware matcher does not cover the routes it claims to protect

**Files:** `src/proxy.ts:331-340`, `src/constants/routes.ts`

Three sources of truth disagree:

| Declared protected (`PROTECTED_ROUTES`) | In `matcher` (what actually runs) | Route exists? |
|---|---|---|
| `/settings` | ✅ | ✅ |
| `/profile` | ✅ | ❌ (route is `/u/[username]`) |
| `/messages` | ❌ | ❌ |
| `/analytics` | ❌ | ❌ |
| `/u/` | ❌ | ✅ |
| — | — | `/discover`, `/bookmarks` ✅ but in neither list |

Next.js only executes middleware for paths in `matcher`. Everything in `PROTECTED_ROUTES` but absent from `matcher` gets **no edge protection at all** — the `isProtectedPage` branch is dead code for those paths.

Current real-world impact is limited because `/messages` and `/analytics` do not exist yet, but `/bookmarks` is inherently per-user and is unguarded at the edge. The latent trap is worse: `/u/` is listed as protected while being the **public profile page** — the core shareable artifact of a Linktree-class product. If someone "fixes" the matcher to match `PROTECTED_ROUTES`, every public profile starts demanding a login and the product breaks.

Collapse this to one source of truth and derive the matcher from it.

### H5. Transient backend errors log every user out

**File:** `src/proxy.ts:98-106, 234-241`

```ts
} catch (error) {
  console.error("Auth verification failed:", error);
  return false;          // backend unreachable → treated as invalid session
}
```

`false` leads to `redirectToLogin`, which **deletes the access-token cookie** (line 141). So a single failed `fetch` — a deploy, a cold start, a network blip, a slow backend — destroys the user's session rather than degrading. Distinguish "backend said no" (401/403 → log out) from "could not reach backend" (network/5xx → allow through and let the page-level check decide, or retry once).

Related, same file: `verifySession` performs a blocking, uncached `fetch` to the backend on **every** protected navigation (line 225, `cache: "no-store"`) — the `Date.now()` instrumentation on lines 223-231 suggests this was already felt. `jose` is already a dependency and unused; verifying the JWT signature at the edge would remove the round trip entirely.

---

## 4. Medium-severity findings

### M1. JWT expiry variable is misnamed
`configs.ts:52` — `JWT_ACCESS_EXPIRATION_MINUTES` defaults to `'7d'`. The name says minutes, the value is seven days, and it is passed verbatim to `JwtModule.signOptions.expiresIn`. Refresh is 30 days. Rename to `JWT_ACCESS_TOKEN_TTL`, set it to minutes (15m is typical), and let the refresh token carry longevity.

### M2. Default credentials for privileged accounts
`configs.ts` — `SYSTEM_ADMIN_PASSWORD` defaults to `'@Admin@123'` and `GUEST_USER_PASSWORD` to `'@Abc@123'`, neither marked `.required()`. These feed `DataSeeder`, which creates the accounts.

Currently inert: the only invocation is commented out (`app.module.ts:76` — `//await this.dataSeeder.initializeAsync();`). So the seeder never runs, which both defuses this finding *and* means **roles are never seeded on a fresh deploy** — RBAC has no data. Whoever uncomments that line to fix role seeding will simultaneously create an admin account with a published password. Make both `.required()` with no default before that happens.

`src/modules/README.md:19` states the seeder "Triggers `DataSeeder.initializeAsync()` on bootstrap" — documentation describing behaviour the code has disabled.

### M3. CORS allows a reassignable ngrok tunnel and a preview domain
`src/core/configs/cors.config.ts` ships with `credentials: true` and this origin list:

```
https://almost-backtrack-drapery.ngrok-free.dev     ← free-tier ngrok subdomain
https://social-app-zeta-three.vercel.app            ← preview deployment
http://localhost:3000 / :5173                        ← dev
```

Free ngrok subdomains are **reassignable** — whoever next claims that name gets credentialed cross-origin access to production. Split the list by `NODE_ENV`: dev origins in dev only, and production restricted to `gaddr.com`, `www.gaddr.com`, `demo.gaddr.com`, `jobs.gaddr.com`. The same tunnel is also hardcoded in `frontend/next.config.ts` under `allowedDevOrigins`.

### M4. No security headers
No `helmet`, and no CSP/HSTS/`X-Frame-Options`/`X-Content-Type-Options` anywhere in `main.ts` (verified absent). `frontend/next.config.ts` sets exactly one header, `Cross-Origin-Opener-Policy`. For a product that renders user-supplied profile content and embeds third-party media, a CSP is the main structural defence against XSS — which is also what makes [H3](#h3-access-tokens-in-localstorage) exploitable.

### M5. No declarative request validation anywhere
`class-validator` and `class-transformer` are **not dependencies** (verified: absent from `package.json`, zero usages), and `app.useGlobalPipes(...)` is never called. Across 201 endpoints there is no schema-level validation of bodies, queries, or params — only whatever hand-rolled checks each handler performs. `Joi` is present but used solely for environment validation in `configs.ts`.

This is the single largest systemic gap after the auth findings: unvalidated input reaching 387 raw SQL call sites. **Those call sites are parameterised** — no injection was found (see [Section 7](#7-checked-and-cleared)) — but type confusion, oversized payloads, and unexpected shapes remain unguarded. Add `class-validator` + a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, then add DTOs per slice, starting with auth and search.

### M6. Webhook verification token has a guessable default
`youtube-webhook.endpoint.ts:37,72` and `webhooks/youtube-webhook.service.ts:16,58`:
```ts
process.env.YOUTUBE_WEBHOOK_VERIFY_TOKEN || 'default_verify_token'
```
If the variable is unset, anyone who guesses `default_verify_token` can drive the webhook. Require the variable; fail closed when absent.

### M7. Database TLS verification disabled by default
`configs.ts` — `POSTGRES_SSL_REJECTUNAUTHORIZED` defaults to `false`. The database is Neon, reached across the public internet, so certificate validation is exactly what prevents an active MITM. Default to `true`.

### M8. Frontend `type-check` fails on a clean clone — CI cannot gate types
`yarn type-check` produces **130 errors**, all `TS2307: Cannot find module '@/components/svg/*.svg'`. Cause: SVG-as-component types come from `@svgr/webpack`, and no ambient declaration is committed (`next-env.d.ts` is gitignored and generated during `next build`).

`yarn build` passes, so this is not a shipping blocker — but the project's own typecheck script cannot be used as a CI gate, which is how 130 real type errors would hide. Commit a declaration file:

```ts
// src/types/svg.d.ts
declare module '*.svg' {
  import type { FC, SVGProps } from 'react';
  const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
```

### M9. Module-scope `localStorage` in client components
`oauth-callback/[platform]/integration/components/`:
- `YouTubeIntegrationCallback.tsx:16` — token read at line 16, component declared at line 16+ → **module scope**
- `InstagramIntegrationCallback.tsx:16` — token read at line 16, component declared at line 18 → **module scope**

```ts
const token = localStorage.getItem("accessToken");   // module scope, outside the component
let onboardingStep: string | undefined;              // module-scope mutable state
```

Two bugs. Module-level code in a `"use client"` component still executes during server rendering, where `localStorage` is undefined. And even client-side it evaluates **once at import**, capturing whatever token existed then — so after a login or token refresh the value is stale or `null`, and the OAuth integration fails silently. Move both inside the component.

**`TwitterIntegrationCallback.tsx:153` is *not* affected.** It matched the same `^const token = localStorage` pattern because that region of the file has flattened indentation, but the line sits *after* the component declaration (line 16) and inside `processCallback` — so it is correctly scoped and was left unchanged.

### M10. Both `yarn.lock` and `package-lock.json` are committed (frontend)
`packageManager` declares `yarn@4.9.2`, but a `package-lock.json` sits beside `yarn.lock`. Installs become non-deterministic depending on which tool runs, and the two files drift silently. Delete `package-lock.json` and add it to `.gitignore`. (The backend has the mirror-image problem: `.gitignore` lists `package-lock.json` while that file is tracked.)

### M11. Build artifacts and test fixtures committed (backend)
`test_video.mp4` (**10 MB** — the largest file in the repo), `tsconfig.tsbuildinfo` (504 KB), `tsconfig.build.tsbuildinfo` (448 KB), `test_sql_output.js`. The `.tsbuildinfo` files are incremental-compilation caches; committing them causes spurious diffs and can confuse builds. Add `*.tsbuildinfo` to `.gitignore` (currently absent) and move the fixture to object storage or Git LFS.

### M12. Production logging hygiene
136 `console.log` in backend `src/`, 109 in frontend `src/`. Notably `proxy.ts:161-170,209,228-231,268-269` logs token presence, token length, and timing on every matched request — straight into Vercel production logs. The backend has Winston configured with redaction (`winston.util.ts:154` lists `csrf` among filtered keys); route logging through it and let lint forbid bare `console.*`.

---

## 5. Dead, orphan and unused code

Per the mandate, each item records what it was for and whether it should be revived rather than deleted.

### 5.1 Backend — unreachable dependencies

Verified by import-statement analysis, not substring matching.

| Package | Imports | Original purpose | Recommendation |
|---|---|---|---|
| `better-auth` | **0** | Session/auth framework | **Decide, don't drift.** Its session logic is reimplemented in raw SQL ([H2](#h2-better-auth-cookie-signature-is-discarded-never-verified)). Either adopt the library properly — it gives verified cookies, hashed tokens, and OAuth account linking for free, replacing hand-rolled code — or remove the package and `BETTER_AUTH_SECRET`. The current half-state is the worst option. |
| `passport`, `passport-jwt` | **0** | Intended auth strategies | Never implemented; `@nestjs/passport` is imported once (`PassportModule` in `app.module.ts`) but registers no strategy. Remove all three and rename `src/core/passport/` → `src/core/guards/`, which is what it actually holds. |
| `prisma` / `@prisma/client` | **0** | Abandoned ORM migration | `prisma.config.ts` at repo root points at `prisma/schema.prisma` (**does not exist**) and imports `prisma/config` (**not installed**). Neither package is even in `package.json`. Delete the config file. Relevant to the mandate's migration goal: if Prisma returns, start from a decision record, not this fragment. |
| `xml2js` | **0** | XML parsing — likely for YouTube PubSubHubbub Atom feeds | **Keep in mind for revival.** YouTube's push notifications are Atom XML. If webhook payload parsing is on the roadmap this is the tool; today it is unreferenced. |
| `pm2` | **0** | Process manager | Deployment is containerised (`Dockerfile`, Cloud Run). A 100 MB+ dependency in the image for nothing. Remove — Cloud Run supervises the process. |

Also: `run-server.js` at repo root — verify against the Dockerfile `CMD` before touching, but it is not referenced from `package.json` scripts.

### 5.2 Backend — orphaned code paths worth reviving

| Item | Location | Assessment |
|---|---|---|
| `encryptWithHMAC` / `verifyWithHMAC` | `crypto.util.ts:37-56` | **Revive — this is the fix for [C4](#c4-oauth-tokens-encrypted-with-a-fixed-iv-and-no-authentication).** Someone wrote the authenticated variant and never wired it in. Supersede with AES-GCM (which authenticates natively) and delete these. |
| `DataSeeder` | `data.seeder.ts`, invoked nowhere | **Revive carefully.** Constructor-injected in `app.module.ts:67` and exported from `role.module.ts:79`, but its only call is commented out at `app.module.ts:76`. Roles are therefore never seeded — likely a live RBAC bug on fresh environments. Fix [M2](#m2-default-credentials-for-privileged-accounts) *first*, make it idempotent, then re-enable. |
| `ignoreExpiration` parameter | `account.guard.ts:20` | Accepted, never read. This is the visible symptom of [C1](#c1-access-tokens-never-expire): the guard was meant to control expiry per-guard and the wiring was never finished. Implement it, then flip the global default to secure. |
| `type && type != undefined` | `account.guard.ts:80` | Redundant — `type &&` already excludes `undefined`. Harmless today, but if any `UserType` member is ever `0` or `''` the type check silently stops enforcing. Compare `!== undefined` explicitly. |
| `templates/` | `src/templates/` | Empty directory, 0 files. Handlebars is a live dependency (1 import) — email templates presumably live elsewhere. Remove or populate. |
| `UserAccoutGuard`, `AdminAccoutGuard`, `GuestAccoutGuard` | `account.guard.ts:98-100` | Misspelled ("Accout") and referenced across 128 files. Worth a mechanical rename while touching this file for [C1](#c1-access-tokens-never-expire). |
| `identity."UserClaims"` vs `identity."userClaims"` | Schema (both in dump) | Two tables differing only by leading case — near-certain migration accident. Investigate and consolidate; case-sensitive quoted identifiers like this are a lasting source of bugs. |

### 5.3 Frontend — unreachable dependencies

| Package | Imports | Assessment |
|---|---|---|
| `secure-ls` | **0** | Encrypted-localStorage wrapper. Never used, and it would be security theatre anyway — the key ships to the browser. The real fix is `httpOnly` cookies ([H3](#h3-access-tokens-in-localstorage)). Remove. |
| `jsonwebtoken` (+ `@types`) | **0** | Node-only JWT **signing** library. Signing tokens client-side is never correct; `jwt-decode` (12 imports) covers legitimate read-only decoding. Remove — its presence invites misuse. |
| `nodemailer` (+ `@types`) | **0** | Node-only SMTP client with no place in a browser bundle. Mail belongs to the backend, which already has it. Remove. |
| `reflect-metadata` | **0** | Decorator metadata polyfill — a NestJS/TypeORM need, not a React one. Remove. |
| `js-cookie` (+ `@types`) | **0** | Superseded by the local `utils/cookie.util`. Remove. |
| `init` | **0** | `init@0.1.2` is a no-op package almost certainly installed by a mistyped command. Remove. (An earlier substring search suggested 113 "uses" — all false positives from `initialValues`, `useEffect` init, etc. Import analysis shows zero.) |

### 5.4 Frontend — duplicated stacks shipping to users

Four capabilities are each covered by two or three libraries. Every duplicate is bundle weight and a second convention for the next developer to learn.

| Capability | Libraries present (import counts) | Recommendation |
|---|---|---|
| Forms | `formik` (14) + `react-hook-form` (2) + `@hookform/resolvers` | Standardise on `react-hook-form` — smaller, uncontrolled by default, and the current TanStack-aligned choice. Migrate the 14 Formik usages. |
| Validation | `yup` (5) + `zod` (4) | Standardise on `zod` — TypeScript-native inference, shareable with the backend for end-to-end contract types. |
| Image cropping | `react-image-crop` (2) + `react-easy-crop` (3) | Pick one. `react-easy-crop` has the better touch story for the mandate's mobile focus. |
| UI primitives | `@radix-ui/react-*` (4 packages) + `radix-ui` umbrella (1) + `@headlessui/react` (7) | Standardise on Radix (already the `components.json`/shadcn foundation). The `radix-ui` umbrella duplicates the scoped packages — drop it. Migrate the 7 Headless UI usages. |

Consolidating these is the cheapest available win for the mandate's performance and SEO goals.

---

## 6. Gaps against the stated product mandate

Measured, not inferred — these are the distances between the current repos and the brief.

| Requirement | Current state | Gap |
|---|---|---|
| Swedish + English, all Nordic/European, Russian, Arabic, French, Asian | **Zero** i18n libraries (`next-intl`, `react-i18next`, `formatjs` all absent); all copy hardcoded in English | Greenfield. Needs `next-intl` with `[locale]` routing, message extraction, RTL for Arabic, and locale-aware formatting. Retrofitting 183 components is the single largest frontend workstream. |
| Light/dark mode | **11** `dark:` utilities across 183 `.tsx` files | Effectively absent. Needs a token layer (CSS variables) before per-component work, or it will be redone twice. |
| "Perfekt sökordsoptimering" | **5 of 30** routes export `metadata`; **no** `sitemap.ts`, **no** `robots.ts`; **every route is `ƒ` dynamic** — nothing static or ISR | Significant. For a search/profile product, public profiles (`/u/[username]`) must be statically generated or ISR with per-profile metadata, JSON-LD, and OG images. Serving them on-demand costs both ranking and TTFB. This is the highest-leverage SEO fix available. |
| Tests + evals | **0** tests in both repos; frontend has **no test runner** at all | Greenfield. Suggested order: Vitest + Testing Library on the frontend; Jest (already configured) on the backend starting with the auth layer, since that is where [C1](#c1-access-tokens-never-expire), [C3](#c3-permission-check-uses-substring-matching) and [C5](#c5-session-revocation-fails-open) live; Playwright for the critical journeys; then retrieval-quality evals for AI search. |
| CI/CD without GitHub Actions | `.github/` holds only a PR template — no workflows | Clean slate, consistent with the brief. Frontend CI is effectively Vercel's build. Backend needs a pipeline; Cloud Build fits the existing GCP footprint and bills to the same project. |
| TanStack frontend base | `@tanstack/react-query` v5 already in use | Partially aligned. Router/Start migration is a larger move and needs a decision record; the app currently depends on Next-specific features (`proxy.ts`, `next/image`, App Router conventions). |
| Rust where it is best | None | The defensible first candidates are CPU-bound and isolatable: the crawler/aggregation fan-out and media processing. Both can be separate services behind the existing API without touching NestJS. |
| Mobile BankID, Stripe, Gaddr Pay, smart contracts | No payment, KYC, or chain integration present | Greenfield. All of it lands on the auth and crypto layer that currently has [C1](#c1-access-tokens-never-expire)–[C5](#c5-session-revocation-fails-open) open. **Fix those first** — BankID and card payments both assume sessions can be trusted and revoked. |

---

## 7. Checked and cleared

Recorded so this ground is not re-covered, and because several are load-bearing good news.

| Checked | Result |
|---|---|
| **Cross-request identity leakage** via the static `HttpContext.user` accessor | **Not a bug.** `httpContext.middleware.ts:24` backs it with `AsyncLocalStorage`, which is per-request-safe. This pattern is usually a critical defect; here it is implemented correctly. |
| **SQL injection** across 387 raw `.query()` call sites | **None found.** No template interpolation (`${}`) and no string concatenation inside query strings; parameterised placeholders throughout. |
| **Hardcoded live API keys** in source | **None.** Despite the credentials in `Docs/API keys.md`, no `AIzaSy…`, `pina_…`, `sk_live_…`, or `ghp_…` literal appears in either `src/` tree. |
| **Tracked `.env` / key / cert files** | **None** in either repo; both `.gitignore` files cover env files properly. |
| **XSS sinks** in the frontend | No `dangerouslySetInnerHTML` and no `eval` anywhere in `src/`. |
| **Client-side JWT signing** | None — `jsonwebtoken` is present but unreferenced; only `jwt-decode` is used, for reading. |
| Backend typecheck | **0 errors** across 818 files. |
| Both production builds | **Both pass.** |
| Backend `: any` usage | 226 occurrences — worth reducing, but no unsound casts found in the auth path. Frontend has **0**, which is genuinely disciplined. |

---

## 8. Recommended order of work

Sequenced by risk-reduction per unit of effort, and by dependency — several later items are unsafe until earlier ones land.

**Now — contain the disclosure**
1. Rotate credentials for the 14 exposed accounts: force password reset, re-enrol 2FA, rotate `dataProtectionKeys` and `ENCRYPTION_KEY` ([C2](#c2-production-database-dump-committed-to-git)).
2. Purge the dump from git history; add dump/large-file guards ([C2](#c2-production-database-dump-committed-to-git)).
3. Start the documented GDPR assessment ([C2](#c2-production-database-dump-committed-to-git)).

**This week — close the auth holes** (small, surgical, high-value)
4. `ignoreExpiration: false` globally; move expired-token tolerance into `RefreshTokenGuard` ([C1](#c1-access-tokens-never-expire)).
5. Exact-match permissions; move off class/function names ([C3](#c3-permission-check-uses-substring-matching)).
6. Fail closed on securityStamp with a DB fallback ([C5](#c5-session-revocation-fails-open)).
7. Require `YOUTUBE_WEBHOOK_VERIFY_TOKEN`; drop the default ([M6](#m6-webhook-verification-token-has-a-guessable-default)).
8. Environment-split CORS; remove the ngrok origin ([M3](#m3-cors-allows-a-reassignable-ngrok-tunnel-and-a-preview-domain)).
9. Fix the `timingSafeEqual` length crash ([C4](#c4-oauth-tokens-encrypted-with-a-fixed-iv-and-no-authentication)).

**Next — crypto and input**
10. AES-256-GCM with per-message IVs, plus a lazy re-encryption migration ([C4](#c4-oauth-tokens-encrypted-with-a-fixed-iv-and-no-authentication)).
11. Global `ValidationPipe` + `class-validator`, DTOs for auth and search first ([M5](#m5-no-declarative-request-validation-anywhere)).
12. Redis-atomic rate limiting extended to search/integrations; set `trust proxy` ([H1](#h1-rate-limiting-covers-4-routes-and-is-bypassable)).
13. `helmet` + CSP; move tokens to `httpOnly` cookies ([M4](#m4-no-security-headers), [H3](#h3-access-tokens-in-localstorage)).

**Then — make regressions visible**
14. Commit `svg.d.ts` so `type-check` passes and can gate CI ([M8](#m8-frontend-type-check-fails-on-a-clean-clone--ci-cannot-gate-types)).
15. Backend tests starting at the auth layer — the fixes above are the specification.
16. Frontend test runner (Vitest) + Playwright on login, search, profile.
17. Cloud Build pipelines for both repos.

**Then — the product mandate**
18. Resolve the `better-auth` question ([H2](#h2-better-auth-cookie-signature-is-discarded-never-verified)) and consolidate the duplicated frontend stacks ([5.4](#54-frontend--duplicated-stacks-shipping-to-users)) — both are prerequisites that get cheaper the earlier they happen.
19. Design tokens → dark mode → i18n scaffold, in that order.
20. Static/ISR public profiles with per-profile metadata and JSON-LD — the largest SEO win.
21. Payments, BankID, and chain work — only after the auth layer is trustworthy.

---

## 9. Remediation status

Applied in this pass. Both repositories typecheck clean (backend 0 errors; frontend **130 → 0**) and both production builds pass after these changes.

| Finding | Status | Change |
|---|---|---|
| [C1](#c1-access-tokens-never-expire) Tokens never expire | ✅ **Fixed** | `account.guard.ts` now enforces the `exp` claim, honouring the pre-existing `ignoreExpiration` parameter. Chosen over flipping the middleware default because the refresh handler derives identity from `HttpContext.getCurrentUserId` — i.e. from the lapsed access token — so the naive fix would have broken refresh for everyone. `RefreshTokenGuard` keeps its exemption; all other guards now reject expired tokens. |
| [C3](#c3-permission-check-uses-substring-matching) Substring permissions | ✅ **Fixed** | `permissions.guard.ts` now requires exact equality, with explicit `*` / `prefix.*` wildcards and empty-string grants rejected. Verified safe: `Permissions.discoverControllerPermissions()` issues permissions in the identical `Controller.method` shape, so no existing grant is invalidated. |
| [C4](#c4-oauth-tokens-encrypted-with-a-fixed-iv-and-no-authentication) `timingSafeEqual` crash | ✅ **Fixed** | `verifyWithHMAC` length-checks before comparing, so a wrong-length HMAC returns `false` instead of raising `RangeError`. |
| [H1](#h1-rate-limiting-covers-4-routes-and-is-bypassable) Wrong client IP | ✅ **Partly fixed** | `app.set('trust proxy', 1)` added in `main.ts` (one hop — the platform LB) so `req.ip` is the real client. Atomic Redis counting and extending coverage beyond the 4 auth routes remain open. |
| [M3](#m3-cors-allows-a-reassignable-ngrok-tunnel-and-a-preview-domain) CORS origins | ✅ **Fixed** | `cors.config.ts` split by `NODE_ENV`; the reassignable ngrok tunnel and preview deployment are development-only. |
| [M6](#m6-webhook-verification-token-has-a-guessable-default) Webhook default | ✅ **Fixed** | Both the verification endpoint and the subscribe/unsubscribe service now fail closed when `YOUTUBE_WEBHOOK_VERIFY_TOKEN` is unset, via a shared `getVerifyToken()`. |
| [M8](#m8-frontend-type-check-fails-on-a-clean-clone--ci-cannot-gate-types) Typecheck broken | ✅ **Fixed** | `src/global.d.ts` declares `*.svg` as a React component. **130 errors → 0** — `type-check` is now usable as a CI gate. |
| [M9](#m9-module-scope-localstorage-in-client-components) Module-scope token | ✅ **Fixed** | YouTube and Instagram callbacks read the token at point of use with an SSR guard. Twitter was verified correct and left alone. |
| [M10](#m10-both-yarnlock-and-package-lockjson-are-committed-frontend) Dual lockfiles | ✅ **Fixed** | `package-lock.json` untracked and gitignored; `yarn.lock` is authoritative. |
| [M11](#m11-build-artifacts-and-test-fixtures-committed-backend) Committed artifacts | ✅ **Fixed** | `test_video.mp4` (10 MB), both `.tsbuildinfo` files, `test_sql_output.js` and the DB dump untracked; `.gitignore` extended with `*.tsbuildinfo`, `*.dump`, `*.sql` and friends. |

### Deliberately not changed

These need a decision, a migration, or coordination — doing them silently would be worse than leaving them documented.

| Finding | Why deferred |
|---|---|
| [C2](#c2-production-database-dump-committed-to-git) DB dump in history | The file is removed from `HEAD` and blocked by `.gitignore`, which stops further spread. **The blob is still in history at `e4b5f3b`.** Purging it needs `git filter-repo` plus a coordinated force-push and a re-clone by everyone — destructive and not something to spring on the team unannounced. **Credential rotation is the urgent part and is yours to trigger.** |
| [C5](#c5-session-revocation-fails-open) Revocation fails open | The correct fix is a DB fallback on cache miss, which means injecting the identity repository into the guard factory. Failing closed *without* that fallback would log out every user with a cold cache — a self-inflicted outage. Wants tests first. |
| [C4](#c4-oauth-tokens-encrypted-with-a-fixed-iv-and-no-authentication) Fixed IV / CBC | Moving to AES-GCM changes the stored ciphertext format for live OAuth tokens. Needs a dual-read migration and a re-encrypt pass, not an in-place edit. |
| [M5](#m5-no-declarative-request-validation-anywhere) No validation | Adding a global `ValidationPipe` with `forbidNonWhitelisted` before DTOs exist would reject live traffic. Correct order: add DTOs per slice, then enable the pipe. |
| [M2](#m2-default-credentials-for-privileged-accounts) Seeder / default admin | Re-enabling `DataSeeder` fixes role seeding but simultaneously creates an admin with a published default password. Make the credentials `.required()` in the same change that re-enables it. |
| [H2](#h2-better-auth-cookie-signature-is-discarded-never-verified) `better-auth` half-state | Adopt-or-remove is a product decision, not a cleanup. |
| §[5.1](#51-backend--unreachable-dependencies)/[5.3](#53-frontend--unreachable-dependencies) Dead dependencies | Removal is safe but touches lockfiles and deployment images; best done as its own reviewable commit. |

---

*Findings verified against source at the commits named above. Line references will drift as fixes land; the file paths and reasoning will not.*
