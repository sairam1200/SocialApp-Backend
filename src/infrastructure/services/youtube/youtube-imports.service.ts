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
    const importStartTime = Date.now();
    const startMemory = process.memoryUsage();
    console.log(
      `[YoutubeImport.DIAG] importUploadsAsync START userId=${userId} memory=${JSON.stringify({ rss: Math.round(startMemory.rss / 1024 / 1024) + 'MB', heapUsed: Math.round(startMemory.heapUsed / 1024 / 1024) + 'MB' })}`,
    );

    let importedCount = 0;
    let pageCount = 0;

    try {
      const channelStartTime = Date.now();
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
      const channelDuration = Date.now() - channelStartTime;
      console.log(
        `[YoutubeImport.DIAG] GET channels duration=${channelDuration}ms status=${channelResponse.status}`,
      );

      console.info(
        `[YoutubeImport] Importing subscriptions for channel: ${channelResponse.data.items?.[0]?.id}`,
      );

      console.info(
        `[YoutubeImport] Channel title: ${channelResponse.data.items?.[0]?.snippet?.title}`,
      );
      const channel = channelResponse.data?.items?.[0];
      if (!channel) {
        console.log(`[YoutubeImport.DIAG] No channel found, returning 0`);
        return 0;
      }

      const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        console.log(`[YoutubeImport.DIAG] No uploads playlist found, returning 0`);
        return 0;
      }
      console.log(`[YoutubeImport.DIAG] uploadsPlaylistId=${uploadsPlaylistId}`);

      let nextPageToken: string | null = null;

      do {
        pageCount++;
        const pageStartTime = Date.now();
        const playlistStartTime = Date.now();

        let playlistResponse;
        try {
          playlistResponse = await axios.get(
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
        } catch (err: any) {
          console.error(
            `[YoutubeImport.DIAG] FAIL playlistItems page=${pageCount} pageToken=${nextPageToken ?? 'null'} error=${err.message} stack=${err.stack} importedSoFar=${importedCount}`,
          );
          break;
        }
        const playlistDuration = Date.now() - playlistStartTime;
        console.log(
          `[YoutubeImport.DIAG] GET playlistItems page=${pageCount} pageToken=${nextPageToken ?? 'null'} duration=${playlistDuration}ms status=${playlistResponse.status} nextPageToken=${playlistResponse.data?.nextPageToken ?? 'null'}`,
        );

        const items = playlistResponse.data?.items ?? [];
        nextPageToken = playlistResponse.data?.nextPageToken ?? null;
        console.log(
          `[YoutubeImport.DIAG] playlistItems count=${items.length} page=${pageCount}`,
        );

        const videoIds = items
          .map((v: any) => v.contentDetails?.videoId)
          .filter(Boolean);

        console.log(
          `[YoutubeImport.DIAG] extracted videoIds count=${videoIds.length}`,
        );

        if (videoIds.length === 0) {
          console.log(`[YoutubeImport.DIAG] No videoIds on page=${pageCount}, skipping`);
          continue;
        }

        const statsStartTime = Date.now();
        let statsResponse;
        try {
          statsResponse = await axios.get(
            "https://www.googleapis.com/youtube/v3/videos",
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                part: "statistics,contentDetails",
                id: videoIds.join(","),
              },
            },
          );
        } catch (err: any) {
          console.error(
            `[YoutubeImport.DIAG] FAIL videos stats page=${pageCount} videoCount=${videoIds.length} error=${err.message} stack=${err.stack} importedSoFar=${importedCount}`,
          );
          break;
        }
        const statsDuration = Date.now() - statsStartTime;
        console.log(
          `[YoutubeImport.DIAG] GET videos stats page=${pageCount} duration=${statsDuration}ms status=${statsResponse.status} items=${statsResponse.data?.items?.length ?? 0}`,
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

        let insertedOnPage = 0;
        let skippedOnPage = 0;

        for (const item of items) {
          const videoId = item.contentDetails?.videoId;
          if (!videoId) {
            skippedOnPage++;
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
          const durationSeconds = this.parseDurationToSeconds(duration);
          const isShort = durationSeconds <= 180;

          const saveStartTime = Date.now();
          try {
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
          } catch (err: any) {
            console.error(
              `[YoutubeImport.DIAG] FAIL save video videoId=${videoId} title="${item.snippet?.title ?? 'Untitled'}" page=${pageCount} error=${err.message} stack=${err.stack}`,
            );
            skippedOnPage++;
            continue;
          }
          const saveDuration = Date.now() - saveStartTime;
          if (saveDuration > 1000) {
            console.warn(
              `[YoutubeImport.DIAG] SLOW save videoId=${videoId} duration=${saveDuration}ms`,
            );
          }

          insertedOnPage++;
          importedCount++;
        }

        const pageDuration = Date.now() - pageStartTime;
        const currentMemory = process.memoryUsage();
        const elapsed = Date.now() - importStartTime;
        console.log(
          `[YoutubeImport.DIAG] PAGE END page=${pageCount} inserted=${insertedOnPage} skipped=${skippedOnPage} pageDuration=${pageDuration}ms elapsed=${elapsed}ms nextPageToken=${nextPageToken ?? 'null'} memory=${JSON.stringify({ rss: Math.round(currentMemory.rss / 1024 / 1024) + 'MB', heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024) + 'MB' })}`,
        );
      } while (nextPageToken);

      const totalDuration = Date.now() - importStartTime;
      const endMemory = process.memoryUsage();
      console.log(
        `[YoutubeImport.DIAG] importUploadsAsync COMPLETE userId=${userId} totalImported=${importedCount} pages=${pageCount} totalDuration=${totalDuration}ms memory=${JSON.stringify({ rss: Math.round(endMemory.rss / 1024 / 1024) + 'MB', heapUsed: Math.round(endMemory.heapUsed / 1024 / 1024) + 'MB' })}`,
      );

      return importedCount;
    } catch (err: any) {
      const totalDuration = Date.now() - importStartTime;
      const failMemory = process.memoryUsage();
      console.error(
        `[YoutubeImport.DIAG] UNCAUGHT FAILURE userId=${userId} importedBeforeFailure=${importedCount} pagesCompleted=${pageCount} totalDuration=${totalDuration}ms error=${err.message} stack=${err.stack} memory=${JSON.stringify({ rss: Math.round(failMemory.rss / 1024 / 1024) + 'MB', heapUsed: Math.round(failMemory.heapUsed / 1024 / 1024) + 'MB' })}`,
      );
      throw err;
    }
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