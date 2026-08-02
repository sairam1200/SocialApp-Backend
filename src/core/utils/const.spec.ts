import _const from './const';

/**
 * Guards the search fan-out list against drift.
 *
 * `SEARCHABLE_PLATFORMS` decides which platforms a global search dispatches to.
 * This test verifies the list is correct and complete.
 */

describe('SEARCHABLE_PLATFORMS', () => {
  it('contains only platforms that exist in PLATFORMS', () => {
    const known = new Set(Object.values(_const.PLATFORMS));
    const unknown = _const.SEARCHABLE_PLATFORMS.filter((p) => !known.has(p));
    expect(unknown).toEqual([]);
  });

  it('excludes the platforms that exist only for identity linking', () => {
    // twitch and discord are legitimate PLATFORMS entries — users link those accounts —
    // but neither has a search API integration.
    for (const platform of [
      _const.PLATFORMS.TWITCH,
      _const.PLATFORMS.DISCORD,
    ]) {
      expect(_const.SEARCHABLE_PLATFORMS).not.toContain(platform);
    }
  });

  it('includes every platform that needs no credential', () => {
    // These work with no API key at all, which makes them the integrations most
    // likely to still be returning data a year from now.
    for (const platform of [
      _const.PLATFORMS.GITHUB,
      _const.PLATFORMS.APPLE,
      _const.PLATFORMS.OPENVERSE,
      _const.PLATFORMS.HACKERNEWS,
    ]) {
      expect(_const.SEARCHABLE_PLATFORMS).toContain(platform);
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

    const unknown = _const.SEARCHABLE_PLATFORMS.filter((p) => !known.has(p));
    expect(unknown).toEqual([]);
  });
});
