import { Injectable } from '@nestjs/common';
import { SearchCandidate } from '../../../domain/contracts/search/search-candidate.model';
import { RankingContext } from './ranking-strategy.interface';
import { RankingStrategyRegistry } from './ranking-strategy-registry';
import { clamp } from './score.utils';

/**
 * Computes a normalized 0-100 finalScore for every candidate by dispatching
 * to the strategy registered for the candidate's entity type, then applies
 * the single global ordering:
 *
 *   finalScore DESC -> exactMatch DESC -> exactPhrase DESC ->
 *   publishedAt DESC -> engagement DESC -> id ASC
 *
 * There is deliberately no fixed type ordering: a profile whose username
 * matches exactly (finalScore ~100) outranks a content item that scored 72.
 */
@Injectable()
export class RankingEngine {
  constructor(private readonly registry: RankingStrategyRegistry) {}

  rank(
    candidates: SearchCandidate[],
    context: RankingContext,
  ): SearchCandidate[] {
    for (const candidate of candidates) {
      const strategy = this.registry.get(candidate.document.type);
      candidate.finalScore = clamp(strategy.rank(candidate, context), 0, 100);
    }
    return this.sort(candidates);
  }

  private sort(candidates: SearchCandidate[]): SearchCandidate[] {
    return [...candidates].sort((a, b) => {
      const scoreDiff = (b.finalScore ?? 0) - (a.finalScore ?? 0);
      if (scoreDiff !== 0) return scoreDiff;

      const exactDiff =
        Number(b.signals.exactMatch) - Number(a.signals.exactMatch);
      if (exactDiff !== 0) return exactDiff;

      const phraseDiff =
        Number(b.signals.exactPhrase) - Number(a.signals.exactPhrase);
      if (phraseDiff !== 0) return phraseDiff;

      const aTime = a.document.publishedAt?.getTime() ?? 0;
      const bTime = b.document.publishedAt?.getTime() ?? 0;
      if (bTime !== aTime) return bTime - aTime;

      const engagementDiff =
        b.signals.engagementScore - a.signals.engagementScore;
      if (engagementDiff !== 0) return engagementDiff;

      return a.document.id.localeCompare(b.document.id);
    });
  }
}
