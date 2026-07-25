# Gaddr Search & Me — Implementation Plan

**Written:** 2026-07-25 · **Applies to:** both repos at `main`

Where the platform is, what to build next, and in what order. Sequencing is by
dependency and risk-reduction, not by ambition — several later items are unsafe or
wasteful until earlier ones land.

Companion documents: [`../audit/2026-07_Security_And_Correctness_Audit.md`](../audit/2026-07_Security_And_Correctness_Audit.md)
(verified findings) · [`../integrations/STATUS.md`](../integrations/STATUS.md)
(which platform credentials actually work) ·
[`../integrations/END_TO_END_VERIFICATION.md`](../integrations/END_TO_END_VERIFICATION.md)
(a real run of the search chain) · [`../index.md`](../index.md).

---

## 1. Where things actually stand

| Area | State |
|---|---|
| Backend | NestJS 11, clean architecture + CQRS, 201 endpoints, builds clean, typechecks at 0 errors |
| Frontend | Next.js 16, React 19, Tailwind v4, TanStack Query v5, builds clean, typecheck 130 → 0 |
| Tests | **119** backend (7 suites) + **41** frontend (Vitest) = **160**, from zero |
| CI/CD | Cloud Build pipeline + local gate in both repos (no GitHub Actions, per cost constraint) |
| Search | 12-platform fan-out, DB-persisted, cached, distributed-locked. **Verified end-to-end against the live YouTube API** — see [`../integrations/END_TO_END_VERIFICATION.md`](../integrations/END_TO_END_VERIFICATION.md). Four defects found and fixed, including aggregated results being saved but never shown to users |
| Migrations | **A fresh database now builds** — 42 tables, 52 migrations. Six tables previously had no create-migration, so no environment could be provisioned from source |
| Platform credentials | YouTube ✅ · TikTok ⚠️ partial · Pinterest ❌ · Reddit ❌ · Dribbble ⚠️ · see STATUS.md |
| i18n | next-intl live; `sv` + `en` catalogs; 28 locales registered; RTL working |
| Light/dark | Working, with a pre-paint script and a settings control |
| SEO | robots.txt, sitemap.xml, rich root metadata, per-profile metadata + JSON-LD |
| Security | 5 critical/high findings fixed; **4 still open** (see §2) |
| Payments | Nothing built |
| Identity (BankID) | Nothing built |
| Rust | Nothing built |

---

## 2. Phase 0 — Close what is open (do this first)

These block everything downstream. Payments and identity in particular assume
sessions can be trusted and revoked.

| # | Item | Why it blocks | Owner |
|---|---|---|---|
| 0.1 | **Rotate credentials for the 14 exposed accounts** — password reset, 2FA re-enrolment, rotate `ENCRYPTION_KEY` and `dataProtectionKeys` | A committed DB dump exposed bcrypt hashes **and TOTP secrets** to everyone with repo access. 2FA provides no protection for those accounts until re-enrolled | **Requires production access — not doable from code** |
| 0.2 | **Purge the dump from git history** (`git filter-repo`), coordinated force-push, everyone re-clones | The blob remains at `e4b5f3b`. `.gitignore` and the new gitleaks rule stop recurrence, not the existing object | Needs team coordination |
| 0.3 | **GDPR assessment** of 0.1 — is it notifiable under Art. 33? | Depends on who accessed it; a documented decision either way is required | Data protection owner |
| 0.4 | **C5 — session revocation fails open** on Redis cache miss. Add DB fallback, then fail closed | Password changes do not reliably end sessions. Do **not** fail closed without the fallback or every cold-cache user is logged out | Engineering |
| 0.5 | **C4 — AES-256-GCM migration** with per-message IVs and dual-read | OAuth tokens are encrypted with a static IV, unauthenticated. See the `gaddr-encryption` skill for the exact migration | Engineering |
| 0.6 | ~~Rate limit search endpoints~~ ✅ **Done** — `searchRateLimit.guard.ts`, atomic Redis `INCR`, two buckets, identity-aware, bounded per-instance fallback when Redis is down. 13 tests including a concurrency proof | Landed |
| 0.7 | **`ValidationPipe` + `class-validator`**, DTOs per slice starting with auth and search | No declarative validation exists across 201 endpoints. Enable the pipe *after* DTOs exist, or live traffic is rejected | Engineering |

**Exit criteria:** credentials rotated, no open critical findings, search rate-limited,
auth slice validated.

---

## 3. Phase 1 — Make the search product real

Search is the core product. The chain is now verified working end-to-end against the
live YouTube API — API → Postgres → user-facing endpoint — after four defects were
found and fixed by actually running it. What it lacks now is working credentials for
the other eleven platforms, quota headroom, an index that survives scale, and
observability.

### 3.1 Credentials (highest leverage)

Verified state is in [`../integrations/STATUS.md`](../integrations/STATUS.md). Only
YouTube works fully today, and it allows **~100 searches/day** (`search.list` costs
100 of 10,000 daily units).

1. Re-authorise Pinterest (token returns 401).
2. Complete Dribbble's authorisation-code flow — `client_credentials` is unsupported.
3. Move TikTok to user-authorised tokens; `client_credentials` opens too narrow a set.
4. Apply for Reddit OAuth (public JSON returns 403 from datacenter IPs; direct API
   access was refused — plan for it to stay unavailable).
5. Complete Twitter/X developer verification (email + phone).
6. Resolve LinkedIn portal access.

**Quota is the real constraint, not code.** Request a YouTube quota increase, and treat
the DB-as-read-model design as the primary mitigation: it already means a repeated
search costs nothing.

### 3.2 Integration health endpoint — ✅ done

`GET /api/v1/integrations/health` (admin-guarded, Redis-cached 5 min) probes every
platform and reports `operational | degraded | misconfigured | not_configured |
unknown` with latency, HTTP status and remediation.

Verified: it reproduced the manual audit on first run — YouTube operational, Pinterest
misconfigured (401), TikTok degraded. `healthy` is false only on a *rejected*
credential; a network failure reports `unknown` so an outage does not send someone to
rotate a working key. The YouTube probe costs 1 quota unit, not 100.

Note `/platform-status` on the frontend remains a **static marketing page**, not
health. Wiring it to this endpoint is a small follow-up.

### 3.3 Search scale — ✅ largely done

`1784000000010-IndexContentStreamsForSearch` addressed the query path now that
aggregated content is actually served:

- `searchText` column (title + the platform's body text) with a **pg_trgm GIN index**,
  replacing a `json_each_text` scan that expanded every row's JSON on every search.
  Verified index-assisted via `EXPLAIN` (`Bitmap Index Scan`).
- btree indexes on `(platform, lastRefreshed DESC)` and `(type, subType)`.
- **UNIQUE `(platform, externalId)`**, so dedup is a database invariant rather than an
  application-level read-then-write that two concurrent searches can both pass.
  `createAsync` gained `ON CONFLICT DO NOTHING` to handle the race gracefully.

**Still open:** the aggregated section shares the caller's `limit` rather than being
paged independently, and relevance is not ranked across platforms — see §3.4.

### 3.4 Search quality

- **Fix non-Latin normalisation.** `fuse.util.ts` sanitises with ASCII-only `\w`, so
  CJK and Arabic queries reduce to empty and cannot be normalised or cached. This
  **blocks the Asian and Arabic markets**. Use `\p{L}\p{N}` with the `u` flag.
  Asserted in `fuse.util.spec.ts`.
- **Tune over-eager fuzzy matching.** `term-499` currently collapses onto `term-4`,
  so a user can be served results for a different query. Require a length ratio, or
  a stricter threshold for queries containing digits.
- Add relevance ranking across platforms. Results are currently grouped per platform
  with no cross-platform scoring — the "All" tab has no true ordering.

### 3.5 Test coverage

Vitest is installed with 41 tests (locale registry, colour-scheme provider) and the
backend has 119 across 7 suites. Both gates are green.

What is still uncovered, highest value first:

1. **Playwright end-to-end** — login, search, profile. No end-to-end coverage exists.
2. `httpContext.middleware.ts` — the dual auth paths, and that Better Auth sessions
   get the right `UserType` (currently hardcoded to `User`, so an admin authenticating
   that way is silently downgraded).
3. `refresh-token.handler.ts` — the flow whose dependence on expired tokens shaped the
   C1 fix.
4. `search.service.ts` staleness and lock logic — `shouldFetchFromAPI` decides when to
   spend paid quota.
5. Repository query correctness against a real Postgres via Testcontainers.
6. Frontend components beyond the two areas covered.

---

## 4. Phase 2 — Reach and discoverability

### 4.1 Locale-prefixed URLs (SEO-critical)

Locale currently resolves from a cookie, so **every language shares one URL**. Search
engines cannot index per-language variants and `hreflang` has nothing to point at.
Deferred because it means moving all 30 App Router routes at once.

1. `src/app/[locale]/` wrapping the existing tree.
2. `next-intl/middleware` merged with `proxy.ts` auth logic — one middleware, ordered
   locale-then-auth.
3. `generateStaticParams` over `AVAILABLE_LOCALES`.
4. `alternates.languages` for `hreflang`, plus `x-default`.
5. Per-locale sitemap entries.

**Do this before marketing any locale beyond sv/en.**

### 4.2 Static/ISR public profiles

Every route is currently dynamic (`ƒ`) — nothing static or ISR. Profiles are the
highest-value indexable surface and the most-shared artifact. Per-profile metadata and
JSON-LD now exist; rendering does not.

Blocked on a backend endpoint: paginated, indexable-profiles-only
(`{ userName, lastModifiedOn }`), filtered by privacy and completeness server-side.
Then `generateStaticParams` + `revalidate`, and profiles enter the sitemap. See the
note at the bottom of `frontend/src/app/sitemap.ts`.

### 4.3 Translations

28 locales are registered; 2 have catalogs. Adding one is mechanical (see the
`gaddr-i18n` skill) but needs a native speaker — machine-translated product copy reads
worse than English. Priority: `nb`, `da`, `fi` (Nordics), then `nl`/`fr` (Belgium),
then `ar` (Dubai), then `ja`/`zh-Hans`/`ko` (Asia).

**RTL blocker:** ~650 physical CSS utilities (`ml-*`, `left-*`, `text-left`) break
Arabic layout. Migrate to logical properties before launching `ar`.

### 4.4 Design token migration

~650 hardcoded colour utilities (`bg-white`, `text-gray-*`) are invisible in dark
mode. Dark mode works, but only for the ~215 token-based usages. Migrate
per-component as files are touched; the tokens already exist.

---

## 5. Phase 3 — Commerce

Full detail in the `gaddr-payments` skill. **Do not start before Phase 0.**

| Step | Scope |
|---|---|
| 3.1 | Ledger first — append-only double-entry in Gaddr's own database. Never treat Stripe as the ledger |
| 3.2 | Stripe Billing for platform subscriptions (simplest, lowest risk) |
| 3.3 | Stripe Connect Express for the marketplace — selling posts, services, sponsored content. Destination charges with `application_fee_amount`, so Stripe is the regulated party. Do **not** build charge-then-transfer from one account; that is money transmission |
| 3.4 | SCA/PSD2 via PaymentIntents with `requires_action` handling — mandatory for EEA cards. Stripe Tax for VAT at the customer's location |
| 3.5 | Payout holds for a dispute window; seller-fraud controls (paid content never delivered) |
| 3.6 | Gaddr Pay and on-chain (ETH, Gaddr Chains, NFT-gated content) behind the same `PaymentProvider` interface but a **separate implementation** — irreversible, non-custodial settlement must never share a code path with reversible fiat |

Non-negotiables: integer minor units, never floats. Webhook is the source of truth,
not the redirect. Idempotency keys on every mutating call, and persisted `event.id`
de-duplication. Never handle raw card data — Stripe Elements only, to stay at SAQ A.

---

## 6. Phase 4 — Identity and trust

Full detail in the `gaddr-fraud-identity` skill.

- **Separate the two meanings of "verified".** `LinkedAccount.verified` means "controls
  this handle" (OAuth). BankID means "is this legal person". One boolean for both is a
  trust bug that misleads buyers and investors.
- **Mobile BankID via a broker** (Criipto, Signicat, ZignSec, Svensk e-identitet), not
  the raw API — that needs an RP certificate through a Swedish bank. Personnummer is
  sensitive personal data: store a salted hash, plus `YYYYMMDD` only if age is needed.
- **KYC tiers driven by action, not signup:** none → identity → seller (BankID +
  Stripe Connect) → investor (needs legal review; may be a regulated activity).
- **Turnstile is wired but applied to exactly one endpoint.** Extend it to registration
  and public write paths — cheap, immediate.
- **Fraud signals before fraud scoring.** `userLogins` and `analyticsEvents` exist;
  extend them. `ipUtil.hasIpChanged` is already called in `refresh-token.handler.ts`
  where the notification is still a `TODO` — a cheap, high-value win.

---

## 7. Phase 5 — Platform and performance

### 7.1 Rust, where it genuinely pays

Not a rewrite. The defensible candidates are CPU-bound and isolatable, and can run as
separate services behind the existing API without touching NestJS:

1. **Crawler / aggregation fan-out** — I/O-concurrent, CPU-bound on parsing. The
   clearest win, and naturally separable.
2. **Media processing** — thumbnailing, transcoding. Currently `canvas` + ffmpeg.
   Bounded, measurable, no business logic.
3. **Ranking / scoring** once cross-platform relevance exists.

Do **not** port: business logic in `features/`, anything CRUD-shaped, anything
touching TypeORM. The gain is not there and the cost is a second data-access layer.

Sequence: measure first (which endpoints are actually CPU-bound under load?), extract
one service, expose it over HTTP or gRPC, run both paths in shadow mode, compare, then
cut over. Axum + Tokio; share nothing but the contract.

### 7.2 TanStack

`@tanstack/react-query` v5 is already the data layer, so the brief is partly met.
TanStack Router/Start is a larger move: the app depends on Next-specific features
(`proxy.ts` edge middleware, `next/image`, App Router conventions, `next-intl`'s Next
integration, Vercel deployment).

Recommendation: **do not migrate now.** Revisit after Phase 2, and write a decision
record first. The genuine prerequisite work is the same either way — keep components
framework-agnostic, keep data fetching in hooks rather than in route files, and keep
Next-specific code confined to `src/app/`.

### 7.3 Dependency cleanup

Unreferenced today: backend `better-auth` (0 imports, yet its session logic is
hand-rolled), `passport`, `passport-jwt`, `xml2js`, `pm2`, plus an orphaned
`prisma.config.ts` pointing at a schema that does not exist. Frontend `secure-ls`,
`jsonwebtoken`, `nodemailer`, `reflect-metadata`, `js-cookie`, `init`.

Also four duplicated frontend stacks (two form libraries, two validators, two crop
libraries, two UI primitive sets). Consolidating is the cheapest available
performance win. Full inventory with revival notes in the audit, §5.

**`better-auth` needs a decision, not a cleanup:** adopt it properly (it gives verified
cookies, hashed tokens and OAuth account linking for free, replacing hand-rolled raw
SQL) or remove it and `BETTER_AUTH_SECRET`. The current half-state is the worst option.

---

## 8. Legal and compliance — needs professional review

Flagged, not answered. These are business and legal decisions, and getting them wrong
is expensive.

| Area | The actual question |
|---|---|
| **Platform ToS for scraping** | The PRD assumes "sanctioned scraping where APIs are unavailable". Most major platforms prohibit scraping in their ToS regardless of technical feasibility. Reddit already refused API access. This needs a per-platform legal read before building crawlers — it is a product-viability question, not an implementation detail |
| **GDPR lawful basis** | Aggregating third-party profile data about people who never signed up to Gaddr requires a documented basis. Legitimate interest needs a balancing test on file |
| **Right to erasure across aggregated data** | If Gaddr caches a third party's posts, a deletion request must reach that cache. `/data-deletion` exists — verify it covers `searchHistories`, `contentStreams` and analytics, not just the profile |
| **Data retention** | No retention policy exists. `searchHistories` is behavioural data about real people. Indefinite logs are a liability, as the committed dump showed |
| **DSA** | An EU platform hosting user content has notice-and-action obligations above certain thresholds |
| **AI Act** | AI-driven ranking and an "AI representative agent" may carry transparency obligations |
| **Payments / e-money** | Marketplace payouts risk crossing into money transmission. Stripe Connect keeps Stripe as the regulated party — deviating from that pattern needs advice |
| **Investment features** | Facilitating investment in people or startups is regulated in most jurisdictions. Do not build before advice |
| **NFT / token** | Securities classification depends on structure and jurisdiction. MiCA applies in the EU |
| **Expansion** | Dubai (DIFC data law), US (state privacy laws, CCPA), Belgium, Algeria (Arabic/French) each add requirements. Data residency will come up |

---

## 9. Suggested sequence

```
Phase 0  Close open findings + rotate credentials      ← blocks everything
Phase 1  Search credentials, health, quality, FE tests ← the core product
Phase 2  Locale URLs, ISR profiles, translations, tokens
Phase 3  Payments (ledger → subscriptions → Connect)
Phase 4  BankID, KYC tiers, fraud signals
Phase 5  Rust extraction, dependency cleanup, TanStack decision
```

Legal review runs **in parallel from now**, not at the end — several answers change
what gets built.

---

## 10. How to keep this document honest

- Update it when a phase completes; do not create `IMPLEMENTATION_PLAN_v2.md`. The
  `_v2` proliferation in `docs/` is the pattern to avoid — git history is the version
  record.
- When a claim here stops matching the code, fix the document in the same change.
- Anything asserting current state should be verifiable by a command. Where it is not,
  say so.
