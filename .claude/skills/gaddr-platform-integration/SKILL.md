---
name: gaddr-platform-integration
description: Add or repair a social platform integration (YouTube, TikTok, Pinterest, Instagram, Reddit, Spotify, LinkedIn, Behance, Dribbble and similar) in the Gaddr backend, including OAuth connect, content import, search, webhooks, and exposing capabilities over API or MCP. Use when wiring a new platform, debugging why a platform returns no results, or checking which credentials actually work.
---

# Gaddr platform integration

## Credential reality, verified 2026-07-25

Test before building. Half the configured credentials do not work, and a platform
that silently returns nothing looks identical to a code bug.

| Platform | State | Note |
|---|---|---|
| **YouTube** | ✅ Works | API key valid; public search needs no user token. Quota: 10,000 units/day, and `search.list` costs **100 units** — roughly 100 searches/day. |
| **TikTok** | ✅ Token issues | `client_credentials` returns a token, but it only opens a narrow endpoint set. Content search needs a **user-authorised** token. |
| **Pinterest** | ❌ 401 | Access token dead/expired. Needs re-authorisation. |
| **Dribbble** | ⚠️ Needs user OAuth | `client_credentials` is unsupported; requires the authorisation-code flow. |
| **Reddit** | ❌ 403 | Public JSON endpoints block datacenter IPs. Needs OAuth, and direct API access was refused. |
| Twitter/X | Not verified | Requires email + phone verification on the developer account. |
| LinkedIn | Blocked | Developer portal inaccessible. |

Re-verify with a single curl before assuming a platform is broken in code:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=$YOUTUBE_API_KEY"
```

## How search is wired

`GlobalSearchQueryHandler` (`features/search/search.handler.ts`) fans out to all
platforms in parallel, each wrapped in `.catch()` so one failure degrades that
platform only. Then per platform, in `infrastructure/services/search.service.ts`:

```
cache hit? -> return
    ↓
read DB results
    ↓
shouldFetchFromAPI(staleness, page, forceRefresh)?
    ↓ yes
acquire distributed lock   (thundering-herd protection)
    ↓
call platform API -> persist to DB via generalRepository.createAsync
    ↓
re-read DB, build response, cache it
```

This is the pattern to preserve: **the database is the read model, the API is the
refresh mechanism.** Results are persisted so subsequent searches are served
locally rather than burning quota.

## Adding a platform

1. **Config** — add `<PLATFORM>_CLIENT_ID`, `_CLIENT_SECRET`, `_CALLBACK_URL` to
   `src/configs.ts` and the exported config object. Secrets get no default.
2. **Constant** — add to `_const.PLATFORMS` in `core/utils/const.ts`. `allPlatforms`
   in the search handler derives from it, so search picks it up automatically.
3. **Contracts** — response model in `domain/contracts/`.
4. **Search method** — `search<Platform>Async` on `ISearchService`, following the
   cache → DB → lock → fetch → persist shape above. Copy
   `searchYoutubeAsync` as the reference; it is the most complete.
5. **Dispatch** — add a `case` to `searchPlatformOptimized`, plus
   `extractPaginationToken` and `countResults`. Missing the latter two means
   results appear but `totalResults` stays 0 and pagination silently stops.
6. **OAuth** — connect handler in `features/integrations/<platform>/connect/`.
   Encrypt stored tokens (see the `gaddr-encryption` skill — do not add a new
   caller of bare `encrypt`).
7. **Frontend** — add the CDN hostname to `remotePatterns` in `next.config.ts`, or
   `next/image` refuses to render the platform's media.

## Rules

- **Never let one platform fail the whole search.** Every platform call stays inside
  its own `catch`, returning `{ platform, error, result: null }`.
- **Always persist to the database.** A search that only proxies burns quota on
  every repeat.
- **Always set a cache TTL.** Redis is capped at 30 MB.
- **Respect quota.** YouTube gives ~100 searches/day. Search endpoints are currently
  **unauthenticated and unrate-limited** — an open door to a metered API. Add a
  limiter before promoting any new platform.
- **Degrade honestly.** When a platform is misconfigured, surface that in the
  response rather than an empty result set that looks like "no matches".
- **Handle token refresh.** Access tokens expire; `oauth.service.ts` has the refresh
  pattern.

## Exposing over MCP

The same `ISearchService` should back both the REST API and any MCP server, so
agents and humans hit identical logic. Expose search as MCP *tools* (one per
platform plus a global search) and profiles as *resources*. Keep the MCP layer a
thin adapter over the CQRS handlers — never a second implementation. Rate limits and
auth must apply equally; an MCP client is just another caller.

## Verify

```bash
npx jest src/core/utils/fuse.util.spec.ts src/core/utils/limitAllocator.util.spec.ts
```

Covers query normalisation (the cache key) and result-limit allocation.

Note a real trap already hit here: `fuse.js` v7 uses `export =`, so it must be
imported as `import Fuse = require('fuse.js')`. A default import compiles to
`fuse_js_1.default`, which is `undefined` at runtime under this tsconfig — that
bug produced 500s on every search once search history existed.
