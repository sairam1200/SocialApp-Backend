import { SearchEntityType } from './search-entity-type';
import { ResolvedCreatorIdentity } from '../resolved-creator-identity.dto';

export interface SearchResult {
  id: string;
  platform: string;
  externalId: string;
  type: SearchEntityType;
  subType: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  mediaUrl: string;
  creatorName: string;
  creatorUsername?: string;
  creatorAvatar: string;
  creator?: ResolvedCreatorIdentity | null;
  publishedAt?: Date;
  engagement: EngagementMetrics;
  score: number;
  rank: number;
  platformMetadata: Record<string, any>;
}

export interface EngagementMetrics {
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  subscriberCount?: number;
  followerCount?: number;
}
