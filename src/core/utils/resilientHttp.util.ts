import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import logger from './winston.util';

/**
 * Outbound HTTP for third-party platform APIs: timeout, bounded retry with jittered
 * backoff, and a per-platform circuit breaker.
 *
 * ## Why this exists
 *
 * Search fans out to a dozen platforms on one request. Without any of this, a single
 * unhealthy platform degrades every search:
 *
 * - **No timeout means no bound.** Axios has no default timeout, so a platform that
 *   accepts a connection and never answers hangs the request until the client gives up.
 *   Three calls in `search.service.ts` were in that state, including the Reddit and
 *   Spotify token exchanges — the ones on the critical path of every authenticated call
 *   to those platforms.
 * - **A dead platform costs its full timeout, every single search.** Twelve platforms at
 *   8 s each is not a hypothetical: several are known-blocked (Reddit 403, Pinterest 2FA)
 *   and will fail for as long as they stay unauthorised. Retrying makes it worse.
 * - **Retrying the wrong thing burns quota.** A 401 will not fix itself on attempt two.
 *   YouTube allows roughly 100 searches a day, so a retry storm against an expired key
 *   spends the day's budget on errors.
 *
 * ## The shape, and why each piece is what it is
 *
 * **Timeout always.** A caller cannot opt out; `DEFAULT_TIMEOUT_MS` applies when none is
 * given. This is the one guarantee everything else depends on.
 *
 * **Retry only what can succeed on a second attempt** — network errors, 429, and 5xx.
 * Every other 4xx is a permanent answer about the request itself, and retrying it is pure
 * waste. `429` is retried because it is explicitly "try again later".
 *
 * **Exponential backoff with full jitter.** Backoff alone synchronises every retrying
 * caller into a burst precisely when the platform is recovering; the random component is
 * what spreads them out. `Retry-After` wins when the platform sends it, because that is
 * the server stating its own terms and guessing over it is rude and usually wrong.
 *
 * **Circuit breaker per platform.** After `FAILURE_THRESHOLD` consecutive failures a
 * platform is skipped outright for `OPEN_DURATION_MS`, so it costs microseconds instead of
 * a full timeout. One trial request is then allowed through (half-open): success closes
 * the breaker, failure re-opens it. Per platform, never global — a failing Reddit must not
 * stop YouTube being queried.
 *
 * The breaker state is **per instance**, deliberately. Cloud Run runs several containers
 * and this is not shared through Redis: a breaker is a latency optimisation, and making it
 * distributed would add a Redis round trip to the very path it exists to make fast, plus a
 * new failure mode when Redis is down. Each instance learning independently is a good
 * trade at this size.
 */

/** No caller may exceed this; a hung platform must not hold a request open. */
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Attempts *after* the first. Kept at 2 on purpose: retries multiply fan-out load, and
 * with twelve platforms per search a generous retry count turns one slow platform into a
 * self-inflicted outage.
 */
const DEFAULT_MAX_RETRIES = 2;

/** First backoff step. Doubles per attempt, then jitters. */
const BASE_BACKOFF_MS = 250;

/** Ceiling on a single backoff wait, so a big `Retry-After` cannot stall a search. */
const MAX_BACKOFF_MS = 4_000;

/** Consecutive failures before a platform is skipped. */
const FAILURE_THRESHOLD = 5;

/** How long a tripped breaker stays open before allowing one trial request. */
const OPEN_DURATION_MS = 60_000;

type BreakerState = {
  consecutiveFailures: number;
  /** Epoch ms when the breaker may allow a trial request. 0 = closed. */
  openUntil: number;
  /** True while a trial request is in flight, so only one probes at a time. */
  probing: boolean;
};

const breakers = new Map<string, BreakerState>();

function breakerFor(platform: string): BreakerState {
  let state = breakers.get(platform);
  if (!state) {
    state = { consecutiveFailures: 0, openUntil: 0, probing: false };
    breakers.set(platform, state);
  }
  return state;
}

/** Thrown instead of calling out when a platform's breaker is open. */
export class CircuitOpenError extends Error {
  public readonly platform: string;
  public readonly retryAfterMs: number;

  constructor(platform: string, retryAfterMs: number) {
    super(
      `Circuit open for ${platform} — skipping for ${Math.ceil(
        retryAfterMs / 1000,
      )}s after ${FAILURE_THRESHOLD} consecutive failures`,
    );
    this.name = 'CircuitOpenError';
    this.platform = platform;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Is a second attempt capable of a different outcome?
 *
 * No response at all (timeout, DNS, reset) is retryable. With a response, only 429 and
 * 5xx are: a 4xx is the platform answering clearly about this request, and asking again
 * changes nothing.
 */
function isRetryable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

/**
 * How long to wait before the next attempt.
 *
 * `Retry-After` is honoured when present and sane — the platform is stating its terms, and
 * ignoring it is how an app earns a longer ban. Both forms are handled: delay-seconds and
 * an HTTP-date. Otherwise exponential backoff with **full jitter** (`random × window`),
 * which spreads a synchronised herd far better than a fixed step plus a small wobble.
 */
function backoffMs(error: unknown, attempt: number): number {
  const header = axios.isAxiosError(error)
    ? error.response?.headers?.['retry-after']
    : undefined;

  if (header !== undefined) {
    const raw = String(header).trim();
    const seconds = Number(raw);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    }

    // HTTP-date form. Ignored if unparseable rather than treated as 0, which would
    // hammer the platform that just asked us to wait.
    const until = Date.parse(raw);
    if (!Number.isNaN(until)) {
      return Math.min(Math.max(until - Date.now(), 0), MAX_BACKOFF_MS);
    }
  }

  const window = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.round(Math.random() * window);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'unknown';
  return error.response?.status !== undefined
    ? String(error.response.status)
    : (error.code ?? 'network');
}

export type ResilientRequestOptions = AxiosRequestConfig & {
  /** Breaker key. Use the platform constant so state is shared across its endpoints. */
  platform: string;
  /** Attempts after the first. Defaults to 2. */
  maxRetries?: number;
};

/**
 * Perform an outbound request with the protections above.
 *
 * Throws on final failure — including `CircuitOpenError` when the platform is being
 * skipped. Callers decide what an unreachable platform means for them; in search the
 * answer is an empty array for that platform and results from the others, because one
 * broken integration must never fail the whole search.
 */
export async function resilientRequest<T = unknown>(
  options: ResilientRequestOptions,
): Promise<AxiosResponse<T>> {
  const { platform, maxRetries = DEFAULT_MAX_RETRIES, ...config } = options;
  const breaker = breakerFor(platform);
  const now = Date.now();

  // Open, and not yet time to probe: fail immediately rather than spending a timeout.
  // This also covers the window while another caller's trial request is in flight — one
  // probe at a time is the point of half-open.
  if (breaker.openUntil > now) {
    throw new CircuitOpenError(platform, breaker.openUntil - now);
  }

  // Cooldown elapsed — this request is the trial. Mark it so concurrent callers still
  // fail fast instead of all piling onto a platform that may still be down.
  const isProbe = breaker.openUntil > 0;
  if (isProbe) {
    breaker.probing = true;
    breaker.openUntil = now + OPEN_DURATION_MS;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.request<T>({
        ...config,
        timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
      });

      // Success closes the breaker, whether or not this was the trial request.
      if (breaker.consecutiveFailures > 0 || breaker.openUntil > 0) {
        logger.info(
          `[resilientHttp] ${platform} recovered — circuit closed after ${breaker.consecutiveFailures} failure(s)`,
        );
      }
      breaker.consecutiveFailures = 0;
      breaker.openUntil = 0;
      breaker.probing = false;

      return response;
    } catch (error) {
      lastError = error;

      // A probe that failed: straight back to open, no retries. The cooldown is already
      // set, so this costs one request per minute rather than one per search.
      if (isProbe) {
        breaker.probing = false;
        logger.warn(
          `[resilientHttp] ${platform} probe failed (${statusOf(error)}) — circuit stays open`,
        );
        throw error;
      }

      const canRetry = attempt < maxRetries && isRetryable(error);
      if (!canRetry) break;

      const wait = backoffMs(error, attempt);
      logger.warn(
        `[resilientHttp] ${platform} attempt ${attempt + 1}/${maxRetries + 1} failed ` +
          `(${statusOf(error)}) — retrying in ${wait}ms`,
      );
      await sleep(wait);
    }
  }

  // Exhausted. Count it once per call, not once per attempt: three failed attempts are
  // one unhealthy observation, and counting per attempt would trip the breaker after two
  // bad calls instead of five.
  breaker.consecutiveFailures += 1;

  if (
    breaker.consecutiveFailures >= FAILURE_THRESHOLD &&
    breaker.openUntil === 0
  ) {
    breaker.openUntil = Date.now() + OPEN_DURATION_MS;
    logger.error(
      `[resilientHttp] circuit OPEN for ${platform} — ${breaker.consecutiveFailures} ` +
        `consecutive failures, skipping for ${OPEN_DURATION_MS / 1000}s. ` +
        `Last: ${statusOf(lastError)}`,
    );
  }

  throw lastError;
}

/** Convenience wrapper for the common case. */
export async function resilientGet<T = unknown>(
  url: string,
  options: Omit<ResilientRequestOptions, 'url' | 'method'>,
): Promise<AxiosResponse<T>> {
  return resilientRequest<T>({ ...options, url, method: 'GET' });
}

/** Convenience wrapper for form posts — OAuth token exchanges, mostly. */
export async function resilientPost<T = unknown>(
  url: string,
  data: unknown,
  options: Omit<ResilientRequestOptions, 'url' | 'method' | 'data'>,
): Promise<AxiosResponse<T>> {
  return resilientRequest<T>({ ...options, url, data, method: 'POST' });
}

/**
 * Current breaker state, for the integration-health endpoint and tests.
 *
 * Exposed because "why is this platform returning nothing" is the single most common
 * question about search, and an open circuit is an answer that is otherwise invisible.
 */
export function circuitSnapshot(): Array<{
  platform: string;
  consecutiveFailures: number;
  openForMs: number;
}> {
  const now = Date.now();
  return Array.from(breakers.entries()).map(([platform, state]) => ({
    platform,
    consecutiveFailures: state.consecutiveFailures,
    openForMs: Math.max(state.openUntil - now, 0),
  }));
}

/** Test seam only. Never call from application code. */
export function __resetCircuits(): void {
  breakers.clear();
}

export const __testables = {
  isRetryable,
  backoffMs,
  DEFAULT_TIMEOUT_MS,
  FAILURE_THRESHOLD,
  OPEN_DURATION_MS,
  MAX_BACKOFF_MS,
};
