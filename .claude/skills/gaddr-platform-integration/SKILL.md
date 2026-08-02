---
name: gaddr-platform-integration
description: Add or repair a social platform integration (YouTube, TikTok, Pinterest, Instagram, Reddit, Spotify, LinkedIn, Behance, Dribbble and similar) in the Gaddr backend, including OAuth connect, content import, search, webhooks, and exposing capabilities over API or MCP. Use when wiring a new platform, debugging why a platform returns no results, or checking which credentials actually work.
when_to_use: Trigger phrases include "add a platform", "connect YouTube", "search returns nothing", "no results from TikTok", "why is this platform empty", "the thumbnail is missing", "the link 404s", "OAuth callback", "import content", "contentStreams", "aggregated results", "API quota", "rate limited by the platform", "expose this over MCP", and any edit under src/features/integrations/ or to search.service.ts or database-search.handler.ts.
---

# Gaddr platform integration

## Credential reality, verified 2026-07-25

**Test before assuming.** This table exists because two platforms were sitting in the
"blocked" bucket while actually needing no credential at all — GitHub was labelled
"link-only, not searchable" without ever being tried. Never inherit a status; re-probe it.

### Working today — five platforms, four needing no credential

| Platform | Credential | Covers |
|---|---|---|
| **YouTube** | API key | Video. Quota is the real limit: 10,000 units/day and `search.list` costs **100**, so ~100 searches/day |
| **GitHub** | **none** | Code, developers. 10 req/min unauthenticated, 60/hr with a PAT |
| **Apple / iTunes** | **none** | Music, podcasts, audiobooks, video |
| **Openverse** | **none** | Openly-licensed imagery — the brief's royalty-free asset ask |
| **Hacker News** | **none** | News, trending technical discussion |

Verified end-to-end: one search across all five returns **41 real results in 1.15 s**,
persisted to `contentStreams` and served back through the read path in 0.46 s.

### Credential-gated — the blocker is not code

| Platform | State | Blocker |
|---|---|---|
| **TikTok** | ⚠️ Token issues | `client_credentials` works but cannot search content — needs a **user-authorised** token, by TikTok's design |
| **Pinterest** | ❌ Blocked | `1201: Two-factor authentication required`. The app secret is **valid**; Pinterest challenges the *account*. Token minting cannot be scripted — the owner must complete OAuth in a browser |
| **Reddit** | ❌ Blocked | 403 from datacenter IPs on `www`, `old.reddit` and subreddit listings, retested with Reddit's required UA format. API access was **declined**, and commercial use is now **$0.24 per 1,000 calls** — so even if approved it is metered |
| Twitter/X | ⛔ | **Free tier for new developers ended February 2026.** Pay-per-use only: ~$5 per 1,000 reads with 7-day search; full-archive is enterprise ($42k+/mo). Costs money before it returns a single result. |
| LinkedIn | ⛔ | Developer portal inaccessible |
| Meta (FB/IG/Threads) | ⛔ | App review required for useful scopes |
| Spotify | ⛔ not configured | **Cheapest remaining win** — `client_credentials` suffices for catalogue search, so ~30 minutes end to end |

### The 2026 direction of travel

Researched July 2026, and it matters for planning: the era of open social APIs is over.
X removed its free tier, Reddit meters per call, Meta requires weeks of app review, TikTok
gates content search behind user tokens *by design*, and Pinterest challenges the account
with 2FA during OAuth.

**So the four credential-free sources are the strategic asset, not the filler.** GitHub,
Apple/iTunes, Openverse and Hacker News cannot be revoked, repriced, or lost when the person
holding a developer account leaves. Every keyed platform is a liability with an owner and a
renewal risk. Build depth on the ones that cannot be taken away, and treat each gated
platform as a bonus that may disappear.

Verified-working but not yet integrated (probed July 2026 — **Deezer is the best remaining
win**: real music platform, no auth, 0.4 s):

| API | Probe result | Covers |
|---|---|---|
| **Deezer** | 200, `total: 120`, 0.4 s | Music |
| Open Library | 200, `numFound: 12857` | Books, authors |
| Wikipedia | 200 | Entities, people — relevant to Gaddr Me |
| Wikimedia Commons | 200 | Licensed media, complements Openverse |
| MusicBrainz | 200, 3.7 s, 1 req/s | Music metadata — Deezer is better for the same vertical |
| Internet Archive | 200 | Archived media and texts |

Full resilience guidance for these calls lives in skill `gaddr-api-resilience`.

### Not credential problems — these will never be search integrations

- **Dribbble** — v2 API has **no search endpoint**. Only authenticated reads of the
  signed-in user's own shots. Reframe as a connected-account import or drop it.
- **Behance** — no public API. `searchBehanceAsync` is a **stub returning empty arrays**.
  Worth knowing before debugging "why does Behance return nothing".

Re-verify with a single curl before assuming a platform is broken in code:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=$YOUTUBE_API_KEY"
```

## How search is wired — both halves

**This is the thing most likely to be missed.** Search has two halves, and they were
disconnected until 2026-07-25: results were persisted and never shown.

```
WRITE PATH                              READ PATH (what the UI calls)
POST /api/v1/search                     GET /api/v1/search/results
  ↓ fan out to 12 platforms               GET /api/v1/search/suggestions
  ↓ persist -> contentStreams  ─────────►  reads contentStreams  (aggregated)
                                           reads identity.users  (profiles)
                                           reads userContents    (native)
```

The read path lives in `features/search/database-search.handler.ts`. It previously
injected only the identity, user-content and project repositories and contained **zero
references to `contentStreams`** — so every cross-platform result existed solely in the
immediate POST response and vanished from the product. Measured: a YouTube search wrote
11 rows, `GET /search/results` returned `total: 0`.

**If you add a platform, both halves must be exercised.** Persisting is not shipping.
Verify with a real request, then query the table, then call the read endpoint. See
`docs/integrations/END_TO_END_VERIFICATION.md` for the exact commands.

Aggregated rows reach the client through the `AggregatedSearchResult` projection, not
the raw entity — `metaData` is whatever the platform returned, and the API contract
must not depend on twelve third-party payload shapes. When adding a platform, extend:

- `extractThumbnail` — platforms disagree (`thumbnails.high.url`, `thumbnail_url`,
  `media_url`, `picture.data.url`).
- `buildSourceUrl` — **this is where it breaks quietly.** A wrong URL still renders a
  result card, it just sends the user to a 404. Note YouTube needs three shapes:
  `watch?v=` for a video, `/channel/` for a channel, `/playlist?list=` for a playlist.
  Prefer a real `permalink` from the payload when present; prefer `null` over a guess.
- `database-search.handler.spec.ts` — add cases for the new platform.

## The write path, per platform

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

## Adding a credential-free source — use the shared helper

`searchOpenSourceAsync` in `search.service.ts` carries the whole
cache → fetch → persist → cache shape once. Apple, Openverse and Hacker News are three
small mapping functions on top of it, because the read path, dedup and persistence were
already per-platform. Adding another open source is a mapper, not new infrastructure:

```ts
public async searchFooAsync(params: PlatformSearchParamsModel): Promise<any> {
  return this.searchOpenSourceAsync(
    _const.PLATFORMS.FOO,
    params,
    async (term, perPage, page) => {
      // resilientGet, never axios directly: timeout, jittered retry on 429/5xx only, and a
      // per-platform circuit breaker so a dead platform costs microseconds instead of a
      // full timeout on every search. See skill `gaddr-api-resilience`.
      const { data } = await resilientGet<any>('https://api.example.com/search', {
        platform: _const.PLATFORMS.FOO,
        params: { q: term, per_page: perPage, page },
      });
      const items = (data?.results ?? []).map((r: any) => new ContentStream({
        type: StreamEntityType.Content,
        subType: 'thing',
        title: r.title ?? '',
        platform: _const.PLATFORMS.FOO,
        externalId: String(r.id ?? ''),
        // externalUrl and thumbnailUrl are what the read path reads — see below.
        metaData: { description: r.description, externalUrl: r.url, thumbnailUrl: r.image },
        lastRefreshed: new Date(),
      }));
      return { items, raw: data?.results ?? [] };
    },
  );
}
```

Things that bit while doing this three times:

- **Opaque ids need `metaData.externalUrl`.** GitHub, Apple, Openverse and HN all use ids
  you cannot build a URL from, so `buildSourceUrl` returns `null` for them and the read
  path uses the stored landing URL. Better an absent link than a fabricated 404.
- **Check the page index base.** Algolia is zero-indexed; GitHub and Openverse are one-
  indexed. Getting it wrong silently returns page 2 as page 1.
- **Persisting matters more here**, not less: it is what stops an unauthenticated rate
  limit becoming the binding constraint on repeat searches.
- **Keep licence fields.** Openverse rows carry `license`, `licenseVersion`, `licenseUrl`.
  That is the entire reason to prefer that source over scraping — dropping them defeats it.

## Adding a platform

1. **Config** — add `<PLATFORM>_CLIENT_ID`, `_CLIENT_SECRET`, `_CALLBACK_URL` to
   `src/configs.ts` and the exported config object. Secrets get no default.
2. **Constants** — add to `_const.PLATFORMS`, **and** to `_const.SEARCHABLE_PLATFORMS`.
   Two lists on purpose: `PLATFORMS` also covers identity linking and holds entries with
   no search implementation (twitch, discord). The fan-out reads `SEARCHABLE_PLATFORMS`,
   because deriving it from `PLATFORMS` meant every search returned
   `Unsupported platform: …` for those. `const.spec.ts` guards both directions — nothing
   dispatched without an implementation, nothing implemented left out of the fan-out.
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
7. **Read path** — extend `extractThumbnail` and `buildSourceUrl` in
   `database-search.handler.ts`, or rows persist but render with no thumbnail and no
   working link. Add cases to `database-search.handler.spec.ts`.
8. **Frontend** — add the CDN hostname to `remotePatterns` in `next.config.ts`, or
   `next/image` refuses to render the platform's media.
9. **Verify end-to-end**, not by reading the code:
   ```bash
   curl -X POST localhost:8099/api/v1/search -H 'Content-Type: application/json' \
     -d '{"searchTerm":"design","platforms":["<platform>"],"limit":10}'
   psql -d gaddr_e2e -c 'SELECT platform, type, "externalId", title FROM "contentStreams"'
   # aggregated MUST be non-empty — this is the step that was broken for every platform
   curl 'localhost:8099/api/v1/search/results?keyword=design&limit=5'
   ```

## Rules

- **Never let one platform fail the whole search.** Every platform call stays inside
  its own `catch`, returning `{ platform, error, result: null }`.
- **Always persist to the database.** A search that only proxies burns quota on
  every repeat.
- **Always set a cache TTL.** Redis is capped at 30 MB.
- **Respect quota.** YouTube gives ~100 searches/day. Search endpoints are public by
  design but **are** rate-limited: `SearchRateLimitGuard` on `POST /search` and
  `ExternalSearchRateLimitGuard` on the fan-out route, counting atomically in Redis
  per user or per client IP, with a bounded per-instance fallback when Redis is down.
  A new platform inherits that limit — check the budget still makes sense once the
  fan-out is wider, since one user request becomes one call *per platform*.
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
