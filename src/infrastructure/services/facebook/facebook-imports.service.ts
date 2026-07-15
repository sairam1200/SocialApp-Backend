import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';

import _const from '../../../core/utils/const';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { UserContent } from '../../../domain/entities/userContent.entity';

@Injectable()
export class FacebookImportService {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  async importPagePostsAsync(
    userId: string,
    accessToken: string,
    pageAccessToken: string,
    pageId: string,
  ): Promise<number> {
    let importedCount = 0;

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
      await this.userContentRepository.createAsync(
        new UserContent({
          userId,

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
