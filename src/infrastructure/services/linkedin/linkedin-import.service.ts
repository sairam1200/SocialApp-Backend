import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';

import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { IOwnershipResolver } from '../../../domain/services/iownership-resolver.service';
import { UserContent } from '../../../domain/entities/userContent.entity';

@Injectable()
export class LinkedInImportService {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,

    @Inject(_const.IOWNERSHIP_RESOLVER)
    private readonly ownershipResolver: IOwnershipResolver,
  ) {}

  async importOrganizationPostsAsync(
    userId: string,
    accessToken: string,
    organizationId: string,
  ): Promise<number> {
    let importedCount = 0;

    const linkedAccountId = (
      await this.ownershipResolver.resolveAsync(
        userId,
        _const.PLATFORMS.LINKEDIN,
      )
    ).id;

    await this.userContentRepository.deleteByUserIdAndPlatformAsync(
      userId,
      _const.PLATFORMS.LINKEDIN,
    );

    const organizationUrn = `urn:li:organization:${organizationId}`;

    const response = await axios.get('https://api.linkedin.com/rest/posts', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'LinkedIn-Version': '202401',
      },
      params: {
        q: 'author',
        author: organizationUrn,
        count: 100,
      },
    });

    const posts = response.data?.results ?? response.data?.elements ?? [];

    for (const post of posts) {
      const impressions = 0;
      let reactions = 0;
      let comments = 0;
      const shares = 0;

      try {
        const analyticsResponse = await axios.get(
          `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(
            post.id,
          )}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'LinkedIn-Version': '202401',
            },
          },
        );

        reactions = analyticsResponse.data?.likesSummary?.totalLikes ?? 0;

        comments =
          analyticsResponse.data?.commentsSummary?.totalFirstLevelComments ?? 0;
      } catch (err) {
        logger.warn(`Analytics unavailable for ${post.id}`);
      }

      await this.userContentRepository.createAsync(
        new UserContent({
          userId,
          linkedAccountId,

          platform: _const.PLATFORMS.LINKEDIN,

          type: post.lifecycleState ?? 'POST',

          externalId: post.id,

          title: post.commentary?.substring(0, 150) || 'LinkedIn Post',

          sourceUrl: `https://www.linkedin.com/feed/update/${post.id}`,

          text: post.commentary || undefined,

          publishedAt: post.createdAt ? new Date(post.createdAt) : undefined,

          engagement: {
            likes: reactions,
            comments,
            shares,
          },

          metaData: {
            commentary: post.commentary,

            author: post.author,

            created: post.createdAt,

            lastModified: post.lastModifiedAt,

            visibility: post.visibility,

            distribution: post.distribution,

            content: post.content,

            activity: post.activity,

            impressions,
            reactions,
            comments,
            shares,

            importedAt: new Date().toISOString(),
          },
        }),
      );

      importedCount++;
    }

    return importedCount;
  }
  async refreshProfileAsync(
    userId: string,
    accessToken: string,
  ): Promise<void> {
    const profileResponse = await axios.get(
      'https://api.linkedin.com/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const profile = profileResponse.data;

    const linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.LINKEDIN,
        userId,
      );

    if (!linkedAccount) {
      throw new Error('LinkedIn linked account not found');
    }

    linkedAccount.externalId = profile.sub;

    linkedAccount.userName = profile.name;

    linkedAccount.email = profile.email;

    linkedAccount.profileImage = profile.picture;

    linkedAccount.metaData = {
      ...(linkedAccount.metaData ?? {}),

      firstName: profile.given_name,

      lastName: profile.family_name,

      headline: profile.headline,

      profileUrl: profile.profile,

      importedAt: new Date().toISOString(),
    };

    await this.linkedAccountRepository.updateAsync(linkedAccount);
  }
}
