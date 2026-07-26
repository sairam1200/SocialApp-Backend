/**
 * Pure ranking mathematics.
 *
 * Nothing here touches Nest, the database or the clock unless a time is passed
 * in. That is deliberate: these are the functions whose behaviour has to be
 * provable, and a function you can call from a unit test with three numbers is
 * provable in a way that a method on an injected service is not.
 *
 * Sources for each formula are named inline. Implementations are ours; only
 * the mathematics is borrowed, so there is no licence to carry.
 */

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Logistic squash into (0, 1).
 *
 * Used to turn an unbounded linear score into something comparable across
 * candidate kinds — a post's score and a creator's score have to be blendable.
 */
export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/**
 * Diminishing-returns normalisation for count-like signals.
 *
 * `log1p(n) / log1p(saturation)` maps 0 → 0 and `saturation` → 1, then keeps
 * growing slowly beyond it. Raw counts would let one viral post dominate every
 * feed for a week; this makes the 1000th like worth far less than the 10th.
 */
export function logSaturate(count: number, saturation: number): number {
  if (count <= 0) return 0;
  const denominator = Math.log1p(Math.max(1, saturation));
  return Math.log1p(count) / denominator;
}

/**
 * Exponential recency decay with a half-life.
 *
 * `halfLifeHours` is the time after which a post keeps half its freshness.
 * Preferred over Hacker News' `(t+2)^gravity` because a half-life is a number
 * a product decision can be made about — "posts stay fresh for about a day" is
 * `halfLifeHours: 24`, whereas a gravity exponent means nothing to anyone.
 */
export function recencyDecay(ageHours: number, halfLifeHours: number): number {
  if (halfLifeHours <= 0) return 1;
  const age = Math.max(0, ageHours);
  return Math.pow(0.5, age / halfLifeHours);
}

/** Hours between two instants, never negative. */
export function ageInHours(then: Date | string | number, now: Date): number {
  const thenMs =
    then instanceof Date
      ? then.getTime()
      : typeof then === 'number'
        ? then
        : new Date(then).getTime();
  if (!Number.isFinite(thenMs)) return 0;
  return Math.max(0, (now.getTime() - thenMs) / 3_600_000);
}

/**
 * Lower bound of the Wilson score interval for a Bernoulli parameter.
 *
 * Reddit's "best" comment sort. It answers "given `positive` successes out of
 * `total` trials, what is the engagement rate we can be 95% confident is at
 * least this high" — so a post at 3/3 does not outrank a post at 900/1000.
 *
 * `z` defaults to 1.96 (95% confidence, two-tailed).
 */
export function wilsonLowerBound(
  positive: number,
  total: number,
  z = 1.96,
): number {
  if (total <= 0) return 0;
  const p = clamp(positive / total, 0, 1);
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return clamp((centre - margin) / denominator, 0, 1);
}

/**
 * Deterministic 32-bit string hash (FNV-1a).
 *
 * Used by the hashing vectoriser. Chosen over a cryptographic hash because it
 * is fast, dependency-free and the only property needed is a good spread —
 * collisions merely blur two topics together, they do not break anything.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in range without BigInt.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A sparse term vector: term → weight. Sparse rather than dense because a post
 * has a dozen topics and the vocabulary has thousands, so a dense array would
 * be 99.9% zeros and the dot product would spend all its time on them.
 */
export type SparseVector = Map<string, number>;

/** Build a sparse vector from terms, with optional per-term weights. */
export function toSparseVector(
  terms: Iterable<string>,
  weightOf: (term: string) => number = () => 1,
): SparseVector {
  const vector: SparseVector = new Map();
  for (const term of terms) {
    if (!term) continue;
    const key = term.toLowerCase();
    vector.set(key, (vector.get(key) ?? 0) + weightOf(key));
  }
  return vector;
}

/** Euclidean norm of a sparse vector. */
export function norm(vector: SparseVector): number {
  let sum = 0;
  for (const value of vector.values()) sum += value * value;
  return Math.sqrt(sum);
}

/**
 * Cosine similarity of two sparse vectors, in [0, 1] for non-negative weights.
 *
 * Iterates the smaller vector, so the cost is O(min(|a|, |b|)) rather than
 * O(|vocabulary|).
 */
export function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, value] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += value * other;
  }
  if (dot === 0) return 0;
  const denominator = norm(a) * norm(b);
  return denominator === 0 ? 0 : clamp(dot / denominator, 0, 1);
}

/**
 * Inverse document frequency, smoothed.
 *
 * `idf(t) = ln(1 + (N - n_t + 0.5) / (n_t + 0.5))` — the BM25 form, which
 * stays positive for terms present in every document instead of going negative
 * the way the textbook `ln(N/n_t)` does.
 */
export function idf(documentCount: number, termDocumentCount: number): number {
  const n = Math.max(0, termDocumentCount);
  const total = Math.max(1, documentCount);
  return Math.log(1 + (total - n + 0.5) / (n + 0.5));
}

/**
 * Jaccard similarity of two sets. Cheap topical overlap where a weighted
 * vector would be more precision than the data supports.
 */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const setA = new Set(Array.from(a, (t) => t.toLowerCase()));
  const setB = new Set(Array.from(b, (t) => t.toLowerCase()));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Decay an accumulated affinity toward zero given elapsed time.
 *
 * Applied on write rather than by a sweep job, so an affinity is always
 * correct when read and there is no schedule to fall behind.
 */
export function decayAffinity(
  weight: number,
  hoursSinceLastDecay: number,
  halfLifeHours: number,
): number {
  if (weight <= 0) return 0;
  return weight * recencyDecay(hoursSinceLastDecay, halfLifeHours);
}

/**
 * Thompson-style optimistic bonus for under-explored candidates.
 *
 * A post with few impressions gets a bonus that shrinks as `sqrt(1/n)`, so new
 * content gets a chance to prove itself instead of being buried by the
 * rich-get-richer loop of engagement-only ranking. This is the upper-confidence
 * term of UCB1 without the log-total factor, which needs global state we would
 * rather not synchronise across instances.
 */
export function explorationBonus(
  impressions: number,
  strength: number,
): number {
  return strength / Math.sqrt(1 + Math.max(0, impressions));
}
