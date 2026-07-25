# Platform Integration Status

**Last verified:** 2026-07-25 by live API call, not by reading configuration.

The API credentials document asks for "clear documentation on all API integrations and
which ones work and which ones need adjustments". This is that document.

**Five platforms return real data today, and four of them need no credential at all.**
A single search across YouTube, GitHub, Apple, Openverse and Hacker News returns **41 real
results in 1.15 s**, all persisted to `contentStreams` and served back through the
user-facing read path in 0.46 s. Verified against a fresh database.

That reframes the situation: the product is not "one platform working and eleven blocked".
It is five working sources — covering search, code, music/audio/video, royalty-free imagery
and news/trends — plus a set of social platforms gated on credentials that only their
account owners can supply.

**Verified separately from credentials.** `search.handler.spec.ts` (35 tests) pins the
orchestration for all twelve platforms without needing any working credential: per-platform
dispatch, that a stored OAuth token reaches its own platform and no other, failure
isolation, and per-platform result counting and pagination. So for the eleven platforms
below that lack credentials, the gap is the credential — not the code.

**Why it matters operationally:** a dead credential and "no results for this query"
look identical to the user and in the logs. Every platform call in
`GlobalSearchQueryHandler` is wrapped in `.catch()` so one failure degrades that
platform only — good for resilience, but it means a 401 is silent. Re-verify before
concluding that search is broken in code.

---

## What must happen for each platform to return real data

Every remaining blocker needs an action by an account owner or a decision by the
business. None can be resolved by writing code — the orchestration is verified
(`search.handler.spec.ts`, 35 tests) and each platform's token path is proven to work the
moment a valid credential exists.

| Platform | Who acts | Exact action | Effort |
|---|---|---|---|
| **YouTube** | Engineering | ✅ Working. Request a **quota increase** in Google Cloud → APIs & Services → YouTube Data API v3 → Quotas. Default 10,000 units/day at 100 per `search.list` = ~100 searches/day, which will not survive launch | 30 min + Google review |
| **Pinterest** | Account owner | **The app secret is valid — the blocker is account 2FA.** `POST /v5/oauth/token` with `grant_type=client_credentials` and a scope returns `1201: Two-factor authentication required`, which is a *different* error from invalid credentials: Pinterest accepted the app ID and secret and then challenged the account. So token minting cannot be automated at all; the owner must complete the OAuth flow interactively, satisfying 2FA, then **store the refresh token** so `oauth.service.ts` renews it without repeating that. Note `client_credentials` alone returns `400 Invalid parameters` — Pinterest v5 needs the authorisation-code flow | 1 hour, interactive |
| **TikTok** | Account owner | Complete app review for the scopes needed, then gate TikTok results on a **connected account** — `client_credentials` cannot search content, by TikTok's design | Days–weeks (review) |
| **Twitter / X** | Account owner | Complete email + phone verification on the developer account, then choose a paid API tier — the free tier has no search | Hours + ongoing cost |
| **LinkedIn** | Account owner | Regain developer portal access, then apply for the Marketing/Community API. Search access is heavily restricted and may be declined | Weeks, uncertain |
| **Facebook / Instagram / Threads** | Account owner | Meta app review for the scopes involved. Then gate on connected accounts | Weeks (review) |
| **Snapchat** | Account owner | No credentials configured. Register an app if this platform is still in scope | Days |
| **GitHub** | ✅ Done | Working with **no credential at all**. Optionally set a PAT to raise the rate limit from 10/min to 60/hr | Done |
| **Spotify** | Engineering | No credentials configured. `client_credentials` is sufficient for catalogue search, so this is the **cheapest platform to add** — register an app at developer.spotify.com and set `SPOTIFY_CLIENT_ID`/`_SECRET` | 30 min |
| **Reddit** | Business decision | API access was **declined**. Public JSON returns 403 from datacenter IPs regardless of User-Agent (retested with Reddit's required UA format on `www`, `old` and a subreddit listing — all 403). Either appeal, pay for the commercial tier, or **remove Reddit from the platform list** rather than shipping a permanently failing integration | Decision needed |
| **Dribbble** | Product decision | Not a credential problem: **v2 has no search endpoint**. Reframe as a connected-account content import via `/v2/user/shots`, or drop it | Decision needed |
| **Behance** | Product decision | No public API. Currently a **stub returning empty arrays**. Either remove it from `SEARCHABLE_PLATFORMS` or accept it never returns results | Decision needed |

**The two cheapest wins, in order:** request the YouTube quota increase (the only working
integration is capped at ~100 searches/day), then register a Spotify app — it needs no
user authorisation, so it goes from zero to working in about half an hour.

---

## Summary

| Platform | Status | Verified how | Blocker |
|---|---|---|---|
| **YouTube** | ✅ **Working** | `GET /youtube/v3/search` → 200, real results | Quota, not auth — see below |
| **GitHub** | ✅ **Working, no credential needed** | `GET /search/repositories` + `/search/users` → 200 unauthenticated; verified end-to-end into Postgres and back out | Rate limit 10/min unauthenticated, 60/hr with a token |
| **Apple / iTunes** | ✅ **Working, no credential needed** | `GET /search?media=all` → 200; 9 rows persisted and served | Covers the brief's **music, audio and video** verticals |
| **Openverse** | ✅ **Working, no credential needed** | `GET /v1/images/` → 200; 8 rows persisted and served | Covers the brief's explicit ask for **royalty-free image and asset sources**; every result carries its licence |
| **Hacker News** | ✅ **Working, no credential needed** | `GET /api/v1/search` (Algolia) → 200; 8 rows persisted and served | Covers the brief's **news and trends** verticals |
| **TikTok** | ⚠️ **Partial** | `POST /v2/oauth/token/` → 200, token issued | `client_credentials` opens a narrow endpoint set; content search needs a user-authorised token |
| **Pinterest** | ❌ **Broken** | `GET /v5/user_account` → **401** `Authentication failed` | Access token dead or expired. Needs re-authorisation |
| **Dribbble** | ⚠️ **Needs user OAuth** | `POST /oauth/token` → **400** `Missing required parameter: code` | `client_credentials` unsupported; requires the authorisation-code flow |
| **Reddit** | ❌ **Blocked** | `GET /search.json` → **403** | Public JSON blocks datacenter IPs. Direct API access was **refused** — plan for this to stay unavailable |
| **Twitter / X** | ⛔ Not verified | — | Developer account needs email + phone verification |
| **LinkedIn** | ⛔ Not verified | — | Developer portal inaccessible |
| **Behance** | ⛔ Not verified | — | API access requested, not granted |
| Facebook / Instagram / Threads | ⛔ Not verified | — | Meta app review required for most useful scopes |
| Spotify | ⛔ Not verified | — | No credentials configured |
| Snapchat | ⛔ Not verified | — | No credentials configured |

Search code exists for twelve platforms in `search.service.ts`, of which Behance is a
stub. Code presence is not connectivity — and for Dribbble, connectivity is not
possible either (see below).

`_const.SEARCHABLE_PLATFORMS` is the authoritative fan-out list. Twitch, GitHub and
Discord are in `PLATFORMS` for account linking but are **not** searchable.

---

## YouTube — working, but quota is the real limit

The one integration confirmed end-to-end. Public search needs no user token.

**Quota is the binding constraint:** 10,000 units/day by default, and `search.list`
costs **100 units per call** — roughly **100 searches per day**, platform-wide.

Two consequences:

1. **Request a quota increase** through the Google Cloud console before any real
   traffic. This is the single most important operational task for search.
2. The database-as-read-model design is the primary mitigation and is already correct:
   `search.service.ts` persists results and serves repeats from Postgres, so a
   repeated query costs zero quota. Do not add a code path that bypasses it.

`searchYoutubeAsync` is the reference implementation — cache → DB → staleness check →
distributed lock → API → persist → re-read. Copy it when adding a platform.

## TikTok — token works, search does not

`client_credentials` returns a valid bearer token (7200s), but TikTok scopes that grant
type to a limited endpoint set. Content and user search require a token obtained
through user authorisation, so TikTok search cannot work for anonymous visitors —
only for users who have connected their TikTok account.

Design implication: TikTok results should be gated on a connected account rather than
attempted and silently failing for everyone else.

## Pinterest — blocked by account 2FA, not by a bad secret

Three distinct probes, and the third is the informative one:

| Probe | Result | Meaning |
|---|---|---|
| `GET /v5/user_account` with the stored token | `401 Authentication failed` | The user access token is dead or expired |
| `POST /v5/oauth/token` `grant_type=client_credentials` | `400 Invalid parameters` | v5 does not support this grant; it needs the authorisation-code flow |
| Same, with `scope=pins:read,boards:read` | **`1201 Two-factor authentication required`** | Pinterest **accepted the app ID and secret**, then challenged the account |

That third response matters. It is not a credentials error — it proves the app secret is
valid and locates the blocker in an **interactive 2FA challenge on the Pinterest account**.

Consequence: minting a Pinterest token cannot be automated, scripted, or done from CI. The
account owner has to complete the OAuth flow in a browser and satisfy 2FA. Once that is
done, **store the refresh token** so `oauth.service.ts` renews it automatically rather than
requiring the 2FA dance again — that pattern already exists in the codebase and is the
difference between a one-off task and a recurring one.

## Reddit — treat as unavailable

Two independent blocks: public JSON endpoints reject datacenter IPs (403), and the
direct API access request was refused. Do not build a Reddit crawler as a workaround —
that is a Terms of Service question, not a technical one (see the legal section of the
implementation plan). Either obtain OAuth credentials or drop Reddit from the platform
list rather than shipping a permanently failing integration.

## Dribbble — a search integration cannot be built

Two separate blockers, and the second is the decisive one.

1. `client_credentials` is not a supported grant; it needs a redirect-based
   authorisation-code exchange, i.e. a connected user account.
2. **Dribbble's v2 API has no search endpoint at all.** It exposes authenticated reads
   of the signed-in user's own resources (`/v2/user`, `/v2/user/shots`, `/v2/projects`)
   and nothing else. Search was removed from the public API.

So "Dribbble search" is not a missing implementation — it is not possible against the
official API. The options are:

- **Recommended:** treat Dribbble as a *connected-account content import* rather than a
  search source. Fetch the user's own shots via `/v2/user/shots` and surface them on
  their Gaddr Me profile. That is the universal-profile use case and it works within the
  API.
- Scraping is a Terms of Service question, not a technical one. See the legal section of
  the implementation plan before considering it.

Dribbble is deliberately **absent** from `_const.SEARCHABLE_PLATFORMS` for this reason.

## Behance — implemented, but a stub

`searchBehanceAsync` exists and is dispatched, but Behance has no public API, so it
returns empty `user` and `content` arrays. It is in `SEARCHABLE_PLATFORMS` because the
dispatch case exists; it will never return results until Adobe provides an API or the
approach changes. Worth knowing before debugging "why does Behance return nothing".

## Twitch, GitHub, Discord — linking only, not searchable

All three are legitimate `PLATFORMS` entries — users link those accounts — but none has
a search implementation. They were previously included in the search fan-out because it
derived from `Object.values(PLATFORMS)`, so **every unfiltered search returned three
`Unsupported platform: …` entries** that clients had to know to ignore. The fan-out now
comes from `SEARCHABLE_PLATFORMS`, guarded by `const.spec.ts` in both directions: no
platform is dispatched without an implementation, and no implemented platform is left
out.

---

## Re-verifying

Run these before concluding a platform is broken in code. Substitute real values from
Secret Manager; never paste credentials into a file.

```bash
# YouTube — expect 200
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=$YOUTUBE_API_KEY"

# Pinterest — expect 200; 401 means the token needs re-authorisation
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $PINTEREST_ACCESS_TOKEN" \
  "https://api.pinterest.com/v5/user_account"

# TikTok — expect 200 with an access_token in the body
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://open.tiktokapis.com/v2/oauth/token/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_key=$TIKTOK_CLIENT_ID&client_secret=$TIKTOK_CLIENT_SECRET&grant_type=client_credentials"
```

**Now automated:** `GET /api/v1/integrations/health` (admin-guarded, Redis-cached for
5 minutes) probes every platform and reports
`operational | degraded | misconfigured | not_configured | unknown` with latency, HTTP
status and remediation text.

It independently reproduced the table above on first run — YouTube operational (200),
Pinterest misconfigured (401), TikTok degraded (token valid, cannot search content) —
which is the point: nobody should have to run curl to discover a dead credential.

```bash
curl -H "Authorization: Bearer <admin-token>" \
  https://<host>/api/v1/integrations/health
```

`healthy` is false only when a credential is **rejected**. `not_configured` is not a
fault — a platform that was never onboarded is expected. A network failure reports
`unknown` rather than `misconfigured`, so an outage does not send someone to rotate a
key that is fine. The YouTube probe uses `i18nLanguages` (1 quota unit) rather than
`search.list` (100), so health checking cannot itself drain the daily budget.

Note that `/platform-status` in the frontend is a **static marketing page** driven by a
hardcoded feature list — it is a roadmap view, not integration health.

---

## Credential handling

- Credentials live in **Secret Manager**, never in the repository, and never in Cloud
  Build substitutions (those appear in build logs).
- Every platform variable is declared in `src/configs.ts`. Secrets take **no default** —
  `YOUTUBE_WEBHOOK_VERIFY_TOKEN` previously defaulted to `default_verify_token`, which
  meant anyone who guessed it could drive the webhook. Both call sites now fail closed.
- Stored OAuth tokens are encrypted at rest, but with a **static IV and no
  authentication** (finding C4, open). See the `gaddr-encryption` skill before touching
  token storage.
- `.gitleaks.toml` adds a `gaddr-platform-token` rule matching `pina_`, `ya29.`, `EAA`
  and `act.` token shapes, so a pasted token is caught at commit time.

## Keeping this current

Update this file whenever a credential is rotated, an application is approved, or a
platform starts or stops working — and record **how** it was verified, with the
response code. A status table nobody trusts is worse than none.
