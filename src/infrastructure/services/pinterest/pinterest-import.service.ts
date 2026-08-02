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

const BASE_URL = 'https://api.pinterest.com/v5';

@Injectable()
export class PinterestImportService {
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

  async importPinsAsync(
    userId: string,
    accessToken: string,
    pinterestUserId: string,
  ): Promise<number> {
    let importedCount = 0;

    const linkedAccount = await this.ownershipResolver.resolveAsync(
      userId,
      _const.PLATFORMS.PINTEREST,
    );
    const linkedAccountId = linkedAccount.id;

    await this.userContentRepository.deleteByUserIdAndPlatformAsync(
      userId,
      _const.PLATFORMS.PINTEREST,
    );

    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    const boardsResponse = await axios.get(`${BASE_URL}/boards`, { headers });

    const boards = boardsResponse.data?.items ?? [];

    for (const board of boards) {
      try {
        const pinsResponse = await axios.get(
          `${BASE_URL}/boards/${board.id}/pins`,
          { headers },
        );

        const pins = pinsResponse.data?.items ?? [];

        for (const pin of pins) {
          const imageUrl =
            pin.media?.images?.['1200x']?.url ??
            pin.media?.images?.['600x']?.url ??
            null;

          let analytics = {
            impressions: 0,
            saves: 0,
            pinClicks: 0,
            outboundClicks: 0,
          };
          const pinCreatedAt = new Date(pin.created_at);

          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);

          const analyticsStartDate =
            pinCreatedAt > ninetyDaysAgo ? pinCreatedAt : ninetyDaysAgo;
          try {
            const analyticsResponse = await axios.get(
              `${BASE_URL}/pins/${pin.id}/analytics`,
              {
                headers,
                params: {
                  start_date: analyticsStartDate.toISOString().split('T')[0],

                  end_date: new Date().toISOString().split('T')[0],
                  metric_types: 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK',
                },
              },
            );

            const analyticsData = analyticsResponse.data;
            analytics = {
              impressions:
                analyticsData?.IMPRESSION ?? analyticsData?.impression ?? 0,

              saves: analyticsData?.SAVE ?? analyticsData?.save ?? 0,

              pinClicks:
                analyticsData?.PIN_CLICK ?? analyticsData?.pin_click ?? 0,

              outboundClicks:
                analyticsData?.OUTBOUND_CLICK ??
                analyticsData?.outbound_click ??
                0,
            };
          } catch (analyticsError) {
            logger.warn(
              `[Pinterest] Analytics unavailable for pin ${pin.id}`,
            );
          }

          const content = new UserContent({
            userId,
            linkedAccountId,

            platform: _const.PLATFORMS.PINTEREST,
            type: 'PIN',
            externalId: pin.id,

            title:
              pin.title ||
              pin.description?.substring(0, 150) ||
              'Pinterest Pin',

            sourceUrl: pin.link || null,

            text: pin.description || undefined,

            media: imageUrl
              ? [{ url: imageUrl, type: 'image', thumbnail: imageUrl }]
              : undefined,

            publishedAt: pin.created_at ? new Date(pin.created_at) : undefined,

            engagement: analytics
              ? {
                  views: analytics.impressions ?? 0,
                  likes: analytics.saves ?? 0,
                }
              : undefined,

            metaData: {
              description: pin.description,
              imageUrl,

              boardId: board.id,
              boardName: board.name,

              link: pin.link,

              createdAt: pin.created_at,

              note: pin.note,

              analytics,

              importedAt: new Date().toISOString(),

              creatorName: linkedAccount.userName,
              creatorUsername: linkedAccount.userName,
              creatorAvatar: linkedAccount.profileImage,
              creatorUrl:
                linkedAccount.externalUrl ||
                `https://www.pinterest.com/${linkedAccount.userName}/`,
              verified: linkedAccount.verified,
            },
          });

          await this.preserveExistingEngagement(content);
          const saved = await this.userContentRepository.createAsync(content);
          await this.contentStreamIndexService.upsertFromUserContent(saved);

          importedCount++;
        }
      } catch (error) {
        logger.warn(
          `[Pinterest] Failed to import board ${board.id}`,
        );
      }
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
    pinterestUserId: string,
  ): Promise<void> {
    const response = await axios.get(`${BASE_URL}/user_account`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const profile = response.data;

    const linkedAccount =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.PINTEREST,
        userId,
      );

    if (!linkedAccount) {
      throw new Error('Pinterest linked account not found');
    }

    linkedAccount.externalId = profile.id;

    linkedAccount.userName = profile.username;

    linkedAccount.profileImage = profile.profile_image;

    linkedAccount.followersCount = profile.follower_count ?? 0;

    linkedAccount.followingCount = profile.following_count ?? 0;

    linkedAccount.metaData = {
      ...(linkedAccount.metaData ?? {}),

      monthlyViews: profile.monthly_views ?? 0,

      boardCount: profile.board_count ?? 0,

      pinCount: profile.pin_count ?? 0,

      websiteUrl: profile.website_url,

      about: profile.about,
    };

    await this.linkedAccountRepository.updateAsync(linkedAccount);
  }
}
