# Gaddr Security Guidelines

**Effective:** 2026-07-28
**Applies to:** Backend (`Gaddr-Search-Me-Backend`) and Frontend (`Gaddr-Search-Me-Frontend`)
**Owner:** Engineering
**Review cycle:** Every security-relevant change; full review quarterly

This is the single source of truth for security, safety, secrets management, and secure
development across both Gaddr repositories. It is an engineering standard, not a tutorial.

Every rule here is grounded in the actual codebase. Where the implementation contradicts a
previously documented claim, the conflict is noted explicitly.

---

## Table of contents

1. [Security Philosophy](#1-security-philosophy)
2. [Secure Development Principles](#2-secure-development-principles)
3. [Secret Management](#3-secret-management)
4. [Git Security Rules](#4-git-security-rules)
5. [GitHub Protection](#5-github-protection)
6. [Environment Management](#6-environment-management)
7. [Authentication Security](#7-authentication-security)
8. [Authorization](#8-authorization)
9. [API Security](#9-api-security)
10. [Database Security](#10-database-security)
11. [Redis Security](#11-redis-security)
12. [Storage Security](#12-storage-security)
13. [Frontend Security](#13-frontend-security)
14. [Backend Security](#14-backend-security)
15. [Logging Policy](#15-logging-policy)
16. [Third-Party Integrations](#16-third-party-integrations)
17. [Dependency Security](#17-dependency-security)
18. [CI/CD Security](#18-cicd-security)
19. [Infrastructure Security](#19-infrastructure-security)
20. [Security Checklist](#20-security-checklist)
21. [AI Agent Security Rules](#21-ai-agent-security-rules)
22. [Incident Response](#22-incident-response)

---

## 1. Security Philosophy

Security is not a feature. It is a requirement for every line of code, every
configuration change, and every deployment.

Every change must protect:

- **User data** — passwords, emails, 2FA secrets, search history, linked accounts
- **Secrets** — API keys, encryption keys, database credentials, OAuth tokens
- **Authentication** — JWT signing, session management, refresh token rotation
- **Infrastructure** — Cloud Run, Redis, Neon PostgreSQL, Cloudflare R2
- **APIs** — 201 backend endpoints, WebSocket events, webhook receivers
- **Cloud resources** — GCP project, Cloudflare account, YouTube API quota
- **Build pipeline** — Cloud Build, Docker images, deployment artifacts
- **Deployment** — production environment variables, service accounts
- **Third-party integrations** — YouTube, Facebook, Instagram, TikTok, Pinterest, and 7 others

Security must never be optional, deferred, or simplified for convenience.

### Known incident

A production database dump (`neondb_backup_20260717_223225.dump`) containing 14 user
password hashes, TOTP 2FA secrets, and 30 email addresses was committed to git history
at commit `e4b5f3b`. The file is removed from HEAD and blocked by `.gitignore`, but the
blob remains in history. Credential rotation and `git filter-repo` purge are pending
team coordination. See [§22 Incident Response](#22-incident-response).

---

## 2. Secure Development Principles

These are not aspirational. They are enforced by code, tooling, and review.

### Least privilege

Every service, guard, and integration operates with the minimum permissions required.
The database user runs migrations but does not own the application. Redis has no write
access to PostgreSQL. OAuth tokens are scoped to the narrowest API set.

### Defense in depth

No single control is trusted alone. Authentication is checked at the middleware layer
(`httpContext.middleware.ts`) and again at the guard layer (`account.guard.ts`).
Rate limiting is applied at both the middleware (`rate-limit.middleware.ts`) and guard
(`searchRateLimit.guard.ts`) levels. Session validity is checked against both Redis
cache and the database.

### Fail securely

When a system component is unavailable, the default is denial, not permissiveness.
Session revocation on cache miss falls back to the database, then fails closed if
neither source can confirm the session (`account.guard.ts`). Rate limiting degrades to
a bounded local counter, not to unlimited access.

### Secure defaults

Defaults must be secure without configuration. `JWT_SECRET` defaults to a hardcoded
string (`configs.ts:38`) — this is a **known defect** that must be fixed. All secrets
must be `.required()` with no default value in production Joi schemas.

### Zero trust

Network location does not imply trust. **`trust proxy` is NOT set** — this is an
**open defect** (see §9.2). Without it, `req.ip` reflects the Cloud Run infrastructure
IP, not the real client, making IP-based rate limiting and security logging ineffective.
Cookie-signed Better Auth sessions are verified against the database, not trusted by
cookie integrity alone.

### Input validation

Every external input must be validated before use. Currently, 201 endpoints lack a
global `ValidationPipe` — validation is performed ad-hoc via Joi in CQRS command
handlers. This is a **known systemic gap** (finding M5). Add `class-validator` DTOs
per slice, then enable the pipe.

### Output encoding

User-supplied content rendered in HTML must be escaped. The frontend uses React's
default JSX escaping (no `dangerouslySetInnerHTML` found in source). Profile content
and search results must be treated as untrusted.

### Principle of minimal exposure

Secrets are loaded via environment variables and never propagated to response bodies,
log output, or client-side code. Internal IDs (database primary keys) are not exposed
in API responses where external identifiers suffice.

### Backward compatibility

The backend and frontend deploy independently. A new backend may be served by an old
client for a window. All changes must be additive. A new field must be safe to be
absent on the other side. Breaking changes require coordinated deployment.

### Production-first mindset

Security fixes ship to production first, not to a future branch. The audit findings
C1–C5 were prioritized by blast radius, not by code complexity. Every change must be
safe to deploy to production — no debug endpoints, no test credentials, no development
tunnels in production CORS.

---

## 3. Secret Management

### 3.1 How secrets are loaded

All secrets are loaded through environment variables, validated by Joi in
`src/configs.ts`, and accessed via the `configs` default export. The application uses
`dotenv` to load `.env.${NODE_ENV}` at startup.

### 3.2 Complete secret inventory

These are the secrets managed by this project, grouped by category:

| Category | Variables | Required |
|---|---|---|
| **JWT** | `JWT_SECRET`, `JWT_AUDIENCE`, `JWT_ISSUER` | `SECRET` required (but has insecure default); `AUDIENCE`/`ISSUER` have defaults |
| **Encryption** | `ENCRYPTION_KEY`, `ENCRYPTION_IV`, `ENCRYPTION_ALGORITHM` | Yes |
| **Database** | `DATABASE_URL`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USERNAME`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE` | Partial |
| **Redis** | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_USERNAME` | Partial |
| **Cloudflare R2** | `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL_BASE` | Yes |
| **Better Auth** | `BETTER_AUTH_SECRET`, `BETTER_AUTH_COOKIE_NAME` | `SECRET` required; `COOKIE_NAME` has default |
| **SMTP** | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | Partial |
| **Brevo** | `BREVO_API_KEY`, `BREVO_WEBHOOK_SECRET` | Partial |
| **YouTube** | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_API_KEY`, `YOUTUBE_WEBHOOK_URL`, `YOUTUBE_WEBHOOK_VERIFY_TOKEN` | Partial |
| **Facebook** | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_APP_SECRET` | Partial |
| **Instagram** | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` | Partial |
| **Pinterest** | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | Partial |
| **Twitter/X** | `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET` | Partial |
| **TikTok** | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET` | Partial |
| **GitHub** | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Partial |
| **LinkedIn** | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Partial |
| **Reddit** | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | Partial |
| **Discord** | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Partial |
| **Twitch** | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Partial |
| **Snapchat** | `SNAPCHAT_CLIENT_ID`, `SNAPCHAT_CLIENT_SECRET` | Partial |
| **Threads** | `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET` | Partial |
| **Behance** | `BEHANCE_CLIENT_ID`, `BEHANCE_CLIENT_SECRET` | Partial |
| **Spotify** | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Partial |
| **Cloudinary** | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Partial |
| **Turnstile** | `TURNSTILE_SECRET_KEY` | Partial |

### 3.3 Rules

**Never:**

- Hardcode secrets in source code
- Log secrets (see [§15 Logging Policy](#15-logging-policy))
- Commit secrets to git (see [§4 Git Security Rules](#4-git-security-rules))
- Expose secrets to the frontend — OAuth client secrets stay on the server
- Include secrets in screenshots, markdown, documentation, or examples
- Expose secrets inside tests — mock or use test-specific values
- Upload secrets to GitHub, even in private repositories
- Use production secrets in development or testing environments
- Store secrets in Redis cache, database, or object storage
- Pass secrets via URL query parameters

**Always:**

- Load secrets through environment variables only
- Validate secrets at startup via Joi schemas
- Use `.required()` for secrets that have no safe default
- Rotate secrets periodically and after any suspected exposure
- Use Google Cloud Secret Manager for production secrets
- Never use Cloud Build substitutions for secrets (they appear in build logs)

### 3.4 Known defects

| Defect | Location | Status |
|---|---|---|
| `JWT_SECRET` defaults to a hardcoded string: `'this is my custom Secret key for authentication'` | `configs.ts:38` | **OPEN** — must be `.required()` with no default |
| `SYSTEM_ADMIN_PASSWORD` defaults to `'@Admin@123'` | `configs.ts:234` | **OPEN** — must be `.required()` when DataSeeder is re-enabled |
| `GUEST_USER_PASSWORD` defaults to `'@Abc@123'` | `configs.ts:238` | **OPEN** — same |
| Trivially weak encryption key in dev env: `12345678901234567890123456789012` | `.env.development` | **OPEN** — dev-only, but documents the pattern |
| Trivially weak IV in dev env: `1234567890123456` | `.env.development` | **OPEN** — same |
| Real production secrets in `.env.docker` and `cloudrun-env.yaml` | Both files | **OPEN** — files are gitignored but were committed before the rule existed |
| `YOUTUBE_WEBHOOK_VERIFY_TOKEN` accessed via raw `process.env` | `youtube-webhook.endpoint.ts:37` | **OPEN** — bypasses Joi startup validation; not declared in `configs.ts` schema |
| `GOOGLE_CALLBACK_URL` referenced in config export but `GOOGLE_REDIRECT_URI` declared in Joi | `configs.ts:218,349` | **OPEN** — variable passes through `.unknown()`, never validated |

---

## 4. Git Security Rules

### 4.1 What must never be committed

- `.env`, `.env.*`, `.env.development`, `.env.docker`, `.env.production`
- `cloudrun-env.yaml`
- Database dumps: `*.dump`, `*.sql`, `*.sql.gz`
- Credentials, private keys, service account JSON files
- OAuth client secret files, certificates
- Build artifacts: `*.tsbuildinfo`, `test_video.mp4`
- Logs containing secrets: `server_err.log`, `server_out.log`
- Large binary files (use Git LFS or object storage)

### 4.2 What the .gitignore covers

The backend `.gitignore` (66 lines) covers:

```
.env, .env.development, .env.development.local, .env.test.local,
.env.production.local, .env.local, cloudrun-env.yaml, .env.docker
```

Additional entries per audit remediation: `*.dump`, `*.sql`, `*.tsbuildinfo`

### 4.3 Current .gitignore gaps

| Gap | Risk | Recommended action |
|---|---|---|
| `neondb_backup_20260717_223225.dump` blob still in git history at `e4b5f3b` | Password hashes + 2FA seeds accessible to anyone with repo access | `git filter-repo --invert-paths --path neondb_backup_20260717_223225.dump` + coordinated force-push |
| `test_video.mp4` (10 MB) in repo root | Wastes repo space, may contain metadata | Move to R2 or Git LFS |
| Utility scripts in repo root (`gen-tokens.js`, `check-schema.js`, etc.) | May contain hardcoded values | Audit and remove or gitignore |

### 4.4 Rules

- Update `.gitignore` before adding sensitive files
- Use `.env.example` with placeholders for documentation
- Never force-add ignored files (`git add -f`)
- Never delete developer `.env` files — only ignore them
- Run `gitleaks detect` before pushing (see [§5 GitHub Protection](#5-github-protection))

---

## 5. GitHub Protection

### 5.1 Required protections

| Protection | Status | Action needed |
|---|---|---|
| Secret scanning | **NOT CONFIGURED** — `.gitleaks.toml` does not exist in this checkout despite audit claiming it does | Create `.gitleaks.toml` with rules for `pina_`, `ya29.`, `EAA`, `act.` token shapes and DB dump content detection |
| Push protection | Depends on GitHub repo settings | Enable in repository settings |
| Branch protection on `main` | Depends on GitHub repo settings | Require PR reviews, status checks, and signed commits |
| Signed commits | Recommended, not enforced | Enable via branch protection rules |
| PR reviews | Depends on GitHub repo settings | Require at least 1 reviewer |
| Code Owners | Not configured | Create `.github/CODEOWNERS` |
| Required status checks | Depends on CI pipeline | Gate on lint + typecheck + tests |

### 5.2 Rule

Any detected secret must block merging until removed. The gitleaks rule set must
cover at minimum: API key patterns, database connection strings, OAuth client secrets,
encryption keys, and file-extension-based dump detection.

---

## 6. Environment Management

### 6.1 Environment tiers

| Tier | Purpose | Secrets source |
|---|---|---|
| **Development** | Local development | `.env.development` (dotenv) |
| **Testing** | CI/CD test runs | Test-specific env vars, no production secrets |
| **Staging** | Pre-production verification | Mirror of production secrets (separate instances) |
| **Production** | Live service | Google Cloud Secret Manager |

### 6.2 Rules

- No production secrets inside development or testing environments
- Never reuse production credentials across environments
- Never mix environment configurations
- Development uses `localhost` origins only; production uses `gaddr.com` domains
- `NODE_ENV` must be set correctly — it controls logging level, CORS origins, and security behavior
- The application loads `.env.${NODE_ENV}` at startup (`configs.ts:12-15`)

### 6.3 Environment-specific behavior

| Behavior | Development | Production |
|---|---|---|
| CORS origins | localhost + ngrok + Vercel preview | **Same static list** (see §6.4) |
| Log level | `debug` (verbose) | `info` (structured) |
| Winston redaction | Disabled | Enabled |
| Swagger/Scalar docs | Enabled | Disabled (`main.ts` gates on `configs.env`) |
| Turnstile test token | `'test-token'` always passes | Real verification required |
| Rate limit ceiling | 100,000 req/min | 120 req/min |

### 6.4 CORS defect

**Current state:** `cors.config.ts` exports a single static array of 12 origins with
no `NODE_ENV` branching. The ngrok tunnel (`almost-backtrack-drapery.ngrok-free.dev`)
and Vercel preview (`social-app-zeta-three.vercel.app`) are always in the CORS list,
including production. This is a **live production issue**.

**Required:** Split `cors.config.ts` by `NODE_ENV`. Production must only allow
`gaddr.com`, `www.gaddr.com`, `demo.gaddr.com`, `jobs.gaddr.com`. Development origins
(localhost, ngrok, Vercel preview) must be restricted to `NODE_ENV === 'development'`.

---

## 7. Authentication Security

### 7.1 Architecture

The backend supports two authentication paths, resolved in order by
`httpContext.middleware.ts`:

1. **Better Auth session** — database-stored session token via `better-auth.session_token`
   cookie. Verified by direct SQL lookup against `identity."Sessions"` and
   `identity."Users"` tables. The `better-auth` npm package has **zero imports** — its
   session logic is reimplemented in raw SQL (`betterAuthSession.util.ts`).

2. **JWT access token** — signed with `JWT_SECRET`, extracted from `Authorization:
   Bearer` header or `access_token` / `ACCESS_TOKEN` cookie. Verified by
   `@nestjs/jwt` with issuer and audience claims.

Both paths set `HttpContext.user` via `AsyncLocalStorage` (per-request-safe, verified
correct — not a cross-request leak).

### 7.2 JWT configuration

| Parameter | Value | Source |
|---|---|---|
| Algorithm | HS256 (implicit) | `@nestjs/jwt` default |
| Access token TTL | `7d` (misnamed as `JWT_ACCESS_EXPIRATION_MINUTES`) | `configs.ts:49` |
| Refresh token TTL | `30d` | `configs.ts:53` |
| Claims | UserId, Email, UserName, GivenName, FamilyName, FullName, UserType, ProfileImage, Roles, Permissions, SecurityStamp, ConcurrencyStamp, onboardingStep | `token.service.ts` |
| 2FA pre-verification JWT | 5-minute TTL with `TwoFARequired: true`, device-id, ip-address, user-agent binding | `token.service.ts` |

### 7.3 Guards

Six guards are created via a factory pattern in `account.guard.ts`:

| Guard | UserType filter | Expiration enforced | Used in |
|---|---|---|---|
| `UserAccoutGuard` | `User` | Yes | 125 files |
| `AdminAccoutGuard` | `Admin` | Yes | Admin endpoints |
| `GuestAccoutGuard` | `Guest` | Yes | Guest endpoints |
| `AuthenticatedAccountGuard` | Any | Yes | 22 files |
| `TwoFAVerificationGuard` | Any (2FA bypass) | Yes | 2FA flow |
| `RefreshTokenGuard` | Any | No (tolerates expired) | Token refresh |

The `PermissionsGuard` (`permissions.guard.ts`) re-verifies the JWT independently and
checks `ControllerName.MethodName` against user permission claims.

### 7.4 Session revocation

Security stamp rotation (on password change) invalidates all sessions for a user.
On cache miss, the guard falls back to a database read, repopulates the cache, then
fails closed if neither source can confirm the session. This was finding C5, now
**fixed**.

### 7.5 Known defects

| Defect | Location | Status |
|---|---|---|
| `JWT_ACCESS_EXPIRATION_MINUTES` defaults to `'7d'` (name says minutes, value is days) | `configs.ts:49` | **OPEN** — rename to `JWT_ACCESS_TOKEN_TTL`, set to 15 minutes |
| Better Auth cookie signature is discarded, never verified | `betterAuthSession.util.ts` | **OPEN** — architectural decision needed (adopt or remove `better-auth`) |
| Hardcoded `UserType.User` for Better Auth sessions | `httpContext.middleware.ts:133` | **OPEN** — admin users authenticating via Better Auth are silently downgraded |
| `RefreshTokenGuard` ignores expiration | `account.guard.ts` | **By design** — needed for refresh flow |
| Login has no Turnstile CAPTCHA | `login.endpoint.ts` | **OPEN** — only registration has Turnstile |
| 2FA verify condition is inverted | `2fa-verify.handler.ts:79` | **OPEN** — users with 2FA enabled cannot verify |
| `better-auth` package has zero imports | package.json | **OPEN** — adopt or remove decision pending |

### 7.6 Rules

- Access tokens must expire (15 minutes recommended, refresh tokens carry longevity)
- Refresh tokens must rotate on every use
- Session revocation must fail closed, not open
- Cookie-authenticated clients must be supported alongside header-authenticated ones
- 2FA must be enforced for admin accounts
- Turnstile must protect registration AND login endpoints
- The dual auth system (JWT + Better Auth) must be resolved — adopt one

---

## 8. Authorization

### 8.1 Role-based access

The system uses a claims-based model with `UserType` (User, Admin, Guest) and
per-endpoint permission strings.

| Guard | Purpose | Enforcement |
|---|---|---|
| `UserAccoutGuard` | Standard authenticated users | UserType = User |
| `AdminAccoutGuard` | Administrative operations | UserType = Admin |
| `GuestAccoutGuard` | Unauthenticated access | UserType = Guest |
| `AuthenticatedAccountGuard` | Any authenticated user | UserType != undefined |
| `PermissionsGuard` | Fine-grained endpoint permissions | Permission string match |

### 8.2 Permission validation

Permissions are checked in `permissions.guard.ts`. The current implementation uses
`String.includes()` for matching (line 53), which is a **known defect** (finding C3).
A permission of `"User"` would match any endpoint whose combined controller+handler
name contains that substring.

**Required fix:** exact match against a declared permission set, with explicit wildcard
support (`*`, `prefix.*`), and rejection of empty-string grants.

### 8.3 Rules

- Every protected endpoint must have an explicit guard
- Permission strings must use exact match, not substring
- Empty permission grants must be rejected at issuance time
- Admin endpoints must require `AdminAccoutGuard` — never `UserAccoutGuard`
- Ownership validation must be checked for resource-specific operations (profile
  edits, playlist modifications, account settings)
- Guest access must be limited to public-facing endpoints (profiles, search)

---

## 9. API Security

### 9.1 Input validation

**Current state:** No global `ValidationPipe`. No `class-validator` or
`class-transformer` installed. Validation is performed via Joi in individual CQRS
command handlers. This is the single largest systemic gap after the auth findings.

**Required:** Add `class-validator` + `class-transformer`, then enable
`ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
Add DTOs per vertical slice, starting with auth and search.

### 9.2 Rate limiting

| Endpoint class | Rate limit | Storage | Status |
|---|---|---|---|
| `/api/v1/auth/login` | 120/min (prod) | Database (`IRateLimitRepository`) | **OPEN** — non-atomic read-then-write |
| `/api/v1/auth/register` | 120/min (prod) | Database | **OPEN** — same |
| `/api/v1/auth/forgot-password` | 120/min (prod) | Database | **OPEN** — same |
| `/api/v1/auth/verify-otp` | 120/min (prod) | Database | **OPEN** — same |
| Search endpoints | Per-user, per-IP | Redis atomic `INCR` | **NOT PRESENT** in this checkout |
| All other endpoints | **Unlimited** | — | **OPEN** |

**Critical defect:** `trust proxy` is not set anywhere in the codebase. Without it,
`req.ip` reflects the Cloud Run infrastructure IP, not the real client. This means:

- IP-based rate limiting on auth routes is ineffective — all requests appear from
  the same IP
- 2FA IP-change detection compares against a meaningless infrastructure IP
- Security logging of client IPs records infrastructure IPs, not real users

**Required:** Add `app.set('trust proxy', 1)` in `main.ts` before `app.enableCors()`,
then update this document.

### 9.3 Request handling

- Request bodies are parsed by NestJS default body parser
- No explicit request size limit configured at the NestJS layer (256 MB at upload handler)
- `trust proxy` is set to `1` (`main.ts`) — `req.ip` is the real client IP
- CORS is configured with `credentials: true` and specific allowed headers

### 9.4 Error handling

- Global exception filter should not expose stack traces in production
- Login returns HTTP 200 on failure (`login.endpoint.ts:28`) — clients use response body, not status codes
- Internal errors must not leak database structure, query details, or file paths

### 9.5 Rules

- Add `ValidationPipe` with DTOs before enabling `forbidNonWhitelisted`
- Extend rate limiting to all public-facing endpoints using Redis atomic operations
- Never expose stack traces, SQL queries, or internal file paths in error responses
- Never expose database primary keys in API responses where external IDs suffice
- All API responses must have appropriate Content-Type headers
- Request timeout must be configured to prevent slowloris attacks

---

## 10. Database Security

### 10.1 Architecture

- **Engine:** PostgreSQL (Neon serverless)
- **ORM:** TypeORM with 39 entities, 57 migrations
- **Connection:** `DATABASE_URL` or individual `POSTGRES_*` variables
- **SSL:** `data.source.ts:14-16` hardcodes `rejectUnauthorized: false` and **never
  reads** `configs.postgres.ssl.rejectUnauthorized`. Even if the config default is
  changed, the hardcoded value overrides it. This is a **known defect**.

### 10.2 Query safety

All 387 raw `.query()` call sites use parameterized placeholders. No template
interpolation (`${}`) or string concatenation was found inside query strings. This was
verified in the security audit.

### 10.3 SQL injection prevention

- TypeORM generates parameterized queries for entity operations
- Raw queries use `$1`, `$2`, etc. placeholders
- No `createQueryBuilder` with string interpolation
- Joi validation in handlers provides input sanitization before queries

### 10.4 Sensitive columns

| Table | Sensitive columns | Protection |
|---|---|---|
| `identity."Users"` | `passwordHash`, `twoFactorSecret`, `securityStamp` | Encrypted at rest by Neon |
| `identity."UserLogins"` | Session tokens, external login linkage | Tokens must be hashed (currently plaintext — finding H2) |
| `public."LinkedAccounts"` | OAuth access/refresh tokens | Encrypted via `crypto.util.ts` (AES-CBC, static IV — finding C4) |
| `public."DataProtectionKeys"` | `key`, `value` | Encryption key storage |
| `public."SearchHistories"` | User search queries | Behavioral data — retention policy needed |

### 10.5 Rules

- `data.source.ts` must use `configs.postgres.ssl.rejectUnauthorized` instead of the
  hardcoded `false`. The config default in `configs.ts:81` must also be changed to `true`.
- Database passwords must never appear in logs or error messages
- Migrations must be reviewed for destructive operations (DROP, ALTER) before merge
- Backups must be encrypted and stored off-system
- Sensitive columns (passwords, 2FA secrets, tokens) must use application-layer
  encryption in addition to database-at-rest encryption
- Session tokens must be stored as `sha256(token)` hashes, not plaintext
- The `identity."UserClaims"` vs `identity."userClaims"` duplicate table case issue
  must be investigated and consolidated

---

## 11. Redis Security

### 11.1 Architecture

- **Client:** ioredis (single shared instance)
- **Memory limit:** 30 MB (infrastructure constraint)
- **Connection limit:** 30 connections (infrastructure constraint)
- **Key prefix:** All keys prefixed with `gaddr:`
- **In-memory LRU cache:** 100 entries, 15-second default TTL, sits in front of Redis reads
- **Connection monitoring:** Polls `INFO clients` every 30 seconds, warns if `connected_clients > 25`

### 11.2 Usage patterns

| Pattern | Key format | TTL |
|---|---|---|
| Session/account cache | `gaddr:{userId}_user_account` | 604800s (7 days) |
| Search results | `gaddr:search:{hash}` | 5 min – 24 hours |
| Rate limiting (if implemented) | `gaddr:ratelimit:{key}` | Per window |
| BullMQ job queues | `gaddr:bull:*` | Queue-managed |

### 11.3 Graceful degradation

When Redis is unavailable at startup, the application continues without it
(`main.ts:57-63`). Session verification falls back to the database. Rate limiting
degrades to a bounded local counter. The cache miss path must never be more
permissive than a cache hit.

### 11.4 Rules

- Every Redis key must have a TTL
- Never store secrets in Redis
- Never cache data that should not be readable if Redis is compromised
- Reuse the shared ioredis client — do not create additional connections
- Monitor `connected_clients` against the 30-connection limit
- Cache invalidation must be explicit, not time-dependent alone
- BullMQ workers create their own blocking connections — account for them in the
  connection budget

---

## 12. Storage Security

### 12.1 Architecture

| Service | Purpose | Client |
|---|---|---|
| Cloudflare R2 | Video/content storage, media uploads | `@aws-sdk/client-s3` (`r2-storage.service.ts`) |
| Cloudinary | Avatar/profile image uploads | Cloudinary SDK |

### 12.2 R2 configuration

- Bucket accessed via `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
- Public URL via `R2_PUBLIC_URL_BASE`
- Endpoint: `https://{CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
- Region: `auto`
- Cleanup cron job exists: `r2-cleanup.cron.ts`

### 12.3 Upload validation

- Allowed MIME types: JPEG, PNG, GIF, WebP, MP4, MOV
- Max file size: 256 MB (hardcoded in `upload.handler.ts`)
- No virus scanning
- No content validation beyond MIME type

### 12.4 Rules

- Never expose R2 bucket credentials in API responses or client-side code
- Validate uploads by MIME type AND file magic bytes, not just extension
- Enforce file size limits at both the application and infrastructure layers
- Generate secure, unpredictable object names (UUIDs, not user-supplied filenames)
- Use signed URLs for temporary access; never expose bucket credentials
- Delete temporary upload files after processing
- Scan uploaded content for malware before serving
- Do not serve user-uploaded content with `Content-Type` inferred from filename

---

## 13. Frontend Security

### 13.1 Token handling

**Current state (finding H3):** Access tokens are stored in `localStorage`, making
them readable by any script on the origin. The backend already accepts `httpOnly`
cookies (`req.cookies?.access_token` in `httpContext.middleware.ts:71`). The secure
path is half-wired.

**Required:** Standardize on `httpOnly; Secure; SameSite=Lax` cookies. Delete all
`localStorage.setItem("accessToken", ...)` calls.

### 13.2 XSS prevention

- No `dangerouslySetInnerHTML` found in frontend source
- No `eval` found in frontend source
- React's default JSX escaping is in effect
- CSP is **not configured** (finding M4) — this is the main structural defense against XSS

### 13.3 Security headers

**Current state:** No `helmet` middleware. No CSP, HSTS, `X-Frame-Options`, or
`X-Content-Type-Options` configured. The frontend sets only `Cross-Origin-Opener-Policy`
in `next.config.ts`.

**Required:** Add security headers via Next.js `headers()` config or middleware.

### 13.4 Module-scope localStorage (finding M9)

`YouTubeIntegrationCallback.tsx` and `InstagramIntegrationCallback.tsx` read tokens
at module scope (outside the component), which executes during SSR where `localStorage`
is undefined. Fixed per audit.

### 13.5 Rules

- Never store tokens in `localStorage` or `sessionStorage`
- Use `httpOnly; Secure; SameSite=Lax` cookies for all auth tokens
- Sanitize all user-supplied content before rendering
- Implement Content Security Policy (CSP)
- Add `X-Content-Type-Options: nosniff`
- Add `X-Frame-Options: DENY` or `SAMEORIGIN`
- Add `Strict-Transport-Security` (HSTS) in production
- Never use `eval()`, `Function()`, or `dangerouslySetInnerHTML`
- Validate and sanitize OAuth callback parameters
- Protect client-side routes with auth checks at the middleware level

---

## 14. Backend Security

### 14.1 Validation

- No global `ValidationPipe` — validation is ad-hoc via Joi in handlers
- No `class-validator` or `class-transformer` in `package.json`
- This is finding M5, the largest systemic gap

### 14.2 Exception handling

- Global exception filter must not expose stack traces in production
- `ApplicationException` class provides structured error responses
- Winston logger captures exceptions with context

### 14.3 Logging

- Winston with daily rotate file transport (20 MB max, 21-day retention)
- Sensitive data redaction is comprehensive but **only enabled in production**
- `console.log` statements in `OnboardingGuard` bypass Winston redaction
- 176 `console.log` calls in backend `src/` — should route through Winston

### 14.4 Rate limiting

- Database-backed rate limiting on 4 auth routes (non-atomic)
- No rate limiting on search, API, or other endpoints
- `trust proxy` is set (fix for finding H1)

### 14.5 Encryption

- **Current:** AES-256-CBC with static IV from environment (`crypto.util.ts`)
- **Required:** AES-256-GCM with per-message random IVs, HKDF-derived key
- The `encryptWithHMAC` and `verifyWithHMAC` functions exist but are never called
- Key and IV are exported as module constants — anyone importing `cryptoUtils` can
  access the raw key material

### 14.6 Webhook verification

- YouTube webhook: receives `x-hub-signature` but **does not verify it**
  (`youtube-webhook.endpoint.ts:59`). The `processNotification` method does nothing.
- YouTube webhook verify token falls back to `'default_verify_token'` if env var is
  not set (`youtube-webhook.endpoint.ts:37,72`). The `getVerifyToken()` helper
  referenced in the audit does **not exist** in this checkout. This finding is
  **OPEN**, not fixed.
- Brevo webhook: uses `crypto.timingSafeEqual` for bearer token verification (correct).

### 14.7 Rules

- Add `class-validator` DTOs and enable global `ValidationPipe` per slice
- Route all logging through Winston — ban bare `console.*` in lint
- Encrypt OAuth tokens with AES-256-GCM, per-message random IVs
- Verify all webhook signatures before processing payloads
- Never fall back to default/known tokens for webhook verification
- All background jobs must have error handling and retry logic
- Hash session tokens before storage (`sha256(token)`)

---

## 15. Logging Policy

### 15.1 What must never be logged

- Passwords (plain or hashed)
- JWT access tokens or refresh tokens
- OAuth access tokens or refresh tokens
- Database connection strings or URLs
- API keys (YouTube, Facebook, Pinterest, etc.)
- Encryption keys (`ENCRYPTION_KEY`, `ENCRYPTION_IV`)
- Redis passwords
- SMTP passwords
- `BETTER_AUTH_SECRET`
- Cloudflare R2 access keys
- Personal information beyond what is operationally required (user IDs for
  debugging are acceptable; email addresses and phone numbers are not)

### 15.2 Winston redaction

The Winston logger (`winston.util.ts`) includes a comprehensive redaction list
covering: CSRF tokens, Bearer tokens, credit card numbers, SSNs, email patterns,
API key patterns, and sensitive field names. Redaction is only enabled when
`NODE_ENV === 'production'`.

### 15.3 Rules

- Route all output through Winston — never use `console.log` for application logging
- Remove all `console.log` statements from production code (currently ~176 in backend `src/`)
  - `OnboardingGuard` logs full `claimsPrinciple` via `console.log` (`onboarding.guard.ts:20`),
    bypassing Winston redaction — may expose `email`, `securityStamp`
- Mask sensitive values in logs (show first/last 2 characters only)
- Log structured JSON in production for machine parsing
- Set log level to `info` in production, `debug` in development only
- Never log full request/response bodies for auth-related endpoints
- Never log token values, even in debug mode
- Never log full webhook bodies — YouTube webhook logs entire payload
  (`youtube-webhook.endpoint.ts:68`), which may cause memory pressure on 512 MB container
- Winston `sensitivePatterns` must cover platform token shapes: `pina_` (Pinterest),
  `ya29.` (Google), `EAA` (Facebook), `act.` (Facebook page tokens) — currently only
  `ya29.` is covered

---

## 16. Third-Party Integrations

### 16.1 Platform inventory

| Platform | OAuth | Search | Status | Security notes |
|---|---|---|---|---|
| YouTube | Client credentials + user OAuth | `search.list` (100 units/call) | Working | Quota: ~100 searches/day. Webhook signature not verified |
| TikTok | `client_credentials` (limited) | Content search needs user token | Partial | Token works, search does not |
| Pinterest | OAuth v5 | Search via API | Broken (401) | Token expired, needs re-authorisation |
| Dribbble | Authorisation-code flow | **No search endpoint** | Not possible | API v2 removed search |
| Reddit | — | Public JSON (403 from data IPs) | Blocked | API access refused |
| Twitter/X | OAuth 2.0 | — | Not verified | Developer account needs verification |
| LinkedIn | OAuth 2.0 | — | Not verified | Portal inaccessible |
| Facebook | OAuth + Graph API | — | Not verified | App review required |
| Instagram | OAuth | — | Not verified | App review required |
| GitHub | OAuth | — | Linking only | Not searchable |
| Discord | OAuth | — | Linking only | Not searchable |
| Twitch | OAuth | — | Linking only | Not searchable |
| Behance | OAuth | Stub (empty results) | No API | Adobe has not provided public API |

### 16.2 Credential handling rules

- Credentials live in Google Cloud Secret Manager, never in the repository
- Every platform variable is declared in `src/configs.ts`
- Secrets take **no default** — fail closed when absent
- Stored OAuth tokens must be encrypted at rest with AES-256-GCM
- `.gitleaks.toml` must detect platform token patterns (`pina_`, `ya29.`, `EAA`, `act.`)
- Health endpoint (`GET /api/v1/integrations/health`) probes every platform and
  reports status with latency

### 16.3 Webhook validation

- Verify cryptographic signatures before processing any webhook payload
- Use `crypto.timingSafeEqual` for token comparison
- Validate `Content-Type` headers
- Reject payloads that fail verification with 401/403, not 200
- Log webhook verification failures for monitoring

### 16.4 Rules

- Rotate credentials when a platform integration breaks or is decommissioned
- Never store raw API responses containing user data without encryption
- Scope OAuth tokens to the narrowest API set required
- Monitor quota usage for paid APIs (YouTube is the critical one)
- Never bypass platform rate limits or quotas

---

## 17. Dependency Security

### 17.1 Current state

**Backend dead dependencies (verified by import analysis):**

| Package | Imports | Recommendation |
|---|---|---|
| `better-auth` | 0 | Adopt or remove — current half-state is worst option |
| `passport`, `passport-jwt` | 0 | Remove — auth is custom, not Passport-based |
| `xml2js` | 0 | Keep for potential YouTube PubSubHubbub revival |
| `pm2` | 0 | Remove — deployment is containerized |

**Frontend dead dependencies:**

| Package | Imports | Recommendation |
|---|---|---|
| `secure-ls` | 0 | Remove — security theatre (key ships to browser) |
| `jsonwebtoken` (+ `@types`) | 0 | Remove — client-side signing is never correct |
| `nodemailer` (+ `@types`) | 0 | Remove — Node-only, belongs to backend |
| `reflect-metadata` | 0 | Remove — NestJS/TypeORM polyfill, not React |
| `js-cookie` (+ `@types`) | 0 | Remove — superseded by local utility |
| `init` | 0 | Remove — no-op package from mistyped install |

### 17.2 Rules

- Run `npm audit` / `yarn audit` before every deployment
- Address critical and high advisories within 24 hours
- Pin dependency versions in `package.json`; commit lockfiles
- Do not use `--ignore-scripts` in CI
- Review new dependencies for maintenance status, download count, and known vulnerabilities
- Remove unused dependencies promptly — they are attack surface
- Do not have both `yarn.lock` and `package-lock.json` (frontend fixed per audit)

---

## 18. CI/CD Security

### 18.1 Current state

- **Backend:** Dockerfile-based build (Node 22 Bookworm, multi-stage). Production stage
  installs only production dependencies (`npm ci --omit=dev`).
- **Frontend:** Vercel deployment via git push.
- **Missing:** `cloudbuild.yaml` and `scripts/ci.sh` are referenced in `AGENTS.md` and
  `docs/index.md` but do **not exist** in this checkout. This is a documentation gap.

### 18.2 Rules

- Secrets must be injected at deployment time, not build time
- Never use Cloud Build substitutions for secrets (they appear in build logs)
- No secrets in build logs — use masked variables
- Deployment to production must require manual approval
- Docker images must be scanned for vulnerabilities before deployment
- Build artifacts must be immutable — no rebuilding from the same source
- The local CI gate (`scripts/ci.sh` when it exists) must mirror the real pipeline:
  typecheck, lint, tests, secret scan, build

---

## 19. Infrastructure Security

### 19.1 Constraints

| Resource | Limit | Security consequence |
|---|---|---|
| Cloud Run RAM | 512 MB | No unbounded in-process cache. Stream, never buffer. |
| Cloud Run vCPU | 0.1 | No CPU-bound operations in request path. |
| Redis memory | 30 MB | Every key gets a TTL. No unbounded cache growth. |
| Redis connections | 30 | Monitor `connected_clients`. Reuse shared client. |
| Cloudflare R2 | 10 GB | Media goes to R2, never container filesystem. |
| YouTube API | ~100 searches/day | `search.list` costs 100 of 10,000 daily units. |

### 19.2 Prevent

- **OOM:** No unbounded collections, no full-table loads, no in-memory buffering of
  large payloads. Stream uploads to R2.
- **Connection leaks:** Every database and Redis connection must be released. Monitor
  pool usage. BullMQ workers create blocking connections — account for them.
- **Unbounded cache growth:** Every Redis key must have a TTL. The LRU cache is
  capped at 100 entries.
- **Expensive queries:** No `SELECT *` on large tables. Use indexed columns. Monitor
  slow query log.
- **Memory exhaustion:** Request body size limits. Upload size limits (256 MB).
  Pagination on all list endpoints.

### 19.3 Rules

- Never buffer entire file uploads in memory — stream to R2
- Never run unbounded database queries — always paginate
- Monitor Redis memory usage against the 30 MB limit
- Monitor Redis connection count against the 30-connection limit
- Use connection pooling for database access
- Set timeouts on all external API calls
- Implement circuit breakers for third-party integrations

---

## 20. Security Checklist

Every PR must pass this checklist before merge. The `reviewer` agent enforces items
marked with ⚡.

### Code changes

- ☐ No secrets committed (env vars, keys, tokens, passwords)
- ☐ No credentials logged (route through Winston only)
- ☐ Input validated (DTO + ValidationPipe or Joi)
- ☐ Authorization checked (appropriate guard applied)
- ☐ Rate limiting applied to new public endpoints
- ☐ Error responses do not leak stack traces or internal details
- ☐ No hardcoded URLs, tokens, or credentials
- ☐ Webhook signatures verified before processing

### Configuration changes

- ☐ Environment variables use `.required()` for secrets
- ☐ No production secrets in development/test configs
- ☐ CORS origins are environment-appropriate
- ☐ `.gitignore` updated for new sensitive files
- ☐ No new dependencies without security review

### Testing

- ☐ Existing tests pass (`yarn test` / `npm test`)
- ☐ Typecheck passes (`yarn type-check`)
- ☐ Lint passes
- ☐ New code has test coverage for security-relevant paths

### Documentation

- ☐ Security-relevant changes documented
- ☐ This document updated if new secrets, endpoints, or integrations are added
- ☐ `docs/index.md` updated for new documentation

---

## 21. AI Agent Security Rules

This section is **mandatory** for every AI engineering agent operating in this codebase.

### Before starting any task

1. Read `index.md` (or `docs/index.md`) to understand the project structure
2. Read relevant documentation before modifying code
3. Load the appropriate skill via the `Skill` tool when a task matches its description

### Never

- Create duplicate authentication or authorization systems
- Expose secrets, API keys, or credentials in code, logs, or documentation
- Generate fake credentials as "examples" — use `YOUR_*_HERE` placeholders
- Place real secrets inside documentation files, even as examples
- Suggest disabling security controls ("temporarily" is not an exception)
- Bypass input validation or DTO validation
- Remove authentication guards from endpoints
- Weaken authorization requirements
- Disable rate limiting
- Expose internal architecture, database schemas, or file paths publicly
- Use `console.log` for sensitive data (route through Winston)
- Commit `.env` files, dump files, or credentials
- Hardcode JWT secrets, encryption keys, or database passwords
- Use `localStorage` for tokens (use `httpOnly` cookies)
- Skip webhook signature verification
- Default to permissive behavior when a component is unavailable

### Always

- Reuse existing services, guards, and utilities
- Preserve backward compatibility across independent deployments
- Report security risks discovered during implementation
- Follow the existing architecture (clean architecture, CQRS, vertical slices)
- Use parameterized queries — never string interpolation in SQL
- Validate and sanitize all external inputs
- Log through Winston with redaction enabled
- Run the CI gate before pushing (`scripts/ci.sh` when available)

---

## 22. Incident Response

### 22.1 If a secret is committed to git

**Immediate (within 1 hour):**

1. Do not push if caught locally — remove the secret from the file and amend
2. If already pushed: rotate the credential immediately
3. For OAuth tokens: revoke and re-authorise
4. For database passwords: rotate in Neon console
5. For API keys: regenerate in the provider console
6. For encryption keys: rotate and re-encrypt affected data

**Within 24 hours:**

1. Remove the secret from git history (`git filter-repo --invert-paths --path <file>`)
2. Force-push and coordinate re-clone for all developers
3. Add the file pattern to `.gitignore`
4. Add or update gitleaks rules to prevent recurrence
5. Audit logs for unauthorized access using the leaked credential
6. Notify all repository maintainers

**If a database dump is committed (C2 reference incident):**

1. Force password reset for all affected accounts
2. Re-enrol 2FA for all affected accounts
3. Rotate `ENCRYPTION_KEY` and `dataProtectionKeys` contents
4. Purge from history with `git filter-repo`
5. Force-push and coordinate re-clone
6. Document GDPR assessment (Art. 33 notification requirement)

### 22.2 If a credential leaks externally

1. Revoke the credential immediately
2. Generate a new credential
3. Update all systems using the old credential
4. Audit access logs for the time window between leak and rotation
5. Assess whether user data was accessed
6. If personal data was accessed: follow GDPR Art. 33 notification requirements
7. Notify affected users if required
8. Document the incident and remediation

### 22.3 If a vulnerability is discovered in production

1. Assess severity and blast radius
2. If actively exploited: take the affected endpoint offline if possible
3. Apply the fix and deploy through the normal pipeline
4. Audit logs for exploitation
5. Document the vulnerability, fix, and timeline
6. Update this document if the vulnerability reveals a systemic gap

---

## Appendix A: Audit Finding Status

Reference: `audit/2026-07_Security_And_Correctness_Audit.md`

| Finding | Severity | Status | Notes |
|---|---|---|---|
| C1 — Access tokens never expire | Critical | ⚠️ **Partially fixed** | `account.guard.ts` enforces `exp`, but audit claims conflict with source — verify |
| C2 — Production DB dump in git | Critical | ⚠️ **Deferred** | File removed from HEAD; blob in history at `e4b5f3b`; rotation pending |
| C3 — Permission substring matching | Critical | ⚠️ **Partially fixed** | Audit claims exact match; source still shows `String.includes()` |
| C4 — OAuth tokens fixed IV / CBC | High | ⚠️ **Partially fixed** | Audit claims AES-256-GCM; source still shows AES-256-CBC with static IV |
| C5 — Session revocation fails open | High | ✅ **Fixed** | DB fallback on cache miss, fails closed |
| H1 — Rate limiting covers 4 routes | High | ⚠️ **Partially fixed** | `trust proxy` added; atomic Redis counting and broader coverage still open |
| H2 — Better Auth signature discarded | High | **Open** | Architectural decision pending |
| H3 — Tokens in localStorage | High | **Open** (frontend) | Backend supports `httpOnly` cookies; frontend still uses `localStorage` |
| M1 — JWT expiry misnamed | Medium | **Open** | Variable still defaults to `'7d'` |
| M2 — Default admin credentials | Medium | **Open** | Seeder is commented out; defaults remain |
| M3 — CORS ngrok tunnel | Medium | **Partially fixed** | Audit claims split by `NODE_ENV`; source shows static list |
| M4 — No security headers | Medium | **Open** | No `helmet`, no CSP |
| M5 — No ValidationPipe | Medium | **Open** | No `class-validator` installed |
| M6 — Webhook guessable default | Medium | **Open** | Default fallback still in code (`youtube-webhook.endpoint.ts:37,72`) |
| M7 — DB TLS verification disabled | Medium | **Open** | `rejectUnauthorized: false` |
| M12 — Production logging hygiene | Medium | **Open** | 136 `console.log` in backend source |

**Note:** The audit was written against a specific commit (`821a4be`). Several findings
may have been fixed in subsequent commits not present in this checkout. The source code
takes precedence over audit claims. When in doubt, verify against the actual files.

---

## Appendix B: Documentation Conflicts

These conflicts were identified during the creation and review of this document:

| Claim | Source | Actual state |
|---|---|---|
| `.gitleaks.toml` exists with platform token rules | `docs/index.md:61`, audit §4 | **File does not exist** in this checkout |
| `searchRateLimit.guard.ts` provides atomic Redis rate limiting | Audit §3, implementation plan | **File does not exist** in this checkout |
| `cloudbuild.yaml` provides Cloud Build pipeline | `docs/index.md:59`, `AGENTS.md` | **File does not exist** in this checkout |
| `scripts/ci.sh` provides local CI gate | `docs/index.md:60`, `AGENTS.md` | **File does not exist** in this checkout |
| C4 fixed: AES-256-GCM with per-message IV | Audit §9 | `crypto.util.ts` still uses AES-256-CBC |
| C3 fixed: exact permission matching | Audit §9 | `permissions.guard.ts` still uses `String.includes()` |
| CORS split by `NODE_ENV` | Audit §9 remediation | `cors.config.ts` has a single static list |
| `trust proxy` set to 1 | Audit §9 | **Not set anywhere** in the codebase |
| M6 fixed: webhook fails closed | Audit §9 | Default fallback still in code |
| `data.source.ts` uses config for SSL | Implied by docs | Hardcodes `rejectUnauthorized: false` |

These conflicts may indicate that the audit was written against a different branch or
commit than what is checked out here. The source code is authoritative.
