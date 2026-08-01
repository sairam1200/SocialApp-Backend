import { Injectable } from '@nestjs/common';
import { SearchEntityType } from '../../../../domain/contracts/search/search-entity-type';
import { SearchCandidate } from '../../../../domain/contracts/search/search-candidate.model';
import { RankingFeatureFlags, RankingWeightsConfig } from '../ranking.config';
import { clamp, freshnessScore, textScore } from '../score.utils';
import {
  IRankingStrategy,
  RankingContext,
} from '../ranking-strategy.interface';

/**
 * Full content strategy. Combines tsvector relevance, trigram similarity,
 * phrase match, exact-match boost, freshness, engagement, creator
 * authority, content quality and a reserved semantic placeholder (weight 0
 * until a semantic layer lands). Runs per ContentStream item across all
 * platforms together.
 */
@Injectable()
export class ContentRankingStrategy implements IRankingStrategy {
  readonly type = SearchEntityType.CONTENT;

  constructor(
    private readonly weights: RankingWeightsConfig,
    private readonly flags: RankingFeatureFlags,
  ) {}

  rank(candidate: SearchCandidate, context: RankingContext): number {
    const text = this.textScore(candidate);
    const engagement = candidate.signals.engagementScore;
    const freshness = freshnessScore(candidate, context.now);
    const creator = this.creatorAuthorityScore(candidate);
    const quality = this.qualityScore(candidate);
    const semantic = this.flags.enableSemantic
      ? candidate.signals.semanticScore
      : 0;

    return clamp(
      text * this.weights.text +
        engagement * this.weights.engagement +
        freshness * this.weights.freshness +
        creator * this.weights.creator +
        quality * this.weights.quality +
        semantic * this.weights.semantic,
    );
  }

  private textScore(candidate: SearchCandidate): number {
    const { signals } = candidate;
    let score = textScore(candidate);

    if (this.flags.enablePhrase) {
      score = score * 0.8 + (signals.phraseRelevance || 0) * 0.2;
    }

    if (this.flags.enableExactMatchBoost) {
      if (signals.exactPhrase) score += 15;
      else if (signals.exactMatch) score += 10;
    }

    return clamp(score);
  }

  private creatorAuthorityScore(candidate: SearchCandidate): number {
    if (!this.flags.enableCreatorBoost) return 0;
    return candidate.signals.creatorAuthorityScore;
  }

  private qualityScore(candidate: SearchCandidate): number {
    const engagement = candidate.document.engagement;
    if (!engagement) return 0;
    const views = engagement.viewCount ?? 0;
    const likes = engagement.likeCount ?? 0;
    if (views <= 0) return 0;
    // A 5% like-to-view ratio scores 100; anything above is saturated.
    return clamp((likes / views / 0.05) * 100);
  }
}
