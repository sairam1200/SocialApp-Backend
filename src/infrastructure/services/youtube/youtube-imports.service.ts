import { IYoutubeImportService } from "domain/services/youtube/iyoutube-import.services";
import { Injectable, Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { ILinkedAccountRepository } from "../../../domain/repositories/ilinkedAccount.repository";
import { IUserContentRepository } from "../../../domain/repositories/iuserContent.repository";
import axios from "axios";
import { UserContent } from "../../../domain/entities/userContent.entity";
@Injectable()
export class YoutubeImportService
  implements IYoutubeImportService {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,

    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) { }

  async importUploadsAsync(
    userId: string,
    accessToken: string,
  ): Promise<number> {

    let importedCount = 0;

    // move uploads logic here

    return importedCount;
  }

  async importSubscriptionsAsync(
    userId: string,
    accessToken: string,
  ): Promise<number> {

    let importedCount = 0;
    await this.userContentRepository.deleteByUserIdAndPlatformAsync(
      userId,
      _const.PLATFORMS.YOUTUBE,
    );
    const feedResponse = await axios.get(
      "https://www.googleapis.com/youtube/v3/subscriptions",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          part: "snippet",
          mine: true,
          maxResults: 50,
        },
      },
    );

    const feed = feedResponse.data?.items ?? [];

    for (const subscription of feed) {
  const subscribedChannelId =
    subscription.snippet?.resourceId?.channelId;

  if (!subscribedChannelId) {
    continue;
  }

  const latestVideosResponse = await axios.get(
    "https://www.googleapis.com/youtube/v3/search",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        part: "snippet",
        channelId: subscribedChannelId,
        order: "date",
        type: "video",
        maxResults: 5,
      },
    },
  );

  const latestVideos =
    latestVideosResponse.data?.items ?? [];

  const videoIds = latestVideos
    .map(v => v.id?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) {
    continue;
  }

  const statsResponse = await axios.get(
    "https://www.googleapis.com/youtube/v3/videos",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        part: "statistics",
        id: videoIds.join(","),
      },
    },
  );

  const statisticsMap = new Map(
    (statsResponse.data?.items ?? []).map(item => [
      item.id,
      item.statistics,
    ]),
  );

  for (const video of latestVideos) {
    const videoId = video.id?.videoId;

    if (!videoId) {
      continue;
    }

    const stats = statisticsMap.get(videoId) as {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    } | undefined;

    await this.userContentRepository.createAsync(
      new UserContent({
        userId,
        platform: _const.PLATFORMS.YOUTUBE,
        type: "subscription_video",
        externalId: videoId,
        title: video.snippet?.title ?? "Untitled Video",
        metaData: {
          videoId,
          description: video.snippet?.description,
          publishedAt: video.snippet?.publishedAt,

          viewCount: Number(stats?.viewCount ?? 0),
          likeCount: Number(stats?.likeCount ?? 0),
          commentCount: Number(stats?.commentCount ?? 0),

          thumbnail:
            video.snippet?.thumbnails?.high?.url ??
            video.snippet?.thumbnails?.medium?.url ??
            video.snippet?.thumbnails?.default?.url,

          channelId: video.snippet?.channelId,
          channelTitle: video.snippet?.channelTitle,

          youtubeUrl:
            `https://www.youtube.com/watch?v=${videoId}`,

          importedAt: new Date().toISOString(),
        },
      }),
    );

    importedCount++;
  }
}

    return importedCount;
  }
  async refreshChannelProfileAsync(
    userId: string,
    accessToken: string,
  ): Promise<void> {

    // move channel profile update logic here
  }
}