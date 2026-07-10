import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';

import _const from '../../../core/utils/const';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { UserContent } from '../../../domain/entities/userContent.entity';

@Injectable()
export class InstagramImportService {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  async importMediaAsync(
    userId: string,
    accessToken: string,
    instagramUserId: string,
  ): Promise<number> {
    let importedCount = 0;

    await this.userContentRepository.deleteByUserIdAndPlatformAsync(
      userId,
      _const.PLATFORMS.INSTAGRAM,
    );

    const mediaResponse = await axios.get(
      'https://graph.instagram.com/me/media',
      {
        params: {
          fields:
            'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
          access_token: accessToken,
        },
      },
    );

    const mediaItems = mediaResponse.data?.data ?? [];

    console.log('check', mediaItems);
    for (const media of mediaItems) {
      let reach = 0;
      let impressions = 0;
      let saved = 0;

      try {
        const insightsResponse = await axios.get(
          `https://graph.instagram.com/${media.id}/insights`,
          {
            params: {
              metric: 'reach,impressions,saved',
              access_token: accessToken,
            },
          },
        );

        const insightMap = new Map(
          (insightsResponse.data?.data ?? []).map((item: any) => [
            item.name,
            item.values?.[0]?.value,
          ]),
        );

        reach = Number(insightMap.get('reach') ?? 0);
        impressions = Number(insightMap.get('impressions') ?? 0);
        saved = Number(insightMap.get('saved') ?? 0);
      } catch (error: any) {
        const message = error?.response?.data?.error?.message ?? '';

        if (message.includes('impressions metric')) {
          try {
            const fallbackResponse = await axios.get(
              `https://graph.instagram.com/${media.id}/insights`,
              {
                params: {
                  metric: 'reach,saved',
                  access_token: accessToken,
                },
              },
            );

            const insightMap = new Map(
              (fallbackResponse.data?.data ?? []).map((item: any) => [
                item.name,
                item.values?.[0]?.value,
              ]),
            );

            reach = Number(insightMap.get('reach') ?? 0);
            saved = Number(insightMap.get('saved') ?? 0);
          } catch (fallbackError) {
            console.warn(
              `[Instagram] Fallback insights unavailable for media ${media.id}`,
              fallbackError,
            );
          }
        } else {
          console.warn(
            `[Instagram] Insights unavailable for media ${media.id}`,
            error?.response?.data,
          );
        }
      }
      await this.userContentRepository.createAsync(
        new UserContent({
          userId,
          platform: _const.PLATFORMS.INSTAGRAM,

          type: media.media_type,

          externalId: media.id,

          title:'Instagram ' + (media.media_type ? ` ${media.media_type}` : ''),

          sourceUrl: media.permalink,

          metaData: {
            caption: media.caption,
            mediaType: media.media_type,
            mediaUrl: media.media_url,
            permalink: media.permalink,

            likeCount: media.like_count ?? 0,
            commentsCount: media.comments_count ?? 0,

            thumbnailUrl: media.thumbnail_url ?? media.media_url,

            timestamp: media.timestamp,

            importedAt: new Date().toISOString(),
            reach,

            saved,
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
    instagramUserId: string,
  ): Promise<void> {
    const response = await axios.get('https://graph.instagram.com/me', {
      params: {
        fields: 'id,username,media_count',
        access_token: accessToken,
      },
    });

    const profile = response.data;

    const linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.INSTAGRAM,
        userId,
      );

    if (!linkedAccount) {
      throw new Error('Instagram linked account not found');
    }

    linkedAccount.externalId = profile.id;

    linkedAccount.userName = profile.username;

    linkedAccount.metaData = {
      ...(linkedAccount.metaData ?? {}),
      mediaCount: profile.media_count ?? 0,
    };

    await this.linkedAccountRepository.updateAsync(linkedAccount);
  }
}
