import { idf, SparseVector, toSparseVector } from './ranking-math';

/**
 * Text handling for posts: tokenising, entity extraction, topic inference and
 * the search document.
 *
 * No NLP dependency. `natural` and `wink-nlp` were both considered — MIT, both
 * fine — but each pulls in megabytes of corpora for a stemmer and a stop-word
 * list, and this container has 512 MB. What we actually need is 60 lines, so
 * that is what this is.
 */

/**
 * Stop words for the two locales that matter today (`sv` is the default
 * locale, `en` the fallback). Deliberately short: an over-eager stop list
 * strips meaning, and rare words are already down-weighted by IDF.
 */
const STOP_WORDS = new Set([
  // English
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'not',
  'of',
  'on',
  'or',
  'our',
  'she',
  'so',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'which',
  'who',
  'will',
  'with',
  'you',
  'your',
  // Swedish
  'att',
  'av',
  'de',
  'den',
  'det',
  'du',
  'efter',
  'eller',
  'en',
  'ett',
  'för',
  'han',
  'hon',
  'här',
  'inte',
  'jag',
  'kan',
  'med',
  'men',
  'mig',
  'och',
  'om',
  'på',
  'sig',
  'som',
  'till',
  'var',
  'vi',
  'är',
  'över',
]);

/** Split text into lowercase tokens, dropping stop words and one-char noise. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length > 1 && t.length < 40 && !STOP_WORDS.has(t));
}

/** `#hashtags`, lowercased and de-duplicated, capped so a post cannot spam. */
export function extractHashtags(text: string, limit = 20): string[] {
  if (!text) return [];
  const found = text.match(/#[\p{L}\p{N}_]{1,50}/gu) ?? [];
  return Array.from(new Set(found.map((t) => t.slice(1).toLowerCase()))).slice(
    0,
    limit,
  );
}

/** `@handles` referenced in the body, lowercased and de-duplicated. */
export function extractMentions(text: string, limit = 30): string[] {
  if (!text) return [];
  const found = text.match(/@[a-z0-9_.]{2,64}/gi) ?? [];
  return Array.from(new Set(found.map((t) => t.slice(1).toLowerCase()))).slice(
    0,
    limit,
  );
}

/** First URL in the body — the one we resolve into a link preview. */
export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0] : null;
}

/**
 * Build the denormalised search document.
 *
 * Written explicitly at insert time rather than defaulted in the column,
 * because a bulk INSERT that names its columns skips defaults — that is
 * exactly how `contentStreams.searchText` ended up NULL on every row. See
 * `AGENTS.md`.
 */
export function buildSearchText(parts: {
  body?: string | null;
  tags?: string[];
  topics?: string[];
  authorHandle?: string;
  authorName?: string;
  title?: string;
}): string {
  return [
    parts.title,
    parts.body,
    parts.authorHandle ? `@${parts.authorHandle}` : null,
    parts.authorName,
    ...(parts.tags ?? []),
    ...(parts.topics ?? []),
  ]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' ')
    .slice(0, 8000);
}

/**
 * Infer topic slugs from free text against a known topic vocabulary.
 *
 * Substring matching on a curated vocabulary rather than a classifier: the
 * vocabulary is the same `identity.topics` table onboarding already populates,
 * it is auditable, and it costs nothing at write time. A learned classifier
 * is a reasonable upgrade later — it would slot in behind this signature.
 */
export function inferTopics(
  text: string,
  vocabulary: Array<{ slug: string; label: string; aliases?: string[] }>,
  limit = 8,
): string[] {
  const tokens = new Set(tokenize(text));
  if (tokens.size === 0) return [];

  const scored: Array<{ slug: string; hits: number }> = [];
  for (const topic of vocabulary) {
    const terms = [topic.slug, topic.label, ...(topic.aliases ?? [])];
    let hits = 0;
    for (const term of terms) {
      for (const part of tokenize(term)) {
        if (tokens.has(part)) hits += 1;
      }
    }
    if (hits > 0) scored.push({ slug: topic.slug, hits });
  }

  return scored
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((s) => s.slug);
}

/**
 * TF-IDF vector over a document's terms.
 *
 * `documentFrequencies` is a term → document-count map maintained by the
 * indexer. Passing it in rather than querying keeps this pure and lets the
 * caller cache the map, which is the expensive part.
 */
export function tfidfVector(
  terms: string[],
  documentFrequencies: Map<string, number>,
  documentCount: number,
): SparseVector {
  const termFrequencies = new Map<string, number>();
  for (const term of terms) {
    termFrequencies.set(term, (termFrequencies.get(term) ?? 0) + 1);
  }

  const vector: SparseVector = new Map();
  const maxFrequency = Math.max(1, ...termFrequencies.values());
  for (const [term, frequency] of termFrequencies) {
    // Augmented TF, which keeps a long document from dominating on length alone.
    const tf = 0.5 + (0.5 * frequency) / maxFrequency;
    vector.set(
      term,
      tf * idf(documentCount, documentFrequencies.get(term) ?? 0),
    );
  }
  return vector;
}

/**
 * Topic vector for a post or a profile.
 *
 * Explicit topics are trusted more than inferred hashtags, which are in turn
 * trusted more than body terms — the weights encode that ordering.
 */
export function topicVector(input: {
  topics?: string[];
  tags?: string[];
  body?: string | null;
}): SparseVector {
  const vector = toSparseVector(input.topics ?? [], () => 1);
  for (const tag of input.tags ?? []) {
    const key = tag.toLowerCase();
    vector.set(key, (vector.get(key) ?? 0) + 0.6);
  }
  for (const token of tokenize(input.body ?? '')) {
    vector.set(token, (vector.get(token) ?? 0) + 0.15);
  }
  return vector;
}

/**
 * Trim text to a length without cutting mid-word, for previews and metadata
 * descriptions.
 */
export function summarise(text: string, maxLength = 160): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  const cut = clean.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Normalise a user-chosen handle: lowercase, ASCII-safe, no leading digit-only
 * forms that could be confused with an id.
 */
export function normaliseHandle(raw: string): string {
  return (raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 64);
}

/**
 * Normalise a topic name into the slug stored on posts and profiles.
 *
 * The same function must be used everywhere a topic is written, or the
 * `topics && topics` overlap operator quietly matches nothing — "Machine
 * Learning" and "machine-learning" are different strings to Postgres.
 */
export function slugifyTopic(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
