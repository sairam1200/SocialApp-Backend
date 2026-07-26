import {
  ageInHours,
  clamp,
  cosineSimilarity,
  decayAffinity,
  explorationBonus,
  fnv1a,
  idf,
  jaccard,
  logSaturate,
  norm,
  recencyDecay,
  sigmoid,
  toSparseVector,
  wilsonLowerBound,
} from './ranking-math';

/**
 * These are the functions the feed's behaviour rests on, so the assertions are
 * about *properties* rather than magic numbers: monotonicity, bounds, and the
 * specific orderings the product depends on.
 */
describe('ranking-math', () => {
  describe('clamp', () => {
    it('bounds a value on both sides', () => {
      expect(clamp(5, 0, 1)).toBe(1);
      expect(clamp(-5, 0, 1)).toBe(0);
      expect(clamp(0.5, 0, 1)).toBe(0.5);
    });

    it('returns the minimum for NaN rather than propagating it', () => {
      // A NaN reaching the ranker turns every score into NaN and the feed
      // silently empties. Failing to the floor is the safe direction.
      expect(clamp(Number.NaN, 0.2, 1)).toBe(0.2);
    });
  });

  describe('sigmoid', () => {
    it('maps into (0, 1) and is symmetric about zero', () => {
      expect(sigmoid(0)).toBeCloseTo(0.5, 10);
      expect(sigmoid(10)).toBeGreaterThan(0.99);
      expect(sigmoid(-10)).toBeLessThan(0.01);
      expect(sigmoid(3) + sigmoid(-3)).toBeCloseTo(1, 10);
    });

    it('does not overflow at extreme inputs', () => {
      expect(Number.isFinite(sigmoid(1000))).toBe(true);
      expect(Number.isFinite(sigmoid(-1000))).toBe(true);
      expect(sigmoid(-1000)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('logSaturate', () => {
    it('is zero at zero and one at the saturation point', () => {
      expect(logSaturate(0, 500)).toBe(0);
      expect(logSaturate(500, 500)).toBeCloseTo(1, 6);
    });

    it('has diminishing returns', () => {
      const first = logSaturate(10, 500) - logSaturate(0, 500);
      const later = logSaturate(510, 500) - logSaturate(500, 500);
      expect(later).toBeLessThan(first);
    });
  });

  describe('recencyDecay', () => {
    it('halves at the half-life', () => {
      expect(recencyDecay(0, 24)).toBe(1);
      expect(recencyDecay(24, 24)).toBeCloseTo(0.5, 10);
      expect(recencyDecay(48, 24)).toBeCloseTo(0.25, 10);
    });

    it('treats a future timestamp as fresh rather than boosting it', () => {
      // Clock skew between instances is real; a negative age must not produce
      // a decay factor above 1.
      expect(recencyDecay(-100, 24)).toBe(1);
    });
  });

  describe('ageInHours', () => {
    const now = new Date('2026-07-26T12:00:00.000Z');

    it('accepts a Date, a string or an epoch', () => {
      expect(ageInHours(new Date('2026-07-26T06:00:00.000Z'), now)).toBe(6);
      expect(ageInHours('2026-07-26T06:00:00.000Z', now)).toBe(6);
      expect(ageInHours(now.getTime() - 3_600_000, now)).toBe(1);
    });

    it('never returns a negative age', () => {
      expect(ageInHours('2026-07-27T12:00:00.000Z', now)).toBe(0);
    });

    it('returns zero for an unparseable value', () => {
      expect(ageInHours('not a date', now)).toBe(0);
    });
  });

  describe('wilsonLowerBound', () => {
    it('penalises a small sample against a large one', () => {
      // The whole reason this exists: 3/3 must not outrank 900/1000.
      expect(wilsonLowerBound(3, 3)).toBeLessThan(wilsonLowerBound(900, 1000));
    });

    it('stays within [0, 1] and is zero with no trials', () => {
      expect(wilsonLowerBound(0, 0)).toBe(0);
      expect(wilsonLowerBound(1, 1)).toBeLessThanOrEqual(1);
      expect(wilsonLowerBound(0, 1000)).toBeGreaterThanOrEqual(0);
    });

    it('converges toward the observed rate as evidence grows', () => {
      const small = wilsonLowerBound(5, 10);
      const large = wilsonLowerBound(5000, 10000);
      expect(large).toBeGreaterThan(small);
      expect(large).toBeCloseTo(0.5, 1);
    });
  });

  describe('cosineSimilarity', () => {
    it('is 1 for identical vectors and 0 for disjoint ones', () => {
      const a = toSparseVector(['music', 'design']);
      const b = toSparseVector(['music', 'design']);
      const c = toSparseVector(['finance']);
      expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
      expect(cosineSimilarity(a, c)).toBe(0);
    });

    it('is symmetric and handles empty vectors', () => {
      const a = toSparseVector(['a', 'b']);
      const b = toSparseVector(['b', 'c']);
      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 12);
      expect(cosineSimilarity(a, new Map())).toBe(0);
    });

    it('is case-insensitive, so topic casing cannot silently break matching', () => {
      expect(
        cosineSimilarity(toSparseVector(['Music']), toSparseVector(['music'])),
      ).toBeCloseTo(1, 10);
    });
  });

  describe('toSparseVector and norm', () => {
    it('accumulates duplicate terms', () => {
      const v = toSparseVector(['a', 'a', 'b']);
      expect(v.get('a')).toBe(2);
      expect(v.get('b')).toBe(1);
    });

    it('applies the weight function', () => {
      const v = toSparseVector(['a', 'b'], (t) => (t === 'a' ? 3 : 1));
      expect(v.get('a')).toBe(3);
    });

    it('computes the Euclidean norm', () => {
      expect(norm(toSparseVector(['a', 'a', 'b']))).toBeCloseTo(
        Math.sqrt(4 + 1),
        10,
      );
    });
  });

  describe('jaccard', () => {
    it('is the intersection over the union', () => {
      expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 10);
      expect(jaccard(['a'], ['a'])).toBe(1);
      expect(jaccard([], ['a'])).toBe(0);
    });
  });

  describe('idf', () => {
    it('rewards rare terms over common ones', () => {
      expect(idf(1000, 1)).toBeGreaterThan(idf(1000, 900));
    });

    it('stays positive even for a term in every document', () => {
      // The textbook ln(N/n) goes negative here, which flips a ranking term's
      // sign. The BM25 form does not.
      expect(idf(1000, 1000)).toBeGreaterThan(0);
    });
  });

  describe('decayAffinity', () => {
    it('halves a weight after one half-life', () => {
      expect(decayAffinity(10, 720, 720)).toBeCloseTo(5, 10);
    });

    it('never goes below zero', () => {
      expect(decayAffinity(0, 10_000, 24)).toBe(0);
      expect(decayAffinity(-5, 1, 24)).toBe(0);
    });
  });

  describe('explorationBonus', () => {
    it('shrinks as a post gathers impressions', () => {
      expect(explorationBonus(0, 0.15)).toBeGreaterThan(
        explorationBonus(100, 0.15),
      );
    });

    it('is zero when exploration is turned off', () => {
      expect(explorationBonus(0, 0)).toBe(0);
    });
  });

  describe('fnv1a', () => {
    it('is deterministic and stays in 32-bit unsigned range', () => {
      expect(fnv1a('gaddr')).toBe(fnv1a('gaddr'));
      expect(fnv1a('gaddr')).toBeGreaterThanOrEqual(0);
      expect(fnv1a('gaddr')).toBeLessThan(2 ** 32);
    });

    it('separates similar inputs', () => {
      expect(fnv1a('post-a')).not.toBe(fnv1a('post-b'));
    });
  });
});
