import { SearchCandidate } from '../../../domain/contracts/search/search-candidate.model';

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function textScore(candidate: SearchCandidate): number {
  const { signals } = candidate;
  return clamp(
    (signals.textRelevance || 0) * 0.7 + (signals.textSimilarity || 0) * 0.3,
  );
}

export function freshnessScore(
  candidate: SearchCandidate,
  now: Date,
  halfLifeDays = 30,
  date: Date | undefined = candidate.document.publishedAt,
): number {
  if (!date) return 0;
  const ageDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 100;
  return clamp(100 * Math.exp(-ageDays / halfLifeDays));
}

export function normalizedLog(value: number, max = 10_000_000): number {
  if (value <= 0) return 0;
  return clamp((Math.log(1 + value) / Math.log(1 + max)) * 100);
}
