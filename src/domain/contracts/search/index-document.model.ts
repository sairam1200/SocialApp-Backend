import { EngagementMetrics } from './search-result.model';
import { SearchEntityType } from './search-entity-type';

/**
 * Ranking primitives projected by a search repository. Every numeric value
 * is normalized to 0-100 so scores are comparable across entity types.
 * The CandidateFactory fills defaults for anything a repository could not
 * compute.
 */
export interface IndexDocumentRanking {
  textRelevance?: number;
  textSimilarity?: number;
  phraseRelevance?: number;
  exactMatch?: boolean;
  exactPhrase?: boolean;
  engagementScore?: number;
  interestScore?: number;
  creatorAuthorityScore?: number;
}

/**
 * A normalized, type-agnostic document produced by a search repository.
 * Repositories retrieve rows, apply repository-level privacy and project
 * ranking primitives. They never rank, resolve identity or build wire DTOs.
 */
export interface IndexDocument {
  id: string;
  type: SearchEntityType;
  subType: string;
  title: string;
  description?: string;
  publishedAt?: Date;
  updatedAt?: Date;
  platform?: string;
  externalId?: string;
  creatorId?: string;
  creatorName?: string;
  creatorUsername?: string;
  creatorAvatar?: string;
  verified?: boolean;
  followerCount?: number;
  subscriberCount?: number;
  totalPosts?: number;
  engagementScore?: number;
  engagement?: EngagementMetrics;
  thumbnailUrl?: string;
  mediaUrl?: string;
  tags?: string[];
  ranking?: IndexDocumentRanking;
  metadata: Record<string, any>;
}
