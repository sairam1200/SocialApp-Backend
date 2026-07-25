# Platform Integration Status

**Last verified:** 2026-07-25 by live API call, not by reading configuration.

The API credentials document asks for "clear documentation on all API integrations and
which ones work and which ones need adjustments". This is that document.

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

Search code exists for all twelve platforms in `search.service.ts`. Code presence is
not connectivity.

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

## Dribbble — authorisation-code flow required

Client ID and secret are valid but `client_credentials` is not a supported grant.
Requires a redirect-based flow with a `code` exchange, i.e. a connected user account.
Note Dribbble appears in the credentials document but has **no search implementation**
in `search.service.ts` — Behance is implemented, Dribbble is not.

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

**Planned:** replace this manual process with `GET /api/v1/integrations/health`
(admin-guarded, Redis-cached) reporting
`operational | degraded | misconfigured | not_configured` per platform. See §3.2 of the
implementation plan.

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
