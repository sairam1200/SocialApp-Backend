import { Injectable } from '@nestjs/common';
import { SearchCandidate } from '../../../domain/contracts/search/search-candidate.model';
import { SearchResult } from '../../../domain/contracts/search/search-result.model';
import { ResolvedCreatorIdentity } from '../../../domain/contracts/resolved-creator-identity.dto';

/**
 * Builds wire SearchResult DTOs from ranked candidates. Pure mapping: no
 * ranking, no identity decisions beyond overlaying the resolved identity.
 */
@Injectable()
export class ResponseAdapter {
  toResult(
    candidate: SearchCandidate,
    identity?: ResolvedCreatorIdentity | null,
  ): SearchResult {
    const doc = candidate.document;
    const meta = doc.metadata || {};
    const engagement = doc.engagement || {};
    const resolvedIdentity = identity ?? candidate.gaddrIdentity ?? null;

    const result: SearchResult = {
      id: doc.id,
      platform: doc.platform || 'gaddr',
      externalId: doc.externalId || doc.id,
      type: doc.type,
      subType: doc.subType,
      title: doc.title,
      description: doc.description || meta.description || '',
      thumbnailUrl: doc.thumbnailUrl || '',
      mediaUrl: doc.mediaUrl || '',
      creatorName:
        doc.creatorName || meta.channelName || meta.creatorName || '',
      creatorUsername:
        doc.creatorUsername || meta.channelUsername || meta.channelHandle,
      creatorAvatar: doc.creatorAvatar || '',
      creator: resolvedIdentity,
      publishedAt: doc.publishedAt,
      engagement: {
        viewCount: engagement.viewCount || 0,
        likeCount: engagement.likeCount || 0,
        commentCount: engagement.commentCount || 0,
        shareCount: engagement.shareCount || 0,
        subscriberCount: engagement.subscriberCount || 0,
        followerCount: engagement.followerCount || 0,
      },
      score: candidate.finalScore ?? 0,
      rank: 0,
      platformMetadata: meta,
    };

    if (resolvedIdentity) {
      if (resolvedIdentity.displayName) {
        result.creatorName = resolvedIdentity.displayName;
      }
      if (resolvedIdentity.handle) {
        result.creatorUsername = resolvedIdentity.handle;
      }
      if (resolvedIdentity.profileImage) {
        result.creatorAvatar = resolvedIdentity.profileImage;
      }
    }

    return result;
  }

  toResults(candidates: SearchCandidate[]): SearchResult[] {
    return candidates.map((candidate) => this.toResult(candidate));
  }

  assignRanks(results: SearchResult[]): SearchResult[] {
    return results.map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
  }
}
