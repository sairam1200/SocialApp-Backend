import { Injectable } from '@nestjs/common';
import { SearchEntityType } from '../../../../domain/contracts/search/search-entity-type';
import { SearchCandidate } from '../../../../domain/contracts/search/search-candidate.model';
import { RankingFeatureFlags } from '../ranking.config';
import { clamp, freshnessScore, textScore } from '../score.utils';
import {
  IRankingStrategy,
  RankingContext,
} from '../ranking-strategy.interface';

/**
 * Job strategy: text relevance and posting date.
 */
@Injectable()
export class JobRankingStrategy implements IRankingStrategy {
  readonly type = SearchEntityType.JOB;

  constructor(private readonly flags: RankingFeatureFlags) {}

  rank(candidate: SearchCandidate, context: RankingContext): number {
    const text =
      this.flags.enableExactMatchBoost && candidate.signals.exactMatch
        ? 100
        : textScore(candidate);

    const freshness = freshnessScore(
      candidate,
      context.now,
      45,
      candidate.document.publishedAt,
    );

    return clamp(text * 0.7 + freshness * 0.3);
  }
}
