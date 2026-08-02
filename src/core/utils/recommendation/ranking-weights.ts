import { clamp } from './ranking-math';

/**
 * The ranker's objective, and the reader's control over it.
 *
 * Twitter's heavy ranker predicts a probability per engagement type and takes
 * a weighted sum. We do the same, with two differences that follow from the
 * product promise that the reader stays in control:
 *
 *  1. Every weight is nameable and adjustable, not a learned embedding.
 *  2. The defaults are published, here, in a file anyone can read.
 *
 * The magnitudes are deliberately ordered rather than tuned — a reply is worth
 * more than a like because it costs more to give, a "not interested" outweighs
 * everything positive because an explicit no should not need to be repeated.
 */

/** Weight applied to each predicted engagement probability. */
export interface ObjectiveWeights {
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
  /** Negative. Applied to the predicted probability of a negative signal. */
  negative: number;
}

export const DEFAULT_OBJECTIVE_WEIGHTS: Readonly<ObjectiveWeights> =
  Object.freeze({
    like: 0.5,
    comment: 3.0,
    repost: 2.0,
    share: 2.5,
    bookmark: 1.5,
    dwell: 1.0,
    profileVisit: 1.2,
    videoWatch: 1.4,
    click: 0.8,
    purchase: 4.0,
    negative: -12.0,
  });

/**
 * How much each retrieval source is trusted, before fusion.
 *
 * These are the sliders the reader actually sees in
 * Settings → Feed. Setting `following` to 1 and everything else to 0 turns the
 * recommended feed into a chronological following feed — which is a legitimate
 * thing to want, and should not require leaving the product to get.
 */
export interface SourceWeights {
  following: number;
  topicAffinity: number;
  coEngagement: number;
  trending: number;
  similarAuthors: number;
  fresh: number;
}

export const DEFAULT_SOURCE_WEIGHTS: Readonly<SourceWeights> = Object.freeze({
  following: 1.0,
  topicAffinity: 0.9,
  coEngagement: 0.8,
  trending: 0.5,
  similarAuthors: 0.6,
  fresh: 0.4,
});

/** Everything the reader can tune about their own feed. */
export interface FeedPreferences {
  sources: SourceWeights;
  objectives: ObjectiveWeights;
  /** Recency half-life in hours. Lower means a faster-moving feed. */
  recencyHalfLifeHours: number;
  /** MMR λ. Lower means more variety, higher means more of what you like. */
  diversityLambda: number;
  /** Hard cap on consecutive-ish posts from one author within a page. */
  maxPostsPerAuthor: number;
  /** How strongly to boost under-exposed content. 0 disables exploration. */
  explorationStrength: number;
  /** One sponsored item per this many organic items. 0 disables them entirely. */
  sponsoredEveryN: number;
  /** Topics the reader has muted. Filtered before ranking. */
  mutedTopics: string[];
  /** Show posts from people you don't follow at all. */
  includeOutOfNetwork: boolean;
}

export const DEFAULT_FEED_PREFERENCES: Readonly<FeedPreferences> =
  Object.freeze({
    sources: DEFAULT_SOURCE_WEIGHTS,
    objectives: DEFAULT_OBJECTIVE_WEIGHTS,
    recencyHalfLifeHours: 20,
    diversityLambda: 0.7,
    maxPostsPerAuthor: 3,
    explorationStrength: 0.15,
    sponsoredEveryN: 7,
    mutedTopics: [],
    includeOutOfNetwork: true,
  });

/** Bounds enforced on stored preferences so a bad value cannot break the feed. */
const BOUNDS = {
  weight: [0, 2] as const,
  recencyHalfLifeHours: [1, 720] as const,
  diversityLambda: [0, 1] as const,
  maxPostsPerAuthor: [1, 20] as const,
  explorationStrength: [0, 1] as const,
  sponsoredEveryN: [0, 100] as const,
};

/**
 * Copy `defaults`, overriding any key the caller supplied as a finite number,
 * clamped into `[min, max]`.
 *
 * Generic over the shape rather than over `Record<string, number>` so both
 * weight objects keep their exact keys through the call — a `Record` return
 * would erase them and force a cast at every call site.
 */
function clampRecord<T extends object>(
  value: Partial<Record<keyof T, unknown>> | undefined,
  defaults: Readonly<T>,
  min: number,
  max: number,
): T {
  const result = { ...defaults } as T;
  if (!value) return result;
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      result[key] = clamp(candidate, min, max) as T[keyof T];
    }
  }
  return result;
}

/**
 * A finite number, or the default.
 *
 * `value ?? fallback` is not enough: `NaN` is not nullish, so it passes
 * straight through to `clamp`, which returns the *minimum*. A stored `NaN`
 * half-life would silently become 1 hour and make the feed behave nothing like
 * the default — a much subtler failure than an empty feed.
 */
function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Merge stored (possibly stale, possibly hostile) preferences over the
 * defaults, clamping every field.
 *
 * Preferences arrive from a JSONB column and from the settings API, so this is
 * a trust boundary. A `NaN` recency half-life makes every score `NaN` and the
 * feed silently empties — that is the failure this function exists to prevent.
 */
export function resolveFeedPreferences(
  stored?: Partial<FeedPreferences> | null,
): FeedPreferences {
  const defaults = DEFAULT_FEED_PREFERENCES;
  if (!stored) return { ...defaults, mutedTopics: [] };

  const objectiveWeights = clampRecord<ObjectiveWeights>(
    stored.objectives,
    DEFAULT_OBJECTIVE_WEIGHTS,
    -20,
    20,
  );

  return {
    sources: clampRecord<SourceWeights>(
      stored.sources,
      DEFAULT_SOURCE_WEIGHTS,
      BOUNDS.weight[0],
      BOUNDS.weight[1],
    ),
    objectives: objectiveWeights,
    recencyHalfLifeHours: clamp(
      finiteOr(stored.recencyHalfLifeHours, defaults.recencyHalfLifeHours),
      BOUNDS.recencyHalfLifeHours[0],
      BOUNDS.recencyHalfLifeHours[1],
    ),
    diversityLambda: clamp(
      finiteOr(stored.diversityLambda, defaults.diversityLambda),
      BOUNDS.diversityLambda[0],
      BOUNDS.diversityLambda[1],
    ),
    maxPostsPerAuthor: Math.round(
      clamp(
        finiteOr(stored.maxPostsPerAuthor, defaults.maxPostsPerAuthor),
        BOUNDS.maxPostsPerAuthor[0],
        BOUNDS.maxPostsPerAuthor[1],
      ),
    ),
    explorationStrength: clamp(
      finiteOr(stored.explorationStrength, defaults.explorationStrength),
      BOUNDS.explorationStrength[0],
      BOUNDS.explorationStrength[1],
    ),
    sponsoredEveryN: Math.round(
      clamp(
        finiteOr(stored.sponsoredEveryN, defaults.sponsoredEveryN),
        BOUNDS.sponsoredEveryN[0],
        BOUNDS.sponsoredEveryN[1],
      ),
    ),
    mutedTopics: Array.isArray(stored.mutedTopics)
      ? stored.mutedTopics
          .filter((t): t is string => typeof t === 'string' && t.length > 0)
          .slice(0, 200)
          .map((t) => t.toLowerCase())
      : [],
    includeOutOfNetwork:
      typeof stored.includeOutOfNetwork === 'boolean'
        ? stored.includeOutOfNetwork
        : defaults.includeOutOfNetwork,
  };
}

/**
 * Weight assigned to an engagement when it updates a topic affinity.
 *
 * Distinct from `ObjectiveWeights`: those weight *predictions* at ranking
 * time, these weight *observations* at learning time. Keeping them separate
 * means a reader can turn down how much comments influence their ranking
 * without also erasing what the system learned from their comments.
 */
export const ENGAGEMENT_LEARNING_WEIGHTS: Readonly<Record<string, number>> =
  Object.freeze({
    impression: 0.02,
    dwell: 0.2,
    click: 0.4,
    like: 1.0,
    comment: 2.5,
    repost: 2.0,
    share: 2.2,
    bookmark: 2.0,
    profile_visit: 1.0,
    follow: 4.0,
    video_watch: 1.2,
    purchase: 5.0,
    not_interested: -6.0,
    mute: -10.0,
    block: -20.0,
    report: -20.0,
  });
