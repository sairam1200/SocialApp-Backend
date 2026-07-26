import * as fs from 'fs';
import * as glob from 'path';
import { containsPattern, escapeLikePattern } from './likePattern.util';

/**
 * LIKE-pattern escaping.
 *
 * Measured against the live aggregated-search endpoint before this existed, on a table of
 * 72 rows:
 *
 *   keyword=%              -> 50 results (the page limit) — everything
 *   keyword=_              -> 50 results
 *   keyword=zzzzzznomatch  ->  0 results
 *
 * And after:
 *
 *   keyword=%    -> 0     keyword=_ -> 0     keyword=jazz -> 20 (unchanged)
 *
 * Parameterisation prevents SQL injection and every one of these queries was correctly
 * parameterised. It does nothing about a bound value being *used as a pattern*, which is a
 * separate class of bug.
 */

describe('escapeLikePattern', () => {
  it('escapes the wildcards that made a search match everything', () => {
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('_')).toBe('\\_');
    expect(escapeLikePattern('%%%')).toBe('\\%\\%\\%');
  });

  it('escapes the escape character itself', () => {
    expect(escapeLikePattern('\\')).toBe('\\\\');
  });

  it('escapes the backslash before the wildcards, not after', () => {
    // A single left-to-right pass over one character class gets this right. Two passes
    // (`%` then `\`) would escape the backslashes it had just inserted and corrupt the
    // pattern — which is why this is one regex and not two replaces.
    expect(escapeLikePattern('\\%')).toBe('\\\\\\%');
    expect(escapeLikePattern('50\\%_off')).toBe('50\\\\\\%\\_off');
  });

  it('leaves ordinary text completely alone', () => {
    // The escaping must be invisible for real queries — a regression here would silently
    // break every search rather than one edge case.
    for (const term of [
      'jazz piano',
      'rust programming',
      "O'Brien",
      'café münchen 日本語',
      'C++ / C#',
      'user@example.com',
      'a-b_c'.replace('_', '-'),
    ]) {
      expect(escapeLikePattern(term)).toBe(term);
    }
  });

  it('handles an empty string without producing a match-all pattern', () => {
    expect(escapeLikePattern('')).toBe('');
    // '%%' is a match-all, which is why callers must still reject blank keywords upstream —
    // the endpoint returns 400 for an empty or whitespace-only query.
    expect(containsPattern('')).toBe('%%');
  });

  it('keeps SQL metacharacters as data, since parameterisation handles them', () => {
    // Quotes and semicolons are *not* escaped here on purpose. Escaping them would be
    // cargo-culting: they are already safe as bound parameters, and mangling them would
    // break legitimate searches like "O'Brien". Verified live — a DROP TABLE payload
    // returned 200 and left all 72 rows intact.
    expect(escapeLikePattern("'; DROP TABLE x; --")).toBe(
      "'; DROP TABLE x; --",
    );
  });
});

describe('containsPattern', () => {
  it('wraps an escaped term in wildcards', () => {
    expect(containsPattern('jazz')).toBe('%jazz%');
    expect(containsPattern('100%')).toBe('%100\\%%');
  });

  it('cannot be turned into a match-all by the search term', () => {
    // The actual defect: the user's `%` used to become a wildcard in the built pattern.
    const pattern = containsPattern('%');
    expect(pattern).toBe('%\\%%');
    // Exactly two unescaped wildcards — the ones the helper added.
    expect(pattern.replace(/\\./g, '').match(/%/g)).toHaveLength(2);
  });
});

describe('every user-input LIKE site uses the helper', () => {
  // The reason this is a shared helper rather than a remembered rule: twelve sites built a
  // `%term%` pattern by hand and only two escaped. This test fails when a thirteenth
  // appears.
  const REPOSITORY_DIR = glob.join(
    __dirname,
    '../../infrastructure/repositories',
  );

  it('leaves no hand-built pattern from an unescaped variable', () => {
    const offenders: string[] = [];

    for (const file of fs.readdirSync(REPOSITORY_DIR)) {
      if (!file.endsWith('.repository.ts')) continue;
      const source = fs.readFileSync(glob.join(REPOSITORY_DIR, file), 'utf-8');

      source.split('\n').forEach((line, index) => {
        // `%${…}%` built inline. Allowed only when the interpolated expression is itself an
        // escape call, or when it is a known-safe internal constant.
        const match = line.match(/`%\$\{([^}]+)\}%`/);
        if (!match) return;
        const expression = match[1];
        if (/escapeLikePattern|containsPattern/.test(expression)) return;
        // manualProfile maps over KNOWN_PLATFORMS_URIS, which is our own constant list.
        if (/KNOWN_PLATFORMS_URIS|_const\./.test(line)) return;
        offenders.push(`${file}:${index + 1} -> ${expression}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
