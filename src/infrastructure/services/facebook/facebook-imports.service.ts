import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';

import _const from '../../../core/utils/const';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { IContentStreamRepository } from '../../../domain/repositories/icontentStream.repository';
import { IOwnershipResolver } from '../../../domain/services/iownership-resolver.service';
import { IContentStreamIndexService } from '../../../domain/services/icontentStreamIndex.service';
import { UserContent } from '../../../domain/entities/userContent.entity';

@Injectable()
export class FacebookImportService {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,

    @Inject(_const.ICONTENTSTREAM_REPOSITORY)
    private readonly contentStreamRepository: IContentStreamRepository,

    @Inject(_const.IOWNERSHIP_RESOLVER)
    private readonly ownershipResolver: IOwnershipResolver,

    @Inject(_const.ICONTENTSTREAM_INDEX_SERVICE)
    private readonly contentStreamIndexService: IContentStreamIndexService,
  ) {}

  async importPagePostsAsync(
    userId: string,
    accessToken: string,
    pageAccessToken: string,
    pageId: string,
  ): Promise<number> {
    let importedCount = 0;

    const linkedAccount = await this.ownershipResolver.resolveAsync(
      userId,
      _const.PLATFORMS.FACEBOOK,
    );
    const linkedAccountId = linkedAccount.id;

    await this.userContentRepository.deleteByUserIdAndPlatformAsync(
      userId,
      _const.PLATFORMS.FACEBOOK,
    );

    const postsResponse = await axios.get(
      `https://graph.facebook.com/v23.0/${pageId}/posts`,
      {
        params: {
          fields:
            'id,message,created_time,permalink_url,full_picture,attachments{media_type,type}',
          access_token: pageAccessToken,
        },
      },
    );
    const posts = postsResponse.data?.data ?? [];

    for (const post of posts) {
      /*  let impressions = 0;
      let reach = 0;
      let engagedUsers = 0; */
      const statsResponse = await axios.get(
        `https://graph.facebook.com/v23.0/${post.id}`,
        {
          params: {
            fields: 'shares,reactions.summary(true),comments.summary(true)',
            access_token: pageAccessToken,
          },
        },
      );
      const reactions =
        statsResponse.data?.reactions?.summary?.total_count ?? 0;

      const comments = statsResponse.data?.comments?.summary?.total_count ?? 0;

      const shares = statsResponse.data?.shares?.count ?? 0;
      const mediaType = post.attachments?.data?.[0]?.media_type;

      const attachmentType = post.attachments?.data?.[0]?.type;
      const content = new UserContent({
        userId,
        linkedAccountId,

        platform: _const.PLATFORMS.FACEBOOK,

        type: mediaType ?? attachmentType ?? 'post',

        externalId: post.id,

        title: 'Facebook ' + (mediaType ? ` ${mediaType}` : ''),

        sourceUrl: post.permalink_url,

        text: post.message || undefined,

        media: post.full_picture
          ? [
              {
                url: post.full_picture,
                type: mediaType ?? 'image',
                thumbnail: post.full_picture,
              },
            ]
          : undefined,

        publishedAt: post.created_time
          ? new Date(post.created_time)
          : undefined,

        engagement: { likes: reactions, comments, shares },

        metaData: {
          message: post.message,
          permalink: post.permalink_url,
          imageUrl: post.full_picture,

          createdTime: post.created_time,

          analytics: {
            reactions,
            comments,
            shares,
            engagement: reactions + comments + shares,
          },

          importedAt: new Date().toISOString(),

          creatorName: linkedAccount.userName,
          creatorUsername: linkedAccount.userName,
          creatorAvatar: linkedAccount.profileImage,
          creatorUrl:
            linkedAccount.externalUrl ||
            `https://www.facebook.com/${linkedAccount.externalId}`,
          verified: linkedAccount.verified,
        },
      });

      await this.preserveExistingEngagement(content);
      const saved = await this.userContentRepository.createAsync(content);
      await this.contentStreamIndexService.upsertFromUserContent(saved);

      importedCount++;
    }

    return importedCount;
  }

  private async preserveExistingEngagement(
    content: UserContent,
  ): Promise<void> {
    if (this.hasRealEngagement(content.engagement)) return;
    const existing = await this.fetchExistingEngagement(
      content.platform,
      content.externalId,
    );
    if (!existing) return;
    content.engagement = {
      ...(existing.views != null ? { views: existing.views } : {}),
      ...(existing.likes != null ? { likes: existing.likes } : {}),
      ...(existing.comments != null ? { comments: existing.comments } : {}),
      ...(existing.shares != null ? { shares: existing.shares } : {}),
    };
    content.metaData = {
      ...(content.metaData ?? {}),
      ...(existing.views != null ? { viewCount: existing.views } : {}),
      ...(existing.likes != null ? { likeCount: existing.likes } : {}),
      ...(existing.comments != null ? { commentCount: existing.comments } : {}),
      ...(existing.shares != null ? { shareCount: existing.shares } : {}),
    };
  }

  private hasRealEngagement(engagement: any): boolean {
    if (!engagement || typeof engagement !== 'object') return false;
    return [
      engagement.views,
      engagement.likes,
      engagement.comments,
      engagement.shares,
    ].some((value) => Number(value) > 0);
  }

  private async fetchExistingEngagement(
    platform: string,
    externalId: string,
  ): Promise<{
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  } | null> {
    try {
      const [rows] = await this.contentStreamRepository.getEntriesAsync({
        page: 1,
        pageSize: 1,
        filter: { platform, externalId },
      });
      const existing = rows?.[0]?.metaData?.engagement as
        Record<string, any> | undefined;
      if (!existing || typeof existing !== 'object') return null;
      const toNum = (value: unknown): number | undefined => {
        if (value == null) return undefined;
        const n = Number(value);
        return Number.isNaN(n) ? undefined : n;
      };
      return {
        views: toNum(existing.viewCount ?? existing.views),
        likes: toNum(existing.likeCount ?? existing.likes),
        comments: toNum(existing.commentCount ?? existing.comments),
        shares: toNum(existing.shareCount ?? existing.shares),
      };
    } catch {
      return null;
    }
  }

  async refreshProfileAsync(
    userId: string,
    accessToken: string,
    pageId: string,
  ): Promise<void> {
    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${pageId}`,
      {
        params: {
          fields: 'id,name,fan_count,followers_count',
          access_token: accessToken,
        },
      },
    );

    const profile = response.data;

    const linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.FACEBOOK,
        userId,
      );

    if (!linkedAccount) {
      throw new Error('Facebook linked account not found');
    }

    linkedAccount.externalId = profile.id;

    linkedAccount.userName = profile.name;

    linkedAccount.metaData = {
      ...(linkedAccount.metaData ?? {}),
      fanCount: profile.fan_count ?? 0,
      followersCount: profile.followers_count ?? 0,
    };

    await this.linkedAccountRepository.updateAsync(linkedAccount);
  }
}
