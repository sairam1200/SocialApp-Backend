import Fuse from 'fuse.js';

function normalizeSearchTerm(query: string, possibleTerms: string[]): string {
  const normalized = query.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

  if (!possibleTerms || possibleTerms.length === 0) {
    return normalized;
  }

  const fuse = new Fuse(possibleTerms, { includeScore: true, threshold: 0.4 });
  const result = fuse.search(normalized);

  return result.length > 0 ? result[0].item : normalized;
}


export default {
  normalizeSearchTerm
}