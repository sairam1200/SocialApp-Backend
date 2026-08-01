import { Injectable } from '@nestjs/common';
import { SearchEntityType } from '../../../../domain/contracts/search/search-entity-type';
import { SearchCandidate } from '../../../../domain/contracts/search/search-candidate.model';
import { RankingFeatureFlags } from '../ranking.config';
import { clamp, normalizedLog, textScore } from '../score.utils';
import {
  IRankingStrategy,
  RankingContext,
} from '../ranking-strategy.interface';

/**
 * Profile strategy: username/display-name relevance with a saturating
 * exact username match, follower count and verified badge. An exact
 * username match is the answer the user asked for, so it saturates the
 * text component and lets a matching profile outrank content.
 */
@Injectable()
export class ProfileRankingStrategy implements IRankingStrategy {
  readonly type = SearchEntityType.PROFILE;

  constructor(private readonly flags: RankingFeatureFlags) {}

  rank(candidate: SearchCandidate, _context: RankingContext): number {
    const { signals } = candidate;

    let text: number;
    if (this.flags.enableExactMatchBoost && signals.exactMatch) {
      text = 100;
    } else {
      text = textScore(candidate);
      if (this.flags.enableExactMatchBoost && signals.exactPhrase) {
        text = Math.max(text, 90);
      }
    }

    const followers =
      candidate.document.followerCount ??
      candidate.document.subscriberCount ??
      0;
    const followerScore = normalizedLog(followers, 5_000_000);
    const verifiedScore = candidate.document.verified ? 100 : 0;

    return clamp(text * 0.85 + followerScore * 0.1 + verifiedScore * 0.05);
  }
}
