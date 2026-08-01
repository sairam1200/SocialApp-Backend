import { Inject, Injectable } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { SearchEntityType } from '../../../domain/contracts/search/search-entity-type';
import { IndexDocument } from '../../../domain/contracts/search/index-document.model';
import {
  ISearchRepository,
  SearchRepositoryCapabilities,
  SearchRepositoryQuery,
} from '../../../domain/contracts/search/search-repository.interface';
import { IIdentityRepository } from '../../../domain/repositories/iidentity.repository';
import { SearchUserProjection } from '../../../domain/repositories/iidentity.repository';
import { normalizedLog } from '../../../features/search/ranking/score.utils';

/**
 * Profile repository. Wraps IIdentityRepository.searchGlobalAsync, which
 * already enforces the privacy rules (Public or followed-by-viewer, active,
 * regular users) and returns paginated projections.
 */
@Injectable()
export class ProfileSearchRepository implements ISearchRepository {
  readonly name = 'profile';
  readonly capabilities: SearchRepositoryCapabilities = {
    supports: ['exact', 'privacy', 'pagination'],
  };

  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly identityRepository: IIdentityRepository,
  ) {}

  async search(query: SearchRepositoryQuery): Promise<IndexDocument[]> {
    if (!query.normalizedQuery) return [];
    if (
      query.entityType !== undefined &&
      query.entityType !== SearchEntityType.PROFILE
    ) {
      return [];
    }

    const [rows] = await this.identityRepository.searchGlobalAsync(
      query.normalizedQuery,
      query.viewerUserId ?? null,
      1,
      query.limit,
    );

    return rows.map((row) => this.toIndexDocument(row, query.normalizedQuery));
  }

  private toIndexDocument(
    profile: SearchUserProjection,
    query: string,
  ): IndexDocument {
    const displayName =
      [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() ||
      profile.userName ||
      '';
    const textRelevance = this.deriveTextRelevance(profile, query);
    const followers = profile.followersCount ?? 0;
    const followerScore = normalizedLog(followers, 5_000_000);

    return {
      id: profile.id,
      type: SearchEntityType.PROFILE,
      subType: 'user',
      title: displayName,
      description: profile.bio || '',
      platform: 'gaddr',
      externalId: profile.id,
      creatorId: profile.id,
      creatorName: displayName,
      creatorUsername: profile.userName,
      creatorAvatar: profile.profileImage || '',
      verified: profile.verified ?? false,
      followerCount: followers,
      totalPosts: profile.totalPosts ?? 0,
      engagementScore: followerScore,
      ranking: {
        textRelevance,
        textSimilarity: textRelevance,
        exactMatch: textRelevance >= 100,
        engagementScore: followerScore,
        creatorAuthorityScore: followerScore,
      },
      metadata: { ...profile },
    };
  }

  private deriveTextRelevance(
    profile: SearchUserProjection,
    query: string,
  ): number {
    const q = query.toLowerCase();
    const userName = (profile.userName || '').toLowerCase();
    const displayName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (userName === q || displayName === q) return 100;
    if (userName.startsWith(q) || displayName.startsWith(q)) return 80;
    return 50;
  }
}
