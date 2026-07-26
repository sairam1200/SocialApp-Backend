import {
  ageInHours,
  clamp,
  explorationBonus,
  logSaturate,
  recencyDecay,
  sigmoid,
  wilsonLowerBound,
} from './ranking-math';
import { FeedPreferences, ObjectiveWeights } from './ranking-weights';

/**
 * The ranking stage — our equivalent of a "heavy ranker".
 *
 * Twitter's is a learned network predicting a probability per engagement type
 * and taking a weighted sum. We have the same shape and no labelled training
 * data, so each probability is estimated instead of learned:
 *
 *     p(engagement) = σ( logit(observed rate) + affinity terms )
 *
 * The observed rate is Wilson-smoothed, so a post with two impressions cannot
 * claim a 100% like rate. The affinity terms shift that prior by how well the
 * candidate matches this particular reader. When enough labelled interactions
 * exist, `predictEngagement` is the single function to replace — everything
 * around it is already in the right shape for a learned model.
 *
 * Deliberately not a black box: `explain()` returns the term breakdown, which
 * the UI shows as "why am I seeing this".
 */

/** Everything the ranker knows about one candidate, for one reader. */
export interface CandidateFeatures {
  id: string;
  authorId: string;

  /** When it was published. Drives recency decay. */
  publishedOn: Date;

  /* ---- observed engagement on the candidate itself ---- */
  impressions: number;
  likes: number;
  comments: number;
  reposts: number;
  shares: number;
  clicks: number;

  /* ---- reader ↔ candidate affinity, each in [0, 1] ---- */
  /** Cosine between the reader's topic affinities and the candidate's topics. */
  topicAffinity: number;
  /** 1 if the reader follows the author, else 0. */
  isFollowed: number;
  /** Reciprocal follow, prior interactions with this author, in [0, 1]. */
  authorAffinity: number;
  /** Author's rolling quality prior, in [0, 1]. */
  authorQuality: number;
  /** Fused retrieval score, normalised to [0, 1]. */
  retrievalScore: number;

  /* ---- modifiers ---- */
  /** 1 when the candidate carries media, which reliably lifts dwell. */
  hasMedia: number;
  /** 1 when it is a paid post. Ranked, but never boosted. */
  isSponsored: number;
  /** 1 when the reader has signalled disinterest in the author or topic. */
  isDownranked: number;
}

/** Per-objective predicted probabilities, in [0, 1]. */
export interface PredictedEngagement {
  like: number;
  comment: number;
  repost: number;
  share: number;
  bookmark: number;
  dwell: number;
  profileVisit: number;
  videoWatch: number;
  click: number;
  purchase: number;
  negative: number;
}

export interface ScoredCandidate {
  id: string;
  score: number;
  predictions: PredictedEngagement;
  terms: Record<string, number>;
}

/** Logit of a probability, guarded against 0 and 1. */
function logit(p: number): number {
  const bounded = clamp(p, 1e-4, 1 - 1e-4);
  return Math.log(bounded / (1 - bounded));
}

/**
 * Prior rate for an engagement type when a candidate has no history at all.
 *
 * Order-of-magnitude values from public social benchmarks: a few percent
 * like rate, a fraction of a percent for the costlier actions. They exist to
 * stop a brand-new post scoring zero, and they wash out after a few hundred
 * impressions.
 */
const COLD_START_RATES: Readonly<Record<keyof PredictedEngagement, number>> =
  Object.freeze({
    like: 0.03,
    comment: 0.004,
    repost: 0.002,
    share: 0.003,
    bookmark: 0.004,
    dwell: 0.35,
    profileVisit: 0.01,
    videoWatch: 0.2,
    click: 0.02,
    purchase: 0.0005,
    negative: 0.004,
  });

/**
 * Blend the observed rate with the cold-start prior, weighted by how much
 * evidence there is. At 0 impressions this is entirely the prior; by ~500
 * impressions it is almost entirely observed.
 */
function smoothedRate(
  positive: number,
  impressions: number,
  prior: number,
): number {
  if (impressions <= 0) return prior;
  const observed = wilsonLowerBound(positive, impressions);
  const evidence = clamp(impressions / (impressions + 500), 0, 1);
  return prior * (1 - evidence) + observed * evidence;
}

/**
 * Predict each engagement probability for this reader on this candidate.
 *
 * The affinity terms are added in logit space so their effect is
 * multiplicative on the odds — following someone roughly triples the odds you
 * engage, rather than adding a fixed amount that would swamp a rare event and
 * be invisible on a common one.
 */
export function predictEngagement(
  features: CandidateFeatures,
): PredictedEngagement {
  const affinityShift =
    1.1 * features.isFollowed +
    1.4 * features.topicAffinity +
    0.9 * features.authorAffinity +
    0.6 * (features.authorQuality - 0.5) * 2 +
    0.5 * features.retrievalScore -
    2.5 * features.isDownranked;

  const mediaShift = 0.35 * features.hasMedia;

  const predict = (
    key: keyof PredictedEngagement,
    positive: number,
    extraShift = 0,
  ): number => {
    const base = smoothedRate(
      positive,
      features.impressions,
      COLD_START_RATES[key],
    );
    return sigmoid(logit(base) + affinityShift + extraShift);
  };

  // Negative signals move the *opposite* way to affinity: the better a
  // candidate matches, the less likely the reader is to reject it.
  const negativeBase = smoothedRate(
    features.isDownranked * Math.max(1, features.impressions * 0.05),
    features.impressions,
    COLD_START_RATES.negative,
  );

  return {
    like: predict('like', features.likes),
    comment: predict('comment', features.comments),
    repost: predict('repost', features.reposts),
    share: predict('share', features.shares),
    bookmark: predict('bookmark', Math.round(features.likes * 0.15)),
    dwell: predict(
      'dwell',
      Math.round(features.impressions * 0.35),
      mediaShift,
    ),
    profileVisit: predict('profileVisit', Math.round(features.clicks * 0.3)),
    videoWatch: predict(
      'videoWatch',
      Math.round(features.impressions * 0.2),
      mediaShift,
    ),
    click: predict('click', features.clicks),
    purchase: predict('purchase', 0),
    negative: sigmoid(logit(negativeBase) - affinityShift * 0.6),
  };
}

/**
 * Combine predictions into a single score, then apply recency, exploration and
 * the paid-content rule.
 *
 * Sponsored posts are multiplied by 1.0 — they are not boosted and not
 * penalised. Their placement comes from `blendSponsored`, not from the score,
 * so paid reach is a fixed share of the feed rather than something buyable.
 */
export function scoreCandidate(
  features: CandidateFeatures,
  preferences: FeedPreferences,
  now: Date,
): ScoredCandidate {
  const predictions = predictEngagement(features);
  const weights: ObjectiveWeights = preferences.objectives;

  const utility =
    weights.like * predictions.like +
    weights.comment * predictions.comment +
    weights.repost * predictions.repost +
    weights.share * predictions.share +
    weights.bookmark * predictions.bookmark +
    weights.dwell * predictions.dwell +
    weights.profileVisit * predictions.profileVisit +
    weights.videoWatch * predictions.videoWatch +
    weights.click * predictions.click +
    weights.purchase * predictions.purchase +
    weights.negative * predictions.negative;

  const age = ageInHours(features.publishedOn, now);
  const recency = recencyDecay(age, preferences.recencyHalfLifeHours);

  // Enough engagement to be worth surfacing regardless of freshness — keeps a
  // genuinely good post from vanishing after a day.
  const popularity = logSaturate(
    features.likes + 2 * features.comments + 2 * features.reposts,
    500,
  );

  const exploration = explorationBonus(
    features.impressions,
    preferences.explorationStrength,
  );

  // `utility` can be negative when the negative term dominates; the recency
  // multiplier must not flip that into a *boost* for old bad content, so it is
  // applied to the positive part only.
  const positiveUtility = Math.max(0, utility);
  const penalty = Math.min(0, utility);

  const score =
    positiveUtility * (0.75 * recency + 0.25 * popularity) +
    penalty +
    exploration;

  return {
    id: features.id,
    score,
    predictions,
    terms: {
      utility,
      recency,
      popularity,
      exploration,
      ageHours: age,
      retrieval: features.retrievalScore,
      topicAffinity: features.topicAffinity,
      authorQuality: features.authorQuality,
    },
  };
}

/**
 * Human-readable reasons a candidate is ranked where it is.
 *
 * Shown verbatim in the "Why this post?" sheet. Ordered by contribution, and
 * capped at three, because a list of nine reasons explains nothing.
 */
export function explain(
  features: CandidateFeatures,
  contributions: Array<{ source: string; rank: number }>,
): string[] {
  const reasons: string[] = [];

  if (features.isFollowed > 0) reasons.push('followed');
  if (features.topicAffinity > 0.35) reasons.push('topic-match');
  if (features.authorAffinity > 0.3) reasons.push('author-affinity');

  const bySource = new Map<string, number>();
  for (const c of contributions) {
    const best = bySource.get(c.source);
    if (best === undefined || c.rank < best) bySource.set(c.source, c.rank);
  }
  for (const [source] of Array.from(bySource.entries()).sort(
    (a, b) => a[1] - b[1],
  )) {
    if (!reasons.includes(source)) reasons.push(source);
  }

  if (features.isSponsored > 0) reasons.unshift('sponsored');
  return reasons.slice(0, 3);
}
