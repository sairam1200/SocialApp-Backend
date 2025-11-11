import Fuse from 'fuse.js';

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
    new Set(
      (possibleTerms ?? [])
        .map(sanitizeTerm)
        .filter(Boolean),
    ),
  );

  if (uniqueCandidates.length === 0) {
    return sanitizedQuery;
  }

  if (maxCandidates && uniqueCandidates.length > maxCandidates) {
    uniqueCandidates.splice(maxCandidates);
  }

  const fuse = new Fuse(uniqueCandidates.map((term) => ({ term })), {
    keys: ['term'],
    includeScore: true,
    threshold,
    ignoreLocation,
    minMatchCharLength: 2,
    distance: 100,
  });

  const match = fuse.search(sanitizedQuery)[0];
  return match ? match.item.term : sanitizedQuery;
}

export { sanitizeTerm as sanitize, normalizeSearchTerm };

export default {
  normalizeSearchTerm,
  sanitize: sanitizeTerm,
};