import { Injectable, Inject } from '@nestjs/common';
import axios from 'axios';

import _const from '../../../core/utils/const';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
import { UserContent } from '../../../domain/entities/userContent.entity';

const BASE_URL = 'https://api.pinterest.com/v5';

@Injectable()
export class PinterestImportService {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  async importPinsAsync(
    userId: string,
    accessToken: string,
    pinterestUserId: string,
  ): Promise<number> {
    let importedCount = 0;

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
            console.log(analyticsData);
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
            console.warn(
              `[Pinterest] Analytics unavailable for pin ${pin.id}`,
              analyticsError?.response?.data,
            );
          }

          await this.userContentRepository.createAsync(
            new UserContent({
              userId,
              platform: _const.PLATFORMS.PINTEREST,
              type: 'PIN',
              externalId: pin.id,

              title:
                pin.title ||
                pin.description?.substring(0, 150) ||
                'Pinterest Pin',

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
              },
            }),
          );

          importedCount++;
        }
      } catch (error) {
        console.warn(
          `[Pinterest] Failed to import board ${board.id}`,
          error?.response?.data,
        );
      }
    }

    return importedCount;
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
