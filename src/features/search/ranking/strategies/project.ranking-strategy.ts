import { Injectable } from '@nestjs/common';
import { SearchEntityType } from '../../../../domain/contracts/search/search-entity-type';
import { SearchCandidate } from '../../../../domain/contracts/search/search-candidate.model';
import { RankingFeatureFlags } from '../ranking.config';
import {
  clamp,
  freshnessScore,
  normalizedLog,
  textScore,
} from '../score.utils';
import {
  IRankingStrategy,
  RankingContext,
} from '../ranking-strategy.interface';

/**
 * Project strategy: text relevance, updated date and popularity ("stars").
 * Projects age on their updatedAt; without a star source the popularity
 * component is simply zero.
 */
@Injectable()
export class ProjectRankingStrategy implements IRankingStrategy {
  readonly type = SearchEntityType.PROJECT;

  constructor(private readonly flags: RankingFeatureFlags) {}

  rank(candidate: SearchCandidate, context: RankingContext): number {
    const text =
      this.flags.enableExactMatchBoost && candidate.signals.exactMatch
        ? 100
        : textScore(candidate);

    const freshness = freshnessScore(
      candidate,
      context.now,
      60,
      candidate.document.updatedAt ?? candidate.document.publishedAt,
    );

    const stars = normalizedLog(
      candidate.document.followerCount ??
        candidate.document.engagement?.likeCount ??
        0,
      100_000,
    );

    return clamp(text * 0.6 + freshness * 0.25 + stars * 0.15);
  }
}
