export interface RankingWeightsConfig {
  text: number;
  engagement: number;
  freshness: number;
  creator: number;
  quality: number;
  semantic: number;
}

export interface RankingFeatureFlags {
  enableTrigram: boolean;
  enableFuzzy: boolean;
  enablePhrase: boolean;
  enableSemantic: boolean;
  enableCreatorBoost: boolean;
  enableExactMatchBoost: boolean;
}

export const RANKING_WEIGHTS_DEFAULTS: RankingWeightsConfig = {
  text: 0.5,
  engagement: 0.2,
  freshness: 0.15,
  creator: 0.1,
  quality: 0.05,
  semantic: 0,
};

const WEIGHT_KEYS: (keyof RankingWeightsConfig)[] = [
  'text',
  'engagement',
  'freshness',
  'creator',
  'quality',
  'semantic',
];

function parseWeight(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function loadRankingWeights(
  env: NodeJS.ProcessEnv = process.env,
): RankingWeightsConfig {
  const weights: RankingWeightsConfig = {
    text: parseWeight(env.SEARCH_RANKING_TEXT, RANKING_WEIGHTS_DEFAULTS.text),
    engagement: parseWeight(
      env.SEARCH_RANKING_ENGAGEMENT,
      RANKING_WEIGHTS_DEFAULTS.engagement,
    ),
    freshness: parseWeight(
      env.SEARCH_RANKING_FRESHNESS,
      RANKING_WEIGHTS_DEFAULTS.freshness,
    ),
    creator: parseWeight(
      env.SEARCH_RANKING_CREATOR,
      RANKING_WEIGHTS_DEFAULTS.creator,
    ),
    quality: parseWeight(
      env.SEARCH_RANKING_QUALITY,
      RANKING_WEIGHTS_DEFAULTS.quality,
    ),
    semantic: parseWeight(
      env.SEARCH_RANKING_SEMANTIC,
      RANKING_WEIGHTS_DEFAULTS.semantic,
    ),
  };

  const sum = WEIGHT_KEYS.reduce((total, key) => total + weights[key], 0);
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(
      `Search ranking weights must sum to 1.0, got ${sum.toFixed(3)}`,
    );
  }

  return weights;
}

export function loadRankingFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): RankingFeatureFlags {
  return {
    enableTrigram: parseFlag(env.ENABLE_TRIGRAM, true),
    enableFuzzy: parseFlag(env.ENABLE_FUZZY, true),
    enablePhrase: parseFlag(env.ENABLE_PHRASE, true),
    enableSemantic: parseFlag(env.ENABLE_SEMANTIC, false),
    enableCreatorBoost: parseFlag(env.ENABLE_CREATOR_BOOST, true),
    enableExactMatchBoost: parseFlag(env.ENABLE_EXACT_MATCH_BOOST, true),
  };
}
