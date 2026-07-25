import axios from 'axios';
import {
  CircuitOpenError,
  circuitSnapshot,
  resilientGet,
  __resetCircuits,
  __testables,
} from './resilientHttp.util';

jest.mock('./winston.util', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  // `request` is stubbed; everything else stays real. AxiosError in particular must be the
  // genuine class, or `isAxiosError` cannot recognise the errors these tests construct and
  // every retry decision would be tested against the wrong type.
  return {
    __esModule: true,
    default: {
      request: jest.fn(),
      isAxiosError: actual.isAxiosError,
      AxiosError: actual.AxiosError,
    },
    isAxiosError: actual.isAxiosError,
    AxiosError: actual.AxiosError,
  };
});

const mockedRequest = axios.request as jest.MockedFunction<
  typeof axios.request
>;
const { isRetryable, backoffMs, FAILURE_THRESHOLD, DEFAULT_TIMEOUT_MS } =
  __testables;

/** An AxiosError with a response, as axios itself would construct it. */
function httpError(status: number, headers: Record<string, string> = {}) {
  const error = new axios.AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    { status, statusText: '', headers, config: {} as never, data: {} } as never,
  );
  return error;
}

/** A transport failure — no response at all. */
function networkError(code = 'ECONNABORTED') {
  return new axios.AxiosError('timeout of 8000ms exceeded', code);
}

function ok(data: unknown = { ok: true }) {
  return {
    status: 200,
    data,
    headers: {},
    statusText: 'OK',
    config: {} as never,
  };
}

beforeEach(() => {
  __resetCircuits();
  mockedRequest.mockReset();
  jest.spyOn(Math, 'random').mockReturnValue(0); // backoff -> 0ms, so tests stay fast
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('timeout', () => {
  it('applies a default timeout, because axios has none', () => {
    // The reason this whole module exists: without a timeout a platform that accepts a
    // connection and never answers holds the request open indefinitely.
    mockedRequest.mockResolvedValueOnce(ok() as never);

    return resilientGet('https://api.example.com/x', { platform: 'test' }).then(
      () => {
        expect(mockedRequest).toHaveBeenCalledWith(
          expect.objectContaining({ timeout: DEFAULT_TIMEOUT_MS }),
        );
      },
    );
  });

  it('lets a caller tighten the timeout but never removes it', async () => {
    mockedRequest.mockResolvedValueOnce(ok() as never);

    await resilientGet('https://api.example.com/x', {
      platform: 'test',
      timeout: 1_500,
    });

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 1_500 }),
    );
  });
});

describe('isRetryable', () => {
  it('retries transport failures, where a second attempt can genuinely differ', () => {
    expect(isRetryable(networkError('ECONNABORTED'))).toBe(true);
    expect(isRetryable(networkError('ECONNRESET'))).toBe(true);
    expect(isRetryable(networkError('ENOTFOUND'))).toBe(true);
  });

  it('retries 429 and 5xx', () => {
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(500))).toBe(true);
    expect(isRetryable(httpError(503))).toBe(true);
  });

  it('does NOT retry a 4xx that is a definite answer', () => {
    // The important half. A 401 will not fix itself on attempt two, and YouTube allows
    // ~100 searches a day — a retry storm against an expired key spends the whole budget
    // on errors. Pinterest's 2FA block and Reddit's 403 are both permanent this way.
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryable(httpError(status))).toBe(false);
    }
  });

  it('does not retry a non-axios error, which is a bug in our own code', () => {
    expect(isRetryable(new TypeError('undefined is not a function'))).toBe(
      false,
    );
  });
});

describe('backoff', () => {
  it('honours Retry-After in seconds, because that is the platform stating its terms', () => {
    expect(backoffMs(httpError(429, { 'retry-after': '2' }), 0)).toBe(2000);
  });

  it('honours an HTTP-date Retry-After', () => {
    const twoSeconds = new Date(Date.now() + 2000).toUTCString();
    const wait = backoffMs(httpError(429, { 'retry-after': twoSeconds }), 0);
    // Second-granularity date, so allow a small window.
    expect(wait).toBeGreaterThan(500);
    expect(wait).toBeLessThanOrEqual(2000);
  });

  it('caps Retry-After so one rude platform cannot stall a whole search', () => {
    expect(backoffMs(httpError(429, { 'retry-after': '3600' }), 0)).toBe(
      __testables.MAX_BACKOFF_MS,
    );
  });

  it('ignores an unparseable Retry-After rather than treating it as zero', () => {
    // Falling back to 0 would hammer the platform that just asked us to wait.
    jest.spyOn(Math, 'random').mockReturnValue(1);
    expect(
      backoffMs(httpError(429, { 'retry-after': 'soon' }), 0),
    ).toBeGreaterThan(0);
  });

  it('grows exponentially and applies full jitter', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1); // full window
    expect(backoffMs(networkError(), 0)).toBe(250);
    expect(backoffMs(networkError(), 1)).toBe(500);
    expect(backoffMs(networkError(), 2)).toBe(1000);

    // Full jitter means the *whole* window is in play, not a fixed step plus a wobble.
    // Backoff without it synchronises every retrying caller into a burst exactly when the
    // platform is recovering.
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(backoffMs(networkError(), 2)).toBe(0);
  });
});

describe('retry', () => {
  it('succeeds on a retry after a transient failure', async () => {
    mockedRequest
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce(ok({ recovered: true }) as never);

    const response = await resilientGet('https://api.example.com/x', {
      platform: 'test',
    });

    expect(response.data).toEqual({ recovered: true });
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it('makes exactly maxRetries + 1 attempts before giving up', async () => {
    mockedRequest.mockRejectedValue(httpError(500));

    await expect(
      resilientGet('https://api.example.com/x', {
        platform: 'test',
        maxRetries: 2,
      }),
    ).rejects.toThrow();

    expect(mockedRequest).toHaveBeenCalledTimes(3);
  });

  it('does not retry a permanent failure at all', async () => {
    mockedRequest.mockRejectedValue(httpError(401));

    await expect(
      resilientGet('https://api.example.com/x', { platform: 'test' }),
    ).rejects.toThrow();

    // One attempt. Anything more is wasted quota.
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });
});

describe('circuit breaker', () => {
  async function failOnce(platform: string, status = 500) {
    mockedRequest.mockRejectedValue(httpError(status));
    await expect(
      resilientGet('https://api.example.com/x', { platform, maxRetries: 0 }),
    ).rejects.toThrow();
  }

  it('counts one failure per call, not per attempt', async () => {
    // Three failed attempts are one unhealthy observation. Counting per attempt would
    // trip the breaker after two bad calls instead of five.
    mockedRequest.mockRejectedValue(httpError(500));

    await expect(
      resilientGet('https://api.example.com/x', {
        platform: 'test',
        maxRetries: 2,
      }),
    ).rejects.toThrow();

    expect(
      circuitSnapshot().find((s) => s.platform === 'test')?.consecutiveFailures,
    ).toBe(1);
  });

  it('opens after the threshold and then costs no request at all', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await failOnce('flaky');

    expect(mockedRequest).toHaveBeenCalledTimes(FAILURE_THRESHOLD);
    mockedRequest.mockClear();

    // The payoff: a dead platform stops costing a full timeout on every search.
    await expect(
      resilientGet('https://api.example.com/x', { platform: 'flaky' }),
    ).rejects.toBeInstanceOf(CircuitOpenError);

    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it('reports how long it is skipping the platform for', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await failOnce('flaky');

    const snapshot = circuitSnapshot().find((s) => s.platform === 'flaky');
    expect(snapshot?.openForMs).toBeGreaterThan(0);
    expect(snapshot?.openForMs).toBeLessThanOrEqual(
      __testables.OPEN_DURATION_MS,
    );
  });

  it('isolates platforms — a dead Reddit must not stop YouTube', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await failOnce('reddit');

    mockedRequest.mockReset();
    mockedRequest.mockResolvedValueOnce(ok({ items: [] }) as never);

    // The single most important property here. A global breaker would take the whole
    // product down whenever one integration's credentials lapsed.
    await expect(
      resilientGet('https://youtube.example.com/x', { platform: 'youtube' }),
    ).resolves.toMatchObject({ status: 200 });

    await expect(
      resilientGet('https://reddit.example.com/x', { platform: 'reddit' }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('closes again when a trial request succeeds after the cooldown', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await failOnce('recovering');

    // Advance past the cooldown rather than waiting a real minute.
    const realNow = Date.now();
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(realNow + __testables.OPEN_DURATION_MS + 1);

    mockedRequest.mockReset();
    mockedRequest.mockResolvedValueOnce(ok({ back: true }) as never);

    const response = await resilientGet('https://api.example.com/x', {
      platform: 'recovering',
    });
    expect(response.data).toEqual({ back: true });

    const snapshot = circuitSnapshot().find((s) => s.platform === 'recovering');
    expect(snapshot?.consecutiveFailures).toBe(0);
    expect(snapshot?.openForMs).toBe(0);
  });

  it('re-opens without retrying when the trial request fails', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) await failOnce('still-down');

    const realNow = Date.now();
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(realNow + __testables.OPEN_DURATION_MS + 1);

    mockedRequest.mockReset();
    mockedRequest.mockRejectedValue(httpError(503));

    await expect(
      resilientGet('https://api.example.com/x', {
        platform: 'still-down',
        maxRetries: 2,
      }),
    ).rejects.toThrow();

    // Exactly one attempt: a probe does not retry. Otherwise a platform that is still
    // down costs three requests per cooldown instead of one.
    expect(mockedRequest).toHaveBeenCalledTimes(1);

    const snapshot = circuitSnapshot().find((s) => s.platform === 'still-down');
    expect(snapshot?.openForMs).toBeGreaterThan(0);
  });

  it('resets the failure count on any success, so blips do not accumulate', async () => {
    await failOnce('intermittent');
    await failOnce('intermittent');

    mockedRequest.mockReset();
    mockedRequest.mockResolvedValueOnce(ok() as never);
    await resilientGet('https://api.example.com/x', {
      platform: 'intermittent',
    });

    expect(
      circuitSnapshot().find((s) => s.platform === 'intermittent')
        ?.consecutiveFailures,
    ).toBe(0);
  });
});
