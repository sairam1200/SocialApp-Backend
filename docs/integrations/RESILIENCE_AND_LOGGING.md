# Outbound resilience and diagnostic logging

How this service calls third-party APIs, what protects those calls, and how to find out why
one is failing. Written after four defects that all shared one property: **the code
typechecked, the tests passed, and the failure was invisible.**

Related: [`STATUS.md`](STATUS.md) for per-platform credential state ·
[`END_TO_END_VERIFICATION.md`](END_TO_END_VERIFICATION.md) for the full-chain trace ·
skill `gaddr-api-resilience` for the working rules.

---

## 1. The problem this solves

Search fans out to a dozen platforms on a single request. Before this layer existed:

| Condition | What happened |
|---|---|
| A platform accepted a connection and never replied | The request hung. **Axios has no default timeout**, and three call sites had none — including the Reddit and Spotify OAuth token exchanges. |
| A platform was permanently blocked (Reddit 403, Pinterest 2FA) | It cost its **full timeout on every search**, indefinitely, because nothing remembered that it had just failed. |
| A key expired or a quota ran out | Retries hammered it. YouTube allows ~100 searches/day, so retrying a 403 spends the remaining budget on errors. |
| Any of the above | The log said a platform failed. It did **not** say why. |

None of it was visible from a green gate. That is the through-line of this document.

---

## 2. `resilientHttp.util.ts` — the outbound layer

Every third-party call goes through it. Direct `axios` use in a platform path is a defect.

```ts
import { resilientGet } from '../../core/utils/resilientHttp.util';

const { data } = await resilientGet<SearchResponse>('https://api.example.com/search', {
  platform: _const.PLATFORMS.EXAMPLE,   // circuit-breaker key, required
  params: { q: term },
  timeout: 6_000,                       // optional — 8s applies otherwise
  maxRetries: 1,                        // optional — 2 otherwise
});
```

### Timeout

`DEFAULT_TIMEOUT_MS = 8000`, and a caller cannot remove it. Every other guarantee depends
on this one.

### Retry policy

| Outcome | Retried? | Why |
|---|---|---|
| Transport error (timeout, DNS, reset) | **Yes** | No response at all; a second attempt can genuinely differ. |
| `429 Too Many Requests` | **Yes** | Explicitly "try again later". |
| `5xx` | **Yes** | The platform's own fault, often transient. |
| `400`, `401`, `403`, `404`, `422` | **No** | A definite answer about this request. Retrying wastes metered quota and can extend a lockout. |

Two attempts after the first, by default. Deliberately low: retries multiply fan-out, and
with twelve platforms per search a generous retry count turns one slow platform into a
self-inflicted outage.

### Backoff

`Retry-After` wins when present — the platform is stating its own terms. Both delay-seconds
and HTTP-date forms are parsed; an unparseable value is *ignored* rather than treated as
zero, which would hammer the platform that just asked us to wait. Capped at 4 s so one rude
platform cannot stall a whole search.

Otherwise: exponential from 250 ms with **full jitter** — `random() × window`, not
`window ± wobble`. Backoff without jitter synchronises every retrying caller into a burst
precisely when the platform is recovering, which is the failure it was meant to prevent.

### Circuit breaker

Five consecutive failures → the platform is skipped for 60 s, costing microseconds instead
of a timeout. Then one trial request (half-open): success closes it, failure re-opens it
**without retrying**, so a still-dead platform costs one request per minute rather than
three per search.

Failures are counted **once per call, not per attempt**. Three failed attempts are one
unhealthy observation; counting per attempt would trip the breaker after two bad calls
instead of five.

Two properties not to undo:

- **Per platform, never global.** A failing Reddit must not stop YouTube being queried.
  Pinned by a test.
- **Per instance, not shared through Redis.** The breaker is a latency optimisation;
  distributing it would add a Redis round trip to the path it exists to make fast, and a
  new failure mode when Redis is down. Independent learning per container is the right
  trade at this size.

Use a suffixed key for a token endpoint (`reddit:token`). A dead token endpoint and a dead
search endpoint are different faults with different remedies.

Observed live:

```
[resilientHttp] circuit OPEN for reddit:token — 5 consecutive failures,
                skipping for 60s. Last: 401
```

---

## 3. Credential guards

```ts
if (!configs.spotify?.clientId || !configs.spotify?.clientSecret) {
  throw new Error('Spotify is not configured — set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET');
}
```

Without this, unset config is interpolated as the literal string `"undefined"`, sent as real
basic auth, and rejected 401. That is a wasted round trip on every search, a log line that
reads like *rejected* credentials rather than *absent* ones, and an opened circuit breaker —
which conflates "not configured" with "broken". Two different faults, two different remedies.

---

## 4. Why the logs were empty, and what changed

The most consequential finding, because it silently degraded every other investigation.

`winston.util.ts` wraps Winston to add caller attribution and redaction. It did:

```ts
baseLogger.error({ message: safeMessage, file, method, ...safeMeta });
```

**An Error spreads to `{}`.** `message` and `stack` are non-enumerable, so
`Object.keys(new Error('x'))` is `[]`. **86 call sites** passed a bare `error` as meta, and
every one produced a log line with no cause attached.

Two things kept it hidden:

- **`catch (error: any)`** makes `logger.error(msg, error)` typecheck against a
  `Record<string, any>` parameter, so the compiler could not object.
- **Raw Winston special-cases an Error passed as meta.** The spread bypassed that, so a
  reasonable-looking wrapper silently removed behaviour everyone assumed was there.

`normaliseMeta` now handles three shapes:

| Passed | Becomes |
|---|---|
| `Error` | `{ reason, stack, code?, status?, response? }` |
| `string` / number | `{ reason: String(meta) }` — spreading a string yielded `{0:'a',1:'b',…}` |
| plain object | unchanged; empty objects add nothing to the line |

**Error fields are copied selectively, never spread.** An axios error carries enumerable
`config` and `request`, and `config.headers` holds the `Authorization` header. Redaction
would catch most of it, but not writing a secret down at all is the stronger guarantee.
A test asserts a bearer token cannot reach the log this way.

Before and after, same code path:

```
error: Error fetching Spotify results for "x":
error: Error fetching Spotify results for "x": {"reason":"Spotify is not configured — set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET"}
```

---

## 5. Diagnosing "this platform returns nothing"

In order, cheapest first.

1. **Is it configured?** The log now says so verbatim. Grep for `is not configured`.
2. **Is its circuit open?** `GET /api/v1/integrations/health` (admin) reports
   `openCircuits` with `consecutiveFailures` and `openForMs`. This field is **never cached**
   — unlike the probes, it describes this instance right now. An open circuit is otherwise
   completely invisible, which makes it the worst kind of bug to chase.
3. **Are the credentials valid?** The same endpoint probes each platform and returns one of
   five states with a remediation string. The YouTube probe deliberately uses
   `i18nLanguages` (1 quota unit) rather than `search.list` (100).
4. **Is it a platform that will never work?** [`STATUS.md`](STATUS.md). Dribbble v2 has no
   search endpoint; Behance has no public API and its handler is a stub returning empty
   arrays. Debugging those is wasted time.
5. **Is it a code path?** Only now. Reproduce against a real database and a real API — see
   [`END_TO_END_VERIFICATION.md`](END_TO_END_VERIFICATION.md).

---

## 6. What is deliberately not built

Stated so nobody assumes otherwise.

- **No distributed circuit breaker.** Reasoning above. Revisit only if instance counts grow
  enough that independent learning wastes real quota.
- **No bulkhead / concurrency cap on fan-out.** All platforms are queried concurrently.
  Acceptable today because the breaker bounds the cost of dead platforms and the timeout
  bounds the rest. Becomes worth adding when the platform count grows or memory tightens —
  512 MB is the ceiling.
- **No retry budget across a whole request.** Each call retries independently. A pathological
  case is twelve platforms × three attempts; the breaker prevents the sustained version of
  this, but a global budget would bound the spike.
- **`RateLimit-*` headers are emitted, not consumed.** We honour `Retry-After` on failure
  but do not pre-emptively slow down as a platform's remaining quota drops. Worth doing for
  YouTube specifically, where the daily ceiling is the binding constraint.

---

## 7. Test coverage

| Suite | Pins |
|---|---|
| `resilientHttp.util.spec.ts` | 21 tests. Timeout always applied; 4xx never retried; `Retry-After` in both forms and capped; full jitter; breaker opens, isolates platforms, half-opens, re-opens without retrying, and counts per call rather than per attempt. |
| `winston.util.spec.ts` | 11 tests. An Error keeps its reason, message and stack; axios fields lifted; **`config`/`request` never copied, asserted by checking a bearer token cannot appear**; primitives become `reason`; empty meta stays absent. |

Both are unit suites. The live behaviour — a real breaker opening against a real platform,
and a real "not configured" reason reaching the log — was verified by running the service,
because that is the only thing that ever caught defects of this class here.


---

## 8. Startup must not depend on a dependency being reachable

Added 2026-07-26 after a Cloud Run deploy failed with:

```
ERROR: (gcloud.run.services.update) The user-provided container failed to start and
listen on the port defined provided by the PORT=8080 environment variable within the
allocated timeout.
```

Build and push succeeded. The container was **alive and never listening** — 4m40s of nothing,
and a message naming neither the cause nor the dependency.

Reproduced by pointing `DATABASE_URL` at a closed port:

```
[startup] Redis connected
[startup] STEP 1 — creating NestFactory
Unable to connect to the database. Retrying (1)...
Unable to connect to the database. Retrying (2)...
   -> process alive, port never opened
```

`@nestjs/typeorm` retries **10 times, 3 s apart, inside `NestFactory.create()`** — before the
HTTP server exists. Cloud Run's only startup contract is "listen on `$PORT`", so an
unreachable database does not surface as a database error. It surfaces as a startup timeout.

**Now:** 5 attempts at 2 s with `verboseRetryLog`, set at the `TypeOrmModule.forRoot` call site
(they are Nest options, not `DataSourceOptions` — folding them in only typechecks behind a
cast and misleads anyone using the data source from the CLI). Failure takes **11 s instead of
never**, and prints `ECONNREFUSED <host>:<port>`.

The deploy still fails, and it should — a service with no database cannot serve. But Cloud Run
keeps the previous revision serving either way, so failing fast costs nothing and buys an
error someone can act on.

### Two Redis defects found in the same pass

**`REDIS_URL` was never read.** `configs.ts` exposed only discrete `REDIS_HOST`/`REDIS_PORT`,
with no default. An instance configured the normal way — the URL every managed provider hands
you — fell through to ioredis's own default of `127.0.0.1:6379`, which on Cloud Run is nothing
at all. This is character-for-character the defect `DATABASE_URL` had: validated config that
nothing consumed. `REDIS_URL` now takes precedence, and `rediss://` enables TLS.

**The reconnect loop never stopped.** `retryStrategy` returned a delay unconditionally, so
with Redis unreachable it reconnected forever — and since every failure emits an error event,
it logged forever too: **1,761 `ECONNREFUSED` lines and still climbing** during one local
boot, on a service whose logs go to Cloud Logging. `main.ts` is explicitly designed to
continue without Redis, but continuing while a background loop burns CPU and floods logs
forever is not degrading gracefully. It now gives up after 10 attempts and says so once.

Verified after the fix: happy path listens on `$PORT`, connects Redis **via `REDIS_URL`**, and
logs **zero** connection errors.

### The generalisable rule

Anything awaited before `app.listen()` is a potential deploy-blocker, and its failure will be
reported by the platform as a port problem rather than as itself. So for every dependency
touched during bootstrap, ask: *is it bounded, and does its failure name itself?* Unbounded
retry is the specific trap — it converts a clear error into a timeout.
