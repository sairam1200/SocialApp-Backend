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
  private parseDurationToSeconds(duration: string): number {
    const match = duration.match(
      /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
    );

    if (!match) return 0;

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);

    return hours * 3600 + minutes * 60 + seconds;
  }
  async importUploadsAsync(
    userId: string,
    accessToken: string,
  ): Promise<number> {

    let importedCount = 0;

    const channelResponse = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          part: "snippet,contentDetails",
          mine: true,
        },
      },
    );
    console.info(
  `[YoutubeImport] Importing subscriptions for channel: ${channelResponse.data.items?.[0]?.id}`
);

console.info(
  `[YoutubeImport] Channel title: ${channelResponse.data.items?.[0]?.snippet?.title}`
);
    const channel = channelResponse.data?.items?.[0];
    if (!channel) return 0;

    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return 0;

    let nextPageToken: string | null = null;

    do {
      const playlistResponse = await axios.get(
        "https://www.googleapis.com/youtube/v3/playlistItems",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            part: "snippet,contentDetails",
            playlistId: uploadsPlaylistId,
            maxResults: 50,
            pageToken: nextPageToken ?? undefined,
          },
        },
      );

      const items = playlistResponse.data?.items ?? [];
      nextPageToken = playlistResponse.data?.nextPageToken ?? null;

      const videoIds = items
        .map((v: any) => v.contentDetails?.videoId)
        .filter(Boolean);

      if (videoIds.length === 0) continue;

      const statsResponse = await axios.get(
        "https://www.googleapis.com/youtube/v3/videos",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            part: "statistics,contentDetails",
            id: videoIds.join(","),
          },
        },
      );

      const videoDetailsMap = new Map(
        (statsResponse.data?.items ?? []).map((item: any) => [
          item.id,
          {
            statistics: item.statistics,
            duration: item.contentDetails?.duration,
          },
        ]),
      );

      for (const item of items) {
        const videoId = item.contentDetails?.videoId;
        if (!videoId) continue;

        const details = videoDetailsMap.get(videoId) as
          | {
              statistics?: {
                viewCount?: string;
                likeCount?: string;
                commentCount?: string;
              };
              duration?: string;
            }
          | undefined;

        const duration = details?.duration ?? "PT0S";
        const durationSeconds = this.parseDurationToSeconds(duration);
        const isShort = durationSeconds <= 180;

        await this.userContentRepository.createAsync(
          new UserContent({
            userId,
            platform: _const.PLATFORMS.YOUTUBE,
            type: "uploaded_video",
            externalId: videoId,
            title: item.snippet?.title ?? "Untitled Video",
            metaData: {
              videoId,
              isShort,
              duration,
              description: item.snippet?.description,
              publishedAt: item.snippet?.publishedAt,
              viewCount: Number(details?.statistics?.viewCount ?? 0),
              likeCount: Number(details?.statistics?.likeCount ?? 0),
              commentCount: Number(details?.statistics?.commentCount ?? 0),
              thumbnailUrl:
                item.snippet?.thumbnails?.high?.url ??
                item.snippet?.thumbnails?.medium?.url ??
                item.snippet?.thumbnails?.default?.url,
              channelId: channel.id,
              channelTitle: channel.snippet?.title,
              youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
              importedAt: new Date().toISOString(),
            },
          }),
        );

        importedCount++;
      }
    } while (nextPageToken);

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
            part: "statistics,contentDetails",
            id: videoIds.join(","),
          },
        },
      );
      const videoDetailsMap = new Map(
        (statsResponse.data?.items ?? []).map(item => [
          item.id,
          {
            statistics: item.statistics,
            duration: item.contentDetails?.duration,
          },
        ]),
      );

      for (const video of latestVideos) {
        const videoId = video.id?.videoId;

        if (!videoId) {
          continue;
        }

        const details = videoDetailsMap.get(videoId) as
          | {
            statistics?: {
              viewCount?: string;
              likeCount?: string;
              commentCount?: string;
            };
            duration?: string;
          }
          | undefined;

        const duration = details?.duration ?? "PT0S";

        const durationSeconds =
          this.parseDurationToSeconds(duration);

        const isShort = durationSeconds <= 180;
        await this.userContentRepository.createAsync(
          new UserContent({
            userId,
            platform: _const.PLATFORMS.YOUTUBE,
            type: "subscription_video",
            externalId: videoId,
            title: video.snippet?.title ?? "Untitled Video",
            metaData: {
              videoId,
              isShort,
              duration,
              description: video.snippet?.description,
              publishedAt: video.snippet?.publishedAt,

              viewCount: Number(details?.statistics.likeCount ?? 0),
              likeCount: Number(details?.statistics.likeCount ?? 0),
              commentCount: Number(details?.statistics.commentCount ?? 0),

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