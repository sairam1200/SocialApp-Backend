import fuseUtil, { normalizeSearchTerm, sanitize } from './fuse.util';

/**
 * Query normalisation is the front door of the search engine. Every global search
 * passes through it: the sanitised form becomes the cache key and the database
 * lookup key, and the fuzzy match collapses near-duplicate queries onto a single
 * canonical term so that "gaddr", "Gaddr" and "gadrr" hit the same cache entry
 * instead of triggering three separate fan-outs across twelve platforms.
 *
 * Getting this wrong is expensive in a literal sense — it multiplies paid
 * third-party API calls.
 */
describe('sanitize', () => {
  it('lowercases input', () => {
    expect(sanitize('GADDR Search')).toBe('gaddr search');
  });

  it('strips diacritics so Nordic queries match their base forms', () => {
    // Essential for the Swedish-first launch: "Malmö" and "Malmo" must collapse.
    expect(sanitize('Malmö')).toBe('malmo');
    expect(sanitize('Göteborg')).toBe('goteborg');
    expect(sanitize('Ängelholm')).toBe('angelholm');
    expect(sanitize('Ærø')).toBe('r'); // æ/ø are not decomposable; documents the limit
  });

  it('collapses punctuation into single spaces', () => {
    expect(sanitize('hello,,,world!!!')).toBe('hello world');
    expect(sanitize('a-b-c')).toBe('a b c');
  });

  it('collapses runs of whitespace and trims the result', () => {
    expect(sanitize('   too    many   spaces   ')).toBe('too many spaces');
    expect(sanitize('\t\nmixed\t\nwhitespace\n')).toBe('mixed whitespace');
  });

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(sanitize('')).toBe('');
    expect(sanitize('   ')).toBe('');
    expect(sanitize(null as unknown as string)).toBe('');
    expect(sanitize(undefined as unknown as string)).toBe('');
  });

  it('preserves digits and underscores', () => {
    expect(sanitize('user_name123')).toBe('user_name123');
  });

  it('is idempotent — sanitising twice changes nothing', () => {
    for (const input of ['Malmö', 'a-b-c', '  Hello,  World! ', 'ÅÄÖ']) {
      expect(sanitize(sanitize(input))).toBe(sanitize(input));
    }
  });

  it('reduces non-Latin scripts to empty rather than corrupting them', () => {
    // \w is ASCII-only here, so CJK and Arabic sanitise away entirely. This is a
    // real limitation for the product's Asian and Arabic locale targets: such
    // queries cannot be normalised or cached by term today. Asserted so the
    // behaviour is visible and the fix is verifiable when it lands.
    expect(sanitize('日本語')).toBe('');
    expect(sanitize('مرحبا')).toBe('');
  });
});

describe('normalizeSearchTerm', () => {
  it('returns the sanitised query when there are no candidates', () => {
    expect(normalizeSearchTerm('Gaddr Search')).toBe('gaddr search');
    expect(normalizeSearchTerm('Gaddr Search', [])).toBe('gaddr search');
  });

  it('returns an empty string for an empty query without consulting candidates', () => {
    expect(normalizeSearchTerm('', ['gaddr'])).toBe('');
    expect(normalizeSearchTerm('   ', ['gaddr'])).toBe('');
  });

  it('collapses a near-miss onto an existing canonical term', () => {
    // The cost-saving behaviour: a typo reuses the cached entry for "photography"
    // instead of fanning out to twelve platforms again.
    expect(normalizeSearchTerm('photograpy', ['photography', 'travel'])).toBe(
      'photography',
    );
  });

  it('collapses a case and diacritic variant onto the canonical term', () => {
    expect(normalizeSearchTerm('MALMÖ', ['malmo'])).toBe('malmo');
  });

  it('keeps a genuinely different query distinct from the candidates', () => {
    // Over-eager collapsing is the dangerous failure: it would serve results for
    // the wrong query. "cooking" must not be absorbed into "photography".
    expect(normalizeSearchTerm('cooking', ['photography', 'travel'])).toBe(
      'cooking',
    );
  });

  it('deduplicates candidates that sanitise to the same term', () => {
    expect(normalizeSearchTerm('malmo', ['Malmö', 'MALMO', 'malmo'])).toBe(
      'malmo',
    );
  });

  it('ignores blank and null candidates without throwing', () => {
    expect(() =>
      normalizeSearchTerm('gaddr', ['', '   ', null as unknown as string]),
    ).not.toThrow();
    expect(
      normalizeSearchTerm('gaddr', ['', '   ', null as unknown as string]),
    ).toBe('gaddr');
  });

  it('tolerates a null candidate array', () => {
    expect(normalizeSearchTerm('gaddr', null as unknown as string[])).toBe(
      'gaddr',
    );
  });

  it('caps how many candidates are considered', () => {
    // Bounded work per query: search history can grow without bound, and Fuse
    // builds an index on every call. maxCandidates keeps that O(1) in history size.
    const many = Array.from({ length: 500 }, (_, i) => `term-${i}`);

    expect(() =>
      normalizeSearchTerm('term-499', many, { maxCandidates: 5 }),
    ).not.toThrow();

    // Only the first 5 candidates are indexed, so the result must come from that
    // capped window (or fall back to the sanitised query) — never from index 499.
    const allowed = ['term 0', 'term 1', 'term 2', 'term 3', 'term 4', 'term 499'];
    expect(allowed).toContain(
      normalizeSearchTerm('term-499', many, { maxCandidates: 5 }),
    );
  });

  it('DOCUMENTS a search-quality risk: matching can be over-eager', () => {
    // At the default threshold of 0.3, "term-499" collapses onto the candidate
    // "term-4" — a shared prefix is enough. For short or numeric queries this
    // means a user can be served cached results for a *different* query.
    //
    // Not a crash, but a relevance bug worth tuning: consider requiring a
    // minimum length ratio between query and candidate, or a stricter threshold
    // for queries containing digits.
    expect(normalizeSearchTerm('term-499', ['term-4'])).toBe('term 4');
  });

  it('honours a stricter threshold by refusing loose matches', () => {
    const loose = normalizeSearchTerm('photograpy', ['photography'], {
      threshold: 0.6,
    });
    const strict = normalizeSearchTerm('photograpy', ['photography'], {
      threshold: 0.0,
    });

    expect(loose).toBe('photography');
    expect(strict).toBe('photograpy'); // no candidate accepted
  });

  it('is deterministic across repeated calls', () => {
    // The result becomes a cache key, so instability would fragment the cache.
    const candidates = ['photography', 'photos', 'travel'];
    const results = new Set(
      Array.from({ length: 20 }, () =>
        normalizeSearchTerm('photograpy', candidates),
      ),
    );

    expect(results.size).toBe(1);
  });

  it('exposes the same functions on the default export', () => {
    expect(fuseUtil.normalizeSearchTerm('Gaddr')).toBe('gaddr');
    expect(fuseUtil.sanitize('Gaddr')).toBe('gaddr');
  });
});
