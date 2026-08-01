# Search Engine — End-to-End Verification

**Run:** 2026-07-25 · **Method:** real backend process, real Postgres, real YouTube Data API v3.

This records an actual execution of the full search chain, not a reading of the code.
It exists because "the architecture looks correct" is not evidence, and because
running it surfaced four defects that static review had missed.

---

## What was verified

Local Postgres 17 + Redis, backend built from `main` and run as a normal process, real
YouTube credentials, no mocks or stubs anywhere in the path.

| Step | Result |
|---|---|
| 1. Fresh database built from the migration chain | ✅ 42 tables, **52 migrations**, zero failures |
| 2. `POST /api/v1/search` → live YouTube Data API | ✅ HTTP 200 in 1.06 s, `totalResults: 10` |
| 3. Results persisted to Postgres | ✅ **10 rows** in `contentStreams` (0 before) |
| 4. Rows contain real platform data | ✅ real channel/video/playlist IDs, real `i.ytimg.com` / `yt3.ggpht.com` thumbnails |
| 5. Repeat search does not duplicate | ✅ 11 rows / **11 distinct** `externalId` — application-level dedup works |
| 6. `GET /api/v1/search/results` returns the stored content | ✅ `aggregated: 11`, served in **9.5 ms** from Postgres, no API call, no quota spent |
| 7. `GET /api/v1/search/suggestions` | ✅ 5 autocomplete entries from aggregated content |
| 8. Canonical source URLs | ✅ `watch?v=`, `/channel/`, `/playlist?list=` correctly distinguished |
| 9. Rate limiter under real traffic | ✅ tripped at 20/min on `127.0.0.1`, keyed on the real client IP |

Sample of what actually landed in the database:

```
youtube | Profile/channel  | UCA_fIuIBkjjO5IfK50Iqs7w             | Dhot Design
youtube | Profile/channel  | UCdgUN8rX3SEb9L7FDub3I6A             | Design Theory
youtube | Content/video    | 6RHtdmE01x8                          | American infiltrates Euro Banknote…
youtube | Content/playlist | PLYfCBK8IplO4E2sXtdKMVpKJZRBEoMvpn   | Beginners guide to Graphic Design…
```

And what the user-facing endpoint now returns:

```
[youtube/video]   TUSUK KONDE PART 4 - Dhot Design
    url  : https://www.youtube.com/watch?v=z29sBtkD9Ww
    thumb: https://i.ytimg.com/vi/z29sBtkD9Ww/hqdefault.jpg
[youtube/channel] Design Theory
    url  : https://www.youtube.com/channel/UCdgUN8rX3SEb9L7FDub3I6A
```

---

## Four defects this found

Each blocked the chain and none was visible from reading the code.

### 1. Aggregated content was saved but never shown — the headline defect

`POST /search` persists every platform result into `contentStreams`. But
`database-search.handler.ts`, which powers `GET /search/results` and
`/search/suggestions` — the endpoints the UI calls — injected only
`IIDENTITY_REPOSITORY`, `IUSERCONTENT_REPOSITORY` and `IPROJECT_REPOSITORY`. It
contained **zero references to `contentStreams`**.

Measured: a YouTube search wrote 11 rows, and `GET /search/results` returned
`{profiles: [], contents: [], total: 0}`.

So the two halves of the search engine were disconnected. Cross-platform results
existed only in the immediate `POST` response and were invisible to every subsequent
search — the "persist, then serve from the database" model the PRD describes was half
wired.

**Fixed:** both handlers now read `contentStreams` and return an `aggregated`
section. The response gains a key rather than changing existing ones, so no client
contract breaks. Results are exposed through a narrow projection
(`AggregatedSearchResult`) instead of the raw entity, because `metaData` is whatever
shape the source platform returned and the API must not depend on twelve third-party
formats.

### 2. The database could not be rebuilt from source

The migration chain failed on an empty database:

```
QueryFailedError: relation "upload_jobs" does not exist
  at MakeUploadJobVideoIdNullable1784000000002.up
```

Six tables had entities — and in one case an `ALTER` migration — but **no migration
ever created them**: `upload_jobs`, `youtube_accounts`, `youtube_videos`,
`youtube_analytics`, `project`, `newsletter_subscribers`. They exist in production
only because `synchronize: true` created them at some point, or because DDL was
applied by hand.

Consequence: no new environment could be provisioned — not staging, not a new region,
not a disaster-recovery rebuild, not a local database. Production worked only because
it had been grown incrementally.

**Fixed:** `1784000000001-CreateMissingTables.ts`. The DDL was not hand-written — it
was produced by letting TypeORM build the schema from the entities on an empty
database and dumping the result, so it matches the entities exactly, including
generated constraint and index names so it converges with production instead of
creating differently-named duplicates. Every statement is `IF NOT EXISTS`, making it
a no-op where the tables already exist. `down()` is deliberately empty: these tables
hold production data this migration did not create.

### 3. A migration depended on production-only state

Next failure:

```
QueryFailedError: relation "gaddr_users_compat" does not exist
  at normalizeRemainingFkColumnsToUuid1784000000008.up
```

That migration remediates legacy non-UUID user IDs by joining against
`gaddr_users_compat`, a leftover of an earlier auth migration that no migration
creates. Its own comment notes that migration `…007` *"was already applied when
edited in-place"* — editing an applied migration is how chains break.

**Fixed:** the data-remediation `UPDATE`s are now guarded on the table existing. This
is correct rather than merely convenient — a fresh database has no legacy text IDs to
remediate, so the remediation is a no-op by definition. The schema conversions after
it still run unconditionally.

### 4. Connection and TLS configuration was dead

`data.source.ts` read `process.env.DATABASE_URL` and hardcoded
`ssl: { rejectUnauthorized: false }`. So:

- `POSTGRES_HOST`, `_PORT`, `_USERNAME`, `_PASSWORD`, `_DATABASE` were validated at
  boot — `POSTGRES_PASSWORD` even rejects an empty string — and then **discarded**.
  Setting them appeared to work and did nothing.
- `POSTGRES_SSL_REJECTUNAUTHORIZED` had **no effect**, so certificate verification
  could not be enabled at all. This is finding M7 in the audit, and worse than
  recorded there: not a bad default but a dead option with verification permanently
  off.
- Connecting to any non-TLS Postgres was impossible — *"The server does not support
  SSL connections"* — which is why the service could not run locally.

**Fixed:** `DATABASE_URL` still takes precedence (production is unchanged) with the
discrete variables as a real fallback, and TLS is resolved from configuration —
still on by default, disabled only for a plainly local target or an explicit
`POSTGRES_SSL=false`.

---

## Two things confirmed working well

- **Thundering-herd protection is real.** `searchCache.service` takes a distributed
  lock before calling a platform API; concurrent identical searches wait for the
  cached result instead of each making a paid call.
- **Dedup is correct.** 11 rows, 11 distinct `externalId` after a repeat search that
  returned one new video. Note this is enforced in application code — there is **no
  unique constraint on `(platform, externalId)`**, so concurrent inserts of the same
  item from different queries could still race. Adding that index is cheap and worth
  doing.

---

## Reproducing this

```bash
# 1. Local Postgres + Redis, then a scratch database
createdb gaddr_e2e

# 2. .env.development — gitignored; POSTGRES_ENTITIES must be recursive,
#    entities live in domain/entities/{,identity,notification,collection}/
POSTGRES_ENTITIES=/../../domain/entities/**/*.entity.js
POSTGRES_MIGRATIONS=/../migrations/*.js
POSTGRES_MIGRATIONS_RUN=true
POSTGRES_SYNCHRONIZE=false
YOUTUBE_API_KEY=<key>

# 3. Build and run; migrations create 42 tables
npm run build && node dist/main.js

# 4. Real search
curl -X POST localhost:8099/api/v1/search -H 'Content-Type: application/json' \
  -d '{"searchTerm":"design","platforms":["youtube"],"limit":10,"page":1}'

# 5. Confirm persistence
psql -d gaddr_e2e -c 'SELECT platform, type, "externalId", title FROM "contentStreams"'

# 6. Confirm it is served back
curl 'localhost:8099/api/v1/search/results?keyword=design&limit=5'
```

Note the anonymous limit on the fan-out endpoint is 5/min — a readiness probe loop
will trip it, which is the limiter working.

---

## Still not verified end-to-end

Stated plainly rather than implied:

- **Only YouTube.** It is the one platform with working credentials. Pinterest returns
  401, Reddit 403, Dribbble needs an authorisation-code flow, TikTok's
  `client_credentials` token cannot search content. See [`STATUS.md`](STATUS.md).
- **The frontend rendering these results.** The API contract is verified; no browser
  test asserts the `aggregated` array reaches a rendered result card. Playwright
  coverage is the next step.
- **Against production data volumes.** 11 rows is a functional proof, not a
  performance one. `contentStreams` search uses `ILIKE` plus a `json_each_text` scan
  over `metaData`, which will not hold up at scale — full-text search or a trigram
  index is needed before this carries real traffic.
- **Quota headroom.** YouTube allows ~100 searches/day at 100 units per
  `search.list`. Verified working; not verified sustainable. Request an increase.
