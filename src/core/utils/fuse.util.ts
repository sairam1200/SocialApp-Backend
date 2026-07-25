/**
 * Do NOT change this back to `import Fuse from 'fuse.js'`.
 *
 * fuse.js declares `export = Fuse`, and its CommonJS build sets
 * `module.exports = Fuse` — so `require('fuse.js')` returns the constructor
 * directly, with no `.default` property.
 *
 * This tsconfig targets `module: commonjs` with `allowSyntheticDefaultImports`
 * but WITHOUT `esModuleInterop`. That combination silences the *type* error on a
 * default import while still emitting `new fuse_js_1.default(...)` — which is
 * `undefined is not a constructor` at runtime.
 *
 * The effect was a live 500 on global search. normalizeSearchTerm only reaches
 * `new Fuse(...)` when candidate terms exist, so search worked against an empty
 * search history and started failing once users accumulated one, which is why it
 * survived review.
 *
 * `import X = require(...)` is the correct form for an `export =` module under
 * commonjs; main.ts uses the same pattern for cookie-parser.
 */
import Fuse = require('fuse.js');

type NormalizeOptions = {
  threshold?: number;
  ignoreLocation?: boolean;
  maxCandidates?: number;
};

const DEFAULT_OPTIONS: Required<NormalizeOptions> = {
  threshold: 0.3,
  ignoreLocation: true,
  maxCandidates: 25,
};

function sanitizeTerm(value: string): string {
  if (!value) {
    return '';
  }

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSearchTerm(
  query: string,
  possibleTerms: string[] = [],
  options: NormalizeOptions = {},
): string {
  const sanitizedQuery = sanitizeTerm(query);
  if (!sanitizedQuery) {
    return '';
  }

  const { threshold, ignoreLocation, maxCandidates } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const uniqueCandidates = Array.from(
    new Set((possibleTerms ?? []).map(sanitizeTerm).filter(Boolean)),
  );

  if (uniqueCandidates.length === 0) {
    return sanitizedQuery;
  }

  if (maxCandidates && uniqueCandidates.length > maxCandidates) {
    uniqueCandidates.splice(maxCandidates);
  }

  const fuse = new Fuse(
    uniqueCandidates.map((term) => ({ term })),
    {
      keys: ['term'],
      includeScore: true,
      threshold,
      ignoreLocation,
      minMatchCharLength: 2,
      distance: 100,
    },
  );

  const match = fuse.search(sanitizedQuery)[0];
  return match ? match.item.term : sanitizedQuery;
}

export { sanitizeTerm as sanitize, normalizeSearchTerm };

export default {
  normalizeSearchTerm,
  sanitize: sanitizeTerm,
};
