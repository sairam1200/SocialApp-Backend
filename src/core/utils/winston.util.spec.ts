/**
 * The logger wrapper's `meta` handling.
 *
 * These tests exist because of a defect with the worst possible shape for a logger: it
 * looked like it was working. 86 call sites pass a bare `error` as `meta` — which reads
 * naturally, and which `catch (error: any)` lets through the compiler. The wrapper then
 * did `{ ...safeMeta }`, and **an Error spreads to `{}`** because `message` and `stack`
 * are non-enumerable. So those 86 sites logged a message with no cause attached, and the
 * gap was invisible: there was always a log line, just never a reason in it.
 *
 * Raw Winston special-cases an Error passed as meta. Spreading bypassed that, so the
 * special handling never ran.
 */

const transportWrites: any[] = [];

jest.mock('winston-daily-rotate-file', () => class {});

jest.mock('winston', () => {
  const actual = jest.requireActual('winston');
  return {
    ...actual,
    createLogger: () => ({
      // Capture what the wrapper hands the transports, which is the layer the bug lived in.
      error: (payload: any) =>
        transportWrites.push({ level: 'error', ...payload }),
      warn: (payload: any) =>
        transportWrites.push({ level: 'warn', ...payload }),
      info: (payload: any) =>
        transportWrites.push({ level: 'info', ...payload }),
      debug: (payload: any) =>
        transportWrites.push({ level: 'debug', ...payload }),
      http: (payload: any) =>
        transportWrites.push({ level: 'http', ...payload }),
      verbose: (payload: any) =>
        transportWrites.push({ level: 'verbose', ...payload }),
    }),
  };
});

import logger from './winston.util';

beforeEach(() => {
  transportWrites.length = 0;
});

/** The single most recent thing handed to a transport. */
function lastWrite(): any {
  return transportWrites[transportWrites.length - 1];
}

describe('an Error passed as meta', () => {
  it('keeps the reason, which used to be lost entirely', () => {
    logger.error(
      'Error fetching Spotify results:',
      new Error('Spotify is not configured') as never,
    );

    expect(lastWrite().reason).toBe('Spotify is not configured');
  });

  it('keeps the message as well as the reason', () => {
    // Both halves matter: the message says which integration, the reason says why.
    // Winston's own Error handling replaces the message with the stack, losing the first.
    logger.error('Error fetching Reddit results:', new Error('nope') as never);

    expect(lastWrite().message).toBe('Error fetching Reddit results:');
    expect(lastWrite().reason).toBe('nope');
  });

  it('keeps the stack, so the throw site is recoverable', () => {
    logger.error('boom', new Error('detonated') as never);
    expect(lastWrite().stack).toContain('detonated');
  });

  it('lifts the diagnostic fields off an axios-shaped error', () => {
    const axiosError = Object.assign(
      new Error('Request failed with status code 429'),
      {
        code: 'ERR_BAD_REQUEST',
        response: { status: 429, data: { message: 'rate limited' } },
      },
    );

    logger.error('platform call failed', axiosError as never);

    const write = lastWrite();
    expect(write.reason).toBe('Request failed with status code 429');
    expect(write.code).toBe('ERR_BAD_REQUEST');
    expect(write.status).toBe(429);
    expect(write.response).toEqual({ message: 'rate limited' });
  });

  it('does NOT copy the axios request config, which holds credentials', () => {
    // The reason Error fields are copied selectively rather than spread. `config.headers`
    // carries the Authorization header, and redaction is a second line of defence — not
    // writing a secret down at all is the stronger guarantee.
    const axiosError = Object.assign(new Error('failed'), {
      config: {
        headers: { Authorization: 'Bearer super-secret-token-value' },
        url: 'https://api.example.com',
      },
      request: {
        _header: 'GET / HTTP/1.1\nAuthorization: Bearer super-secret',
      },
      response: { status: 401, data: { error: 'invalid_token' } },
    });

    logger.error('auth failed', axiosError as never);

    const serialised = JSON.stringify(lastWrite());
    expect(serialised).not.toContain('super-secret-token-value');
    expect(serialised).not.toContain('super-secret');
    expect(lastWrite().config).toBeUndefined();
    expect(lastWrite().request).toBeUndefined();

    // The useful part still survives.
    expect(lastWrite().status).toBe(401);
  });
});

describe('a primitive passed as meta', () => {
  it('becomes a reason instead of indexed characters', () => {
    // Spreading a string yields {0:'a',1:'b',…}, which is noise rather than information.
    logger.error('Error fetching Reddit results:', 'not configured' as never);

    const write = lastWrite();
    expect(write.reason).toBe('not configured');
    expect(write['0']).toBeUndefined();
  });

  it('handles a number', () => {
    logger.warn('retry count', 3 as never);
    expect(lastWrite().reason).toBe('3');
  });
});

describe('a plain object passed as meta', () => {
  it('passes through unchanged, which is the intended usage', () => {
    logger.error('search failed', { platform: 'youtube', attempts: 3 });

    expect(lastWrite().platform).toBe('youtube');
    expect(lastWrite().attempts).toBe(3);
  });

  it('adds nothing to the line when empty', () => {
    // The default argument is `{}`, so almost every call in the codebase lands here.
    logger.info('service started');

    expect(lastWrite().message).toBe('service started');
    expect(Object.keys(lastWrite())).not.toContain('reason');
  });
});

describe('null and undefined meta', () => {
  it('are ignored rather than logged as a reason', () => {
    logger.error('something', undefined);
    expect(Object.keys(lastWrite())).not.toContain('reason');

    logger.error('something else', null as never);
    expect(Object.keys(lastWrite())).not.toContain('reason');
  });
});

describe('caller attribution', () => {
  it('attaches file and method fields to every write', () => {
    logger.error('traceable', new Error('x') as never);

    // Presence, not content. `getCallerInfo` derives these by parsing a stack trace, and
    // the frame layout under ts-jest differs from the compiled `dist/` output — so the
    // values are environment-dependent while the contract is not. Verified populated in a
    // real run: "| services/search.service.js -> SearchService.searchSpotifyAsync".
    const write = lastWrite();
    expect(write).toHaveProperty('file');
    expect(write).toHaveProperty('method');
  });
});
