import { IndexDocument } from './index-document.model';
import { ResolvedCreatorIdentity } from '../resolved-creator-identity.dto';

/**
 * Normalized 0-100 ranking signals. Every strategy reads these and produces
 * a final score; the CandidateFactory guarantees every signal has a default.
 */
export interface RankingSignals {
  textRelevance: number;
  textSimilarity: number;
  phraseRelevance: number;
  exactMatch: boolean;
  exactPhrase: boolean;
  interestScore: number;
  engagementScore: number;
  freshnessScore: number;
  creatorAuthorityScore: number;
  qualityScore: number;
  semanticScore: number;
}

export interface SearchCandidate {
  document: IndexDocument;
  signals: RankingSignals;
  matchedFields: string[];
  gaddrIdentity?: ResolvedCreatorIdentity | null;
  finalScore?: number;
}
