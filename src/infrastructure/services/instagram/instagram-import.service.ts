import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';

import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { IContentStreamRepository } from '../../../domain/repositories/icontentStream.repository';
import { IOwnershipResolver } from '../../../domain/services/iownership-resolver.service';
import { IContentStreamIndexService } from '../../../domain/services/icontentStreamIndex.service';
import { UserContent } from '../../../domain/entities/userContent.entity';

@Injectable()
export class InstagramImportService {
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

  async importMediaAsync(
    userId: string,
    accessToken: string,
    instagramUserId: string,
  ): Promise<number> {
    let importedCount = 0;

    const linkedAccount = await this.ownershipResolver.resolveAsync(
      userId,
      _const.PLATFORMS.INSTAGRAM,
    );
    const linkedAccountId = linkedAccount.id;

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
            logger.warn(
              `[Instagram] Fallback insights unavailable for media ${media.id}`,
            );
          }
        } else {
          logger.warn(`[Instagram] Insights unavailable for media ${media.id}`);
        }
      }
      const content = new UserContent({
        userId,
        linkedAccountId,

        platform: _const.PLATFORMS.INSTAGRAM,

        type: media.media_type,

        externalId: media.id,

        title:
          'Instagram ' +
          (media.media_type ? ` ${media.media_type.toLowerCase()}` : ''),

        sourceUrl: media.permalink,

        text: media.caption || undefined,

        media: [
          {
            url: media.media_url || media.thumbnail_url,
            type: media.media_type,
            thumbnail: media.thumbnail_url || media.media_url,
          },
        ],

        publishedAt: media.timestamp ? new Date(media.timestamp) : undefined,

        engagement: {
          likes: media.like_count ?? 0,
          comments: media.comments_count ?? 0,
        },

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

          creatorName: linkedAccount.userName,
          creatorUsername: linkedAccount.userName,
          creatorAvatar: linkedAccount.profileImage,
          creatorUrl:
            linkedAccount.externalUrl ||
            `https://www.instagram.com/${linkedAccount.userName}/`,
          verified: linkedAccount.verified,
        },
      });

      await this.preserveExistingEngagement(content);
      const savedContent =
        await this.userContentRepository.createAsync(content);
      await this.contentStreamIndexService.upsertFromUserContent(savedContent);

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
