import * as fs from 'fs';
import * as path from 'path';
import _const from './const';

/**
 * Guards the search fan-out list against drift.
 *
 * `SEARCHABLE_PLATFORMS` decides which platforms a global search dispatches to. It used
 * to be `Object.values(PLATFORMS)`, which also covers identity linking and OAuth and
 * includes twitch, github and discord — none of which have a search implementation. The
 * result was that every unfiltered search returned three
 * `Unsupported platform: …` entries in `results` that clients had to know to ignore.
 *
 * The two tests below close that loop from both directions by reading the handler
 * source: no platform is dispatched without an implementation, and no implemented
 * platform is silently left out of the fan-out.
 */

const HANDLER_PATH = path.join(
  __dirname,
  '../../features/search/search.handler.ts',
);
const handlerSource = fs.readFileSync(HANDLER_PATH, 'utf-8');

/** Platform keys that `searchPlatformOptimized` has a `case` for. */
function dispatchedPlatformKeys(): string[] {
  return Array.from(
    handlerSource.matchAll(/case\s+_const\.PLATFORMS\.([A-Z_]+):/g),
    (match) => match[1],
  );
}

describe('SEARCHABLE_PLATFORMS', () => {
  it('contains only platforms the handler can dispatch', () => {
    const dispatched = new Set(
      dispatchedPlatformKeys().map(
        (key) => (_const.PLATFORMS as Record<string, string>)[key],
      ),
    );

    const undispatchable = _const.SEARCHABLE_PLATFORMS.filter(
      (platform) => !dispatched.has(platform),
    );

    // A platform here without a dispatch case produces an "Unsupported platform" error
    // on every search that does not explicitly filter it out.
    expect(undispatchable).toEqual([]);
  });

  it('includes every platform the handler can dispatch', () => {
    // The other direction: implementing a search method and forgetting this list means
    // the platform is never queried unless a caller names it explicitly — a silent
    // omission rather than a visible error, which is worse.
    const searchable = new Set(_const.SEARCHABLE_PLATFORMS);

    const missing = dispatchedPlatformKeys()
      .map((key) => (_const.PLATFORMS as Record<string, string>)[key])
      .filter((platform) => !searchable.has(platform));

    expect(missing).toEqual([]);
  });

  it('excludes the platforms that exist only for identity linking', () => {
    // twitch, github and discord are legitimate PLATFORMS entries — users link those
    // accounts — but there is no search API integration for any of them.
    for (const platform of [
      _const.PLATFORMS.TWITCH,
      _const.PLATFORMS.GITHUB,
      _const.PLATFORMS.DISCORD,
    ]) {
      expect(_const.SEARCHABLE_PLATFORMS).not.toContain(platform);
    }
  });

  it('has no duplicates', () => {
    // A duplicate would fan out twice and double the third-party API spend for that
    // platform on every search.
    expect(new Set(_const.SEARCHABLE_PLATFORMS).size).toBe(
      _const.SEARCHABLE_PLATFORMS.length,
    );
  });

  it('names only values that exist in PLATFORMS', () => {
    // Catches a typo, which would otherwise fall through to the default branch and
    // surface as an "Unsupported platform" error rather than a build failure.
    const known = new Set(Object.values(_const.PLATFORMS));

    // Jest's expect() takes no message argument, so surface the offender by asserting
    // on the filtered list rather than per item.
    const unknown = _const.SEARCHABLE_PLATFORMS.filter((p) => !known.has(p));
    expect(unknown).toEqual([]);
  });
});
