import { clamp, cosineSimilarity, SparseVector } from './ranking-math';

/**
 * Rank fusion and diversification.
 *
 * The retrieval stage runs several independent sources — who you follow, what
 * you like, what is trending, who engages with the same things you do. Their
 * scores are not comparable: one is a cosine similarity in [0,1], another a
 * raw co-occurrence count. Fusing on *rank* rather than score sidesteps that
 * entirely, which is why every hybrid search engine converged on it.
 */

/** One ranked list from one retrieval source. */
export interface RankedList<TId = string> {
  /** Identifies the source in explanations shown to the user. */
  source: string;
  /** Candidate ids, best first. */
  ids: TId[];
  /**
   * Relative trust in this source. Multiplies its RRF contribution. A weight
   * of 0 disables the source without removing it from the pipeline, which is
   * how the user-facing algorithm controls are implemented.
   */
  weight?: number;
}

export interface FusedCandidate<TId = string> {
  id: TId;
  /** Fused score. Only the ordering is meaningful, not the magnitude. */
  score: number;
  /** Which sources retrieved it, and at what rank. Drives "why am I seeing this". */
  contributions: Array<{ source: string; rank: number; weight: number }>;
}

/**
 * Reciprocal Rank Fusion.
 *
 *   RRF(d) = Σ_lists  weight_l / (k + rank_l(d))
 *
 * Cormack, Clarke & Büttcher, *Reciprocal Rank Fusion outperforms Condorcet
 * and individual Rank Learning Methods*, SIGIR 2009. `k = 60` is the constant
 * from that paper; it damps the influence of the very top ranks so a single
 * source cannot dictate the head of the list.
 *
 * Training-free and robust to heterogeneous sources, which is exactly the
 * position we are in: no labelled data, five sources that disagree.
 *
 * Ranks are 1-based. Ties are broken by candidate order in the first list that
 * retrieved the item, so the result is deterministic — important, because a
 * feed that reshuffles on every refresh feels broken.
 */
export function reciprocalRankFusion<TId = string>(
  lists: Array<RankedList<TId>>,
  k = 60,
): Array<FusedCandidate<TId>> {
  const accumulator = new Map<TId, FusedCandidate<TId>>();
  const firstSeen = new Map<TId, number>();
  let ordinal = 0;

  for (const list of lists) {
    const weight = list.weight ?? 1;
    if (weight <= 0) continue;

    for (let index = 0; index < list.ids.length; index += 1) {
      const id = list.ids[index];
      const rank = index + 1;
      const increment = weight / (k + rank);

      let entry = accumulator.get(id);
      if (!entry) {
        entry = { id, score: 0, contributions: [] };
        accumulator.set(id, entry);
        firstSeen.set(id, ordinal);
        ordinal += 1;
      }
      entry.score += increment;
      entry.contributions.push({ source: list.source, rank, weight });
    }
  }

  return Array.from(accumulator.values()).sort(
    (a, b) =>
      b.score - a.score ||
      (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0),
  );
}

/** An item that can be diversified: a score plus something to compare on. */
export interface DiversifiableItem<TId = string> {
  id: TId;
  score: number;
  /** Topical vector, used for the similarity penalty. */
  vector?: SparseVector;
  /** Author, publisher or brand. Used for the hard per-author cap. */
  groupId?: string;
}

export interface DiversifyOptions {
  /**
   * Trade-off in [0, 1]. 1 is pure relevance, 0 is pure novelty.
   * 0.7 keeps the head of the feed relevant while breaking up runs of
   * near-identical posts further down.
   */
  lambda?: number;
  /** How many items to return. */
  limit: number;
  /** Maximum items from any one author in the result. */
  maxPerGroup?: number;
}

/**
 * Maximal Marginal Relevance.
 *
 *   MMR = argmax_d [ λ·score(d) − (1−λ)·max_{s ∈ selected} sim(d, s) ]
 *
 * Carbonell & Goldstein, SIGIR 1998. Greedy, O(limit · candidates), which is
 * fine at feed sizes and avoids the quadratic blow-up of comparing every pair.
 *
 * The per-author cap is applied alongside rather than folded into the
 * similarity term because "no more than three posts from one person" is a
 * promise to the reader, and a soft penalty cannot make a promise.
 */
export function diversify<TId = string>(
  items: Array<DiversifiableItem<TId>>,
  options: DiversifyOptions,
): Array<DiversifiableItem<TId>> {
  const lambda = clamp(options.lambda ?? 0.7, 0, 1);
  const maxPerGroup = options.maxPerGroup ?? Number.POSITIVE_INFINITY;

  const remaining = [...items].sort((a, b) => b.score - a.score);
  const selected: Array<DiversifiableItem<TId>> = [];
  const groupCounts = new Map<string, number>();

  while (selected.length < options.limit && remaining.length > 0) {
    let bestIndex = -1;
    let bestValue = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];

      const group = candidate.groupId;
      if (group && (groupCounts.get(group) ?? 0) >= maxPerGroup) continue;

      let maxSimilarity = 0;
      if (candidate.vector) {
        for (const chosen of selected) {
          if (!chosen.vector) continue;
          const similarity = cosineSimilarity(candidate.vector, chosen.vector);
          if (similarity > maxSimilarity) maxSimilarity = similarity;
        }
      }

      const value = lambda * candidate.score - (1 - lambda) * maxSimilarity;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }

    // Every remaining candidate is blocked by the per-author cap.
    if (bestIndex === -1) break;

    const [chosen] = remaining.splice(bestIndex, 1);
    selected.push(chosen);
    if (chosen.groupId) {
      groupCounts.set(
        chosen.groupId,
        (groupCounts.get(chosen.groupId) ?? 0) + 1,
      );
    }
  }

  return selected;
}

/**
 * Insert sponsored items into an organic list at a fixed cadence.
 *
 * Position-based rather than score-based on purpose: an advertiser cannot buy
 * its way to the top of the feed by outbidding, and the reader can predict
 * where ads appear. `everyN = 6` means at most one in seven items is paid.
 *
 * Returns a new array; neither input is mutated.
 */
export function blendSponsored<T>(
  organic: T[],
  sponsored: T[],
  everyN: number,
  startAt = 3,
): T[] {
  if (sponsored.length === 0 || everyN <= 0) return [...organic];

  const result: T[] = [];
  const queue = [...sponsored];
  let sinceLast = -startAt;

  for (const item of organic) {
    result.push(item);
    sinceLast += 1;
    if (sinceLast >= everyN && queue.length > 0) {
      result.push(queue.shift() as T);
      sinceLast = 0;
    }
  }

  return result;
}
