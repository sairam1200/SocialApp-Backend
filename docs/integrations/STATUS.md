# Platform Integration Status

**Last verified:** 2026-07-25 by live API call, not by reading configuration.

The API credentials document asks for "clear documentation on all API integrations and
which ones work and which ones need adjustments". This is that document.

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

## Summary

| Platform | Status | Verified how | Blocker |
|---|---|---|---|
| **YouTube** | ✅ **Working** | `GET /youtube/v3/search` → 200, real results | Quota, not auth — see below |
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

## Pinterest — re-authorisation needed

The configured access token returns 401. Pinterest v5 access tokens expire; the app ID
and secret are still valid, so this needs the OAuth flow re-run to mint a fresh token
plus refresh token. Store the **refresh** token and renew automatically —
`oauth.service.ts` already has that pattern.

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
