---
name: gaddr-api-resilience
description: Outbound HTTP to third-party APIs — timeouts, retries, backoff, circuit breakers, rate-limit handling and diagnostic logging. Use when adding or debugging any call to an external service, when a platform is slow or flaky, when handling 429s or quota, or when a failure is hard to diagnose from the logs.
---

# Gaddr API resilience

Everything here was paid for by a real defect in this repository. The rules are short; the
reasons are what make them stick.

## Never call `axios` directly. Use `core/utils/resilientHttp.util.ts`

```ts
import { resilientGet, resilientPost } from '../../core/utils/resilientHttp.util';

const { data } = await resilientGet<ThingResponse>('https://api.example.com/search', {
  platform: _const.PLATFORMS.EXAMPLE,   // breaker key — required
  params: { q: term },
  timeout: 6_000,                       // optional; 8s default applies otherwise
});
```

What you get, and why each part exists:

| Protection | Why |
|---|---|
| **Timeout, always** | Axios has **no default timeout**. Three calls here had none, including the Reddit and Spotify token exchanges — a platform that accepts a connection and never answers held the request open indefinitely. |
| **Retry only 429, 5xx and transport errors** | A 401 or 403 will not fix itself on attempt two. YouTube allows ~100 searches/day, so retrying an expired key spends the day's quota on errors. |
| **Exponential backoff with full jitter** | Backoff *without* jitter synchronises every retrying caller into a burst exactly when the platform is recovering. Full jitter (`random × window`) spreads them properly. |
| **`Retry-After` honoured** | The platform is stating its own terms. Both delay-seconds and HTTP-date forms. Capped, so one rude platform cannot stall a whole search. |
| **Per-platform circuit breaker** | After 5 consecutive failures the platform is skipped for 60 s. Twelve platforms × an 8 s timeout on every search is not hypothetical — several are known-blocked and will stay that way until someone completes an OAuth flow. |

Two design points worth not undoing:

- **The breaker is per platform, never global.** A failing Reddit must not stop YouTube
  being queried. There is a test that pins exactly this.
- **The breaker is per instance, not shared through Redis.** It is a latency optimisation;
  making it distributed would add a Redis round trip to the path it exists to make fast,
  and a new failure mode when Redis is down.

Verified in a real run:

```
[resilientHttp] circuit OPEN for reddit:token — 5 consecutive failures,
                skipping for 60s. Last: 401
```

Use a suffixed key (`reddit:token`) for a token endpoint. A dead token endpoint and a dead
search endpoint are different faults with different remedies, and one breaker for both
hides which is broken.

## Check credentials before calling out

```ts
if (!configs.spotify?.clientId || !configs.spotify?.clientSecret) {
  throw new Error('Spotify is not configured — set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET');
}
```

Without this, unset config interpolates as the string `"undefined"`, gets sent as real
basic auth, and comes back 401. Three consequences, all bad: a wasted round trip on every
search, a log line that reads like *rejected* credentials rather than *absent* ones, and an
opened circuit breaker — which conflates "not configured" with "broken".

## `logger.error(msg, error)` used to throw the cause away

The single most valuable thing in this file. The wrapper in `winston.util.ts` did
`{ ...safeMeta }`, and **an Error spreads to `{}`** — `message` and `stack` are
non-enumerable, so `Object.keys(new Error('x'))` is `[]`.

86 call sites passed a bare `error`. Every one logged a message with no cause. The failure
mode was the worst kind for a logger: there was always a line, just never a reason in it.

Two things kept it hidden:

- **`catch (error: any)`** makes `logger.error(msg, error)` typecheck against a
  `Record<string, any>` parameter. The compiler could not help.
- **Raw Winston special-cases an Error passed as meta.** Spreading bypassed that, so a
  reasonable-looking wrapper silently removed the behaviour people expected.

`normaliseMeta` now lifts `reason`, `stack`, `code`, `status` and `response` off an Error.
**It deliberately does not copy `config` or `request`** — `config.headers` holds the
`Authorization` header, and not writing a secret down beats redacting it afterwards. There
is a test asserting a bearer token cannot reach the log this way.

So: pass an Error or a plain object, both work. If you write a *new* logging helper, do not
spread meta without normalising it first.

## Startup: anything awaited before `app.listen()` can block a deploy

A Cloud Run deploy failed with *"container failed to start and listen on the port defined
provided by the PORT=8080 environment variable"* — 4m40s, naming no cause. The container was
alive the whole time. `@nestjs/typeorm` retries the database **10 times, 3 s apart, inside
`NestFactory.create()`**, before the HTTP server exists, so an unreachable database is
reported by the platform as a *port* problem.

Rules that follow:

- **Bound every startup retry.** DB retries are now 5 × 2 s with `verboseRetryLog`: 11 s to
  fail instead of never, and it prints `ECONNREFUSED <host>:<port>`.
- **Unbounded retry is the trap.** Redis's `retryStrategy` returned a delay unconditionally,
  so it reconnected — and logged — forever: 1,761 `ECONNREFUSED` lines and climbing in one
  boot. Return `null` to stop. "Continue without Redis" is not graceful if a loop burns CPU
  and floods Cloud Logging behind it.
- **Check the URL form is actually read.** `REDIS_URL` was validated in `configs.ts` and
  consumed nowhere; ioredis silently used `127.0.0.1:6379`. Identical to the `DATABASE_URL`
  defect. When a provider gives you a connection URL, grep that the code reads it.
- Nest-only options (`retryAttempts`, `retryDelay`, `verboseRetryLog`) belong at
  `TypeOrmModule.forRoot`, not in `DataSourceOptions` — they only typecheck there behind a
  cast and mislead CLI users.

## Rate limits: read the response, don't guess

Emit `RateLimit-*` and `Retry-After` on our own limited endpoints — `searchRateLimit.guard.ts`
is the reference. On the way out, honour what platforms send rather than hardcoding a guess.

Current known ceilings:

| Platform | Limit | Note |
|---|---|---|
| YouTube | 10,000 units/day, `search.list` = **100** | ~100 searches/day total. The binding constraint on the only keyed source. |
| GitHub | 10/min unauthenticated, 60/hr with a PAT | Search endpoints have their own tighter bucket than the REST API. |
| Openverse | Unauthenticated, throttled | Register for higher limits if it becomes hot. |
| Hacker News (Algolia) | Generous, undocumented | Zero-indexed pages — off-by-one silently returns page 2 as page 1. |
| Apple / iTunes | ~20/min per IP, undocumented | No auth. Fails quietly under load, so persist results. |
| Reddit | $0.24 per 1,000 calls commercially | Also blocks datacenter IPs on public JSON. |
| X / Twitter | Pay-per-use since Feb 2026; free tier gone | ~$5 per 1,000 reads; full-archive is enterprise-only. |

**Persistence is a rate-limit strategy, not just a feature.** Every platform result is
written to `contentStreams` and re-read from Postgres, which is what stops an unauthenticated
limit becoming the binding constraint on repeat searches.

## The 2026 landscape, and what it means for this product

Researched July 2026. The direction of travel is one-way: what was free and open is now
gated, metered and reviewed.

- **X** killed its free tier for new developers in February 2026. Pay-per-use is the only
  on-ramp; full-archive search is enterprise pricing.
- **Reddit** charges per call commercially and refuses datacenter IPs on the public JSON
  endpoints.
- **Meta** requires app review, measured in weeks, for anything useful.
- **TikTok** gates content search behind user-authorised tokens by design —
  `client_credentials` cannot do it, no matter how the app is configured.
- **Pinterest** is free but gated, and challenges the *account* with 2FA during OAuth,
  which cannot be scripted.

**The strategic consequence, and it should shape what you build next:** the four sources
needing *no credential at all* — GitHub, Apple/iTunes, Openverse, Hacker News — are the
integrations most likely to still be returning data in a year. They cannot be revoked,
repriced, or lost when someone leaves the company holding the developer account. Treat them
as the product's backbone rather than as filler, and treat every keyed platform as a
liability with an owner.

Credential-free candidates verified working but **not yet integrated** (probed July 2026):

| API | Result | Covers |
|---|---|---|
| **Deezer** | 200, `total: 120`, **0.4 s** | Music. Fast, no auth at all. The best remaining win. |
| Open Library | 200, `numFound: 12857` | Books, authors. |
| Wikipedia | 200 | Entities and people — relevant to Gaddr Me profiles. |
| Wikimedia Commons | 200 | Licensed media; complements Openverse. |
| MusicBrainz | 200, `count: 217`, 3.7 s | Music metadata, but slow and 1 req/s. Deezer covers the vertical better. |
| Internet Archive | 200 | Archived media and texts. |

## Adding a platform: the checklist that would have caught every defect here

1. **Probe with `curl` first.** Never inherit a "blocked" label — GitHub sat in that bucket
   while needing no credential at all, and so did three others.
2. Use `resilientGet`/`resilientPost` with the platform constant as the breaker key.
3. Guard on credentials before the call.
4. Add to `_const.PLATFORMS` **and** `_const.SEARCHABLE_PLATFORMS`. `const.spec.ts` pins
   both directions.
5. Map into `ContentStream` with `metaData.externalUrl` when the id is not addressable, so
   `buildSourceUrl` can return null rather than fabricating a 404.
6. **Keep licence fields** if the source states them. Openverse's whole value is provable
   reuse rights, and a CC-BY image rendered without attribution is a licence breach.
7. Check the page index base. Algolia is zero-indexed; GitHub and Openverse are one-indexed.
8. **Boot the process.** `npm run build && node dist/main.js`. A green gate is not evidence
   the application runs — see skill `gaddr-testing`.
9. Verify the *read* path, not just the write. Query the table, then call
   `GET /search/results` and confirm the row arrives with a working URL.

Related: skill `gaddr-platform-integration` for per-platform credential state and the
`searchOpenSourceAsync` template · skill `gaddr-testing` for why unit tests missed all of
this · agent `redis` for the caching layer these results land in.
