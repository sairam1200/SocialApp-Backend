import { Injectable } from '@nestjs/common';
import { IndexDocument } from '../../../domain/contracts/search/index-document.model';
import {
  RankingSignals,
  SearchCandidate,
} from '../../../domain/contracts/search/search-candidate.model';

const DEFAULT_SIGNALS: RankingSignals = {
  textRelevance: 0,
  textSimilarity: 0,
  phraseRelevance: 0,
  exactMatch: false,
  exactPhrase: false,
  interestScore: 0,
  engagementScore: 0,
  freshnessScore: 0,
  creatorAuthorityScore: 0,
  qualityScore: 0,
  semanticScore: 0,
};

/**
 * Sole normalizer from IndexDocument -> SearchCandidate. Fills default
 * ranking signals for anything a repository could not project, and never
 * performs ranking itself. Rankings are computed later by the strategies.
 */
@Injectable()
export class CandidateFactory {
  build(documents: IndexDocument[]): SearchCandidate[] {
    return documents.map((document) => this.fromDocument(document));
  }

  fromDocument(document: IndexDocument): SearchCandidate {
    const signals: RankingSignals = { ...DEFAULT_SIGNALS };
    const ranking = document.ranking;

    if (ranking) {
      if (typeof ranking.textRelevance === 'number') {
        signals.textRelevance = ranking.textRelevance;
      }
      if (typeof ranking.textSimilarity === 'number') {
        signals.textSimilarity = ranking.textSimilarity;
      }
      if (typeof ranking.phraseRelevance === 'number') {
        signals.phraseRelevance = ranking.phraseRelevance;
      }
      if (typeof ranking.exactMatch === 'boolean') {
        signals.exactMatch = ranking.exactMatch;
      }
      if (typeof ranking.exactPhrase === 'boolean') {
        signals.exactPhrase = ranking.exactPhrase;
      }
      if (typeof ranking.engagementScore === 'number') {
        signals.engagementScore = ranking.engagementScore;
      }
      if (typeof ranking.interestScore === 'number') {
        signals.interestScore = ranking.interestScore;
      }
      if (typeof ranking.creatorAuthorityScore === 'number') {
        signals.creatorAuthorityScore = ranking.creatorAuthorityScore;
      }
    }

    return {
      document,
      signals,
      matchedFields: [],
      gaddrIdentity: null,
    };
  }
}
