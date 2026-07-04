import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../../core/globals';
import { NotFoundException } from '@nestjs/common';
import { IYoutubeAnalyticsService } from '../../../../domain/services/iyoutubeAnalytics.service';
import { IYoutubeChannelAnalyticsRepository, ChannelMetricsAggregate } from '../../../../domain/repositories/iyoutubeChannelAnalytics.repository';
import { IYoutubeVideoAnalyticsRepository } from '../../../../domain/repositories/iyoutubeVideoAnalytics.repository';
import { IYoutubeAccountRepository } from '../../../../domain/repositories/iyoutubeAccount.repository';
import { IUserContentRepository } from '../../../../domain/repositories';
import { YoutubeChannelAnalytics } from '../../../../domain/entities/youtubeChannelAnalytics.entity';
import { YoutubeVideoAnalytics } from '../../../../domain/entities/youtubeVideoAnalytics.entity';
import { TopVideoItemModel, YoutubeTopVideosModel } from '../../../../domain/contracts/youtube-analytics.model';

const YOUTUBE_VIDEO_CONTENT_TYPES = ['uploaded_video'];

async function resolveActiveYoutubeChannelIdAsync(userId: string, youtubeAccountRepository: IYoutubeAccountRepository): Promise<string> {
  const activeAccount = await youtubeAccountRepository.getConnectedByUserIdAsync(userId);
  if (!activeAccount) {
    throw new NotFoundException('No connected YouTube account found.');
  }
  return activeAccount.channelId;
}

async function resolveCurrentYoutubeVideoIdsAsync(
  userId: string,
  youtubeAccountRepository: IYoutubeAccountRepository,
  userContentRepository: IUserContentRepository,
): Promise<string[]> {
  await resolveActiveYoutubeChannelIdAsync(userId, youtubeAccountRepository);
  return await userContentRepository.getVideoIdsByUserIdAndPlatformAsync(userId, _const.PLATFORMS.YOUTUBE, YOUTUBE_VIDEO_CONTENT_TYPES);
}

// --- Commands & Queries Definitions ---

export class SyncYoutubeAnalyticsCommand {
  constructor(request: Partial<SyncYoutubeAnalyticsCommand> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeChannelAnalyticsQuery {
  constructor(request: Partial<GetYoutubeChannelAnalyticsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeVideoAnalyticsQuery {
  videoId: string;
  constructor(videoId: string) {
    this.videoId = videoId;
  }
}

export class GetYoutubeAnalyticsTrendsQuery {
  startDate?: string;
  endDate?: string;
  videoId?: string;
  constructor(request: Partial<GetYoutubeAnalyticsTrendsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeTopVideosQuery {
  limit?: number;
  constructor(request: Partial<GetYoutubeTopVideosQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeOverviewQuery {
  startDate?: string;
  endDate?: string;
  constructor(request: Partial<GetYoutubeOverviewQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeDailyViewsQuery {
  startDate?: string;
  endDate?: string;
  constructor(request: Partial<GetYoutubeDailyViewsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeWatchTimeQuery {
  startDate?: string;
  endDate?: string;
  constructor(request: Partial<GetYoutubeWatchTimeQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeSubscriberGrowthQuery {
  startDate?: string;
  endDate?: string;
  constructor(request: Partial<GetYoutubeSubscriberGrowthQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeTrafficSourcesQuery {
  constructor(request: Partial<GetYoutubeTrafficSourcesQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeAudienceQuery {
  constructor(request: Partial<GetYoutubeAudienceQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeGeographyQuery {
  constructor(request: Partial<GetYoutubeGeographyQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeDevicesQuery {
  constructor(request: Partial<GetYoutubeDevicesQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubePlaybackLocationsQuery {
  constructor(request: Partial<GetYoutubePlaybackLocationsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetYoutubeRevenueQuery {
  startDate?: string;
  endDate?: string;
  constructor(request: Partial<GetYoutubeRevenueQuery> = {}) {
    Object.assign(this, request);
  }
}

// --- Handlers Implementation ---

@CommandHandler(SyncYoutubeAnalyticsCommand)
export class SyncYoutubeAnalyticsCommandHandler implements ICommandHandler<SyncYoutubeAnalyticsCommand> {
  constructor(
    @Inject(_const.IYOUTUBEANALYTICS_SERVICE)
    private readonly analyticsService: IYoutubeAnalyticsService,
  ) {}

  async execute(): Promise<{ message: string }> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    await this.analyticsService.syncAccountAnalyticsAsync(userId);
    return { message: 'YouTube Analytics sync completed successfully' };
  }
}

@QueryHandler(GetYoutubeChannelAnalyticsQuery)
export class GetYoutubeChannelAnalyticsQueryHandler implements IQueryHandler<GetYoutubeChannelAnalyticsQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(): Promise<YoutubeChannelAnalytics> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    const latest = await this.channelAnalyticsRepository.getLatestByChannelIdAsync(channelId);
    if (!latest) {
      throw new NotFoundException('No channel analytics record found for this account.');
    }
    return latest;
  }
}

@QueryHandler(GetYoutubeVideoAnalyticsQuery)
export class GetYoutubeVideoAnalyticsQueryHandler implements IQueryHandler<GetYoutubeVideoAnalyticsQuery> {
  constructor(
    @Inject(_const.IYOUTUBEVIDEOANALYTICS_REPOSITORY)
    private readonly videoAnalyticsRepository: IYoutubeVideoAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  async execute(query: GetYoutubeVideoAnalyticsQuery): Promise<YoutubeVideoAnalytics> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const videoIds = await resolveCurrentYoutubeVideoIdsAsync(userId, this.youtubeAccountRepository, this.userContentRepository);
    if (!videoIds.includes(query.videoId)) {
      throw new NotFoundException(`No analytics record found for video: ${query.videoId}`);
    }

    const latest = await this.videoAnalyticsRepository.getLatestByUserIdAndVideoIdAsync(userId, query.videoId);
    if (!latest) {
      throw new NotFoundException(`No analytics record found for video: ${query.videoId}`);
    }
    return latest;
  }
}

@QueryHandler(GetYoutubeAnalyticsTrendsQuery)
export class GetYoutubeAnalyticsTrendsQueryHandler implements IQueryHandler<GetYoutubeAnalyticsTrendsQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEVIDEOANALYTICS_REPOSITORY)
    private readonly videoAnalyticsRepository: IYoutubeVideoAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  async execute(query: GetYoutubeAnalyticsTrendsQuery): Promise<YoutubeChannelAnalytics[] | YoutubeVideoAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    if (query.videoId) {
      const videoIds = await resolveCurrentYoutubeVideoIdsAsync(userId, this.youtubeAccountRepository, this.userContentRepository);
      if (!videoIds.includes(query.videoId)) {
        throw new NotFoundException(`No analytics record found for video: ${query.videoId}`);
      }
      return await this.videoAnalyticsRepository.getTrendsByUserIdAndVideoIdAsync(userId, query.videoId, start, end);
    }

    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    return await this.channelAnalyticsRepository.getTrendsAsync(channelId, start, end);
  }
}

@QueryHandler(GetYoutubeTopVideosQuery)
export class GetYoutubeTopVideosQueryHandler implements IQueryHandler<GetYoutubeTopVideosQuery> {
  constructor(
    @Inject(_const.IYOUTUBEVIDEOANALYTICS_REPOSITORY)
    private readonly videoAnalyticsRepository: IYoutubeVideoAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  async execute(_query: GetYoutubeTopVideosQuery): Promise<YoutubeTopVideosModel> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const activeAccount = await this.youtubeAccountRepository.getConnectedByUserIdAsync(userId);
    if (!activeAccount) {
      return new YoutubeTopVideosModel({ topVideos: [] });
    }

    const videoIds = await this.userContentRepository.getVideoIdsByUserIdAndPlatformAsync(
      userId, _const.PLATFORMS.YOUTUBE, YOUTUBE_VIDEO_CONTENT_TYPES,
    );

    if (videoIds.length === 0) {
      return new YoutubeTopVideosModel({ topVideos: [] });
    }

    const results = await this.videoAnalyticsRepository.getTopVideosByVideoIdsSortedAsync(
      userId, videoIds, 3,
    );

    if (results.length === 0) {
      return new YoutubeTopVideosModel({ topVideos: [] });
    }

    const userContents = await this.userContentRepository.getUserContentVideosAsync(
      userId, _const.PLATFORMS.YOUTUBE, YOUTUBE_VIDEO_CONTENT_TYPES,
    );

    const userContentByVideoId = new Map<string, typeof userContents[0]>();
    for (const uc of userContents) {
      const vid = uc.metaData?.videoId || uc.externalId;
      if (vid && !userContentByVideoId.has(vid)) {
        userContentByVideoId.set(vid, uc);
      }
    }

    const enrichmentMap = new Map<string, { viewCount: number; likeCount: number }>();
    for (const uc of userContents) {
      const vid = uc.metaData?.videoId || uc.externalId;
      if (!vid) continue;
      const existing = enrichmentMap.get(vid) || { viewCount: 0, likeCount: 0 };
      enrichmentMap.set(vid, {
        viewCount: existing.viewCount || Number(uc.metaData?.viewCount) || 0,
        likeCount: existing.likeCount || Number(uc.metaData?.likeCount) || 0,
      });
    }

    const needsEnrichment = results.some((r) => r.likeCount === 0 || r.viewCount === 0);
    if (needsEnrichment) {
      for (const r of results) {
        const enriched = enrichmentMap.get(r.videoId);
        if (enriched) {
          if (r.viewCount === 0 && enriched.viewCount > 0) {
            r.viewCount = enriched.viewCount;
          }
          if (r.likeCount === 0 && enriched.likeCount > 0) {
            r.likeCount = enriched.likeCount;
          }
        }
      }
      results.sort((a, b) => {
        if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
        if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
        if (b.estimatedMinutesWatched !== a.estimatedMinutesWatched) return Number(b.estimatedMinutesWatched) - Number(a.estimatedMinutesWatched);
        const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return bDate - aDate;
      });
    }

    const topVideos = results.slice(0, 3).map((r) => {
      const uc = userContentByVideoId.get(r.videoId);
      const thumbnail = uc?.media?.[0]?.thumbnail
        || uc?.metaData?.thumbnailUrl
        || uc?.metaData?.thumbnails?.default?.url;
      const title = uc?.title || '';
      const publishedAt = r.publishedAt || uc?.publishedAt || uc?.metaData?.publishedAt;
      return new TopVideoItemModel({
        id: r.videoId,
        title,
        thumbnail,
        publishedAt,
        duration: r.duration || undefined,
        views: r.viewCount,
        likes: r.likeCount,
        comments: r.commentCount,
        shares: r.shares,
        estimatedMinutesWatched: r.estimatedMinutesWatched,
        averageViewDurationSeconds: r.averageViewDurationSeconds,
      });
    });

    return new YoutubeTopVideosModel({ topVideos });
  }
}

@QueryHandler(GetYoutubeOverviewQuery)
export class GetYoutubeOverviewQueryHandler implements IQueryHandler<GetYoutubeOverviewQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEVIDEOANALYTICS_REPOSITORY)
    private readonly videoAnalyticsRepository: IYoutubeVideoAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(query: GetYoutubeOverviewQuery): Promise<{ current: ChannelMetricsAggregate & { startDate: string; endDate: string }; previous: ChannelMetricsAggregate & { startDate: string; endDate: string } }> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const defaultEnd = new Date(today);
    defaultEnd.setUTCDate(today.getUTCDate() - 1);

    const defaultStart = new Date(defaultEnd);
    defaultStart.setUTCDate(defaultEnd.getUTCDate() - 29);

    const endDate = query.endDate ? new Date(query.endDate) : defaultEnd;
    const startDate = query.startDate ? new Date(query.startDate) : defaultStart;

    const periodMs = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - periodMs);

    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);

    const [currentChannel, previousChannel, currentVideo, previousVideo] = await Promise.all([
      this.channelAnalyticsRepository.getAggregatedMetricsAsync(channelId, startDate, endDate),
      this.channelAnalyticsRepository.getAggregatedMetricsAsync(channelId, prevStart, prevEnd),
      this.videoAnalyticsRepository.getAggregatedVideoMetricsAsync(userId, startDate, endDate),
      this.videoAnalyticsRepository.getAggregatedVideoMetricsAsync(userId, prevStart, prevEnd),
    ]);

    const merge = (channel: ChannelMetricsAggregate, video: { viewCount: number; estimatedMinutesWatched: number; averageViewDurationSeconds: number; likes: number; comments: number; shares: number }): ChannelMetricsAggregate => ({
      viewCount: video.viewCount || channel.viewCount,
      estimatedMinutesWatched: video.estimatedMinutesWatched || channel.estimatedMinutesWatched,
      averageViewDurationSeconds: video.averageViewDurationSeconds || channel.averageViewDurationSeconds,
      subscribersGained: channel.subscribersGained,
      subscribersLost: channel.subscribersLost,
      likes: video.likes || channel.likes,
      comments: video.comments || channel.comments,
      shares: video.shares || channel.shares,
      estimatedRevenueUsd: channel.estimatedRevenueUsd,
      estimatedAdRevenueUsd: channel.estimatedAdRevenueUsd,
      snapshotCount: channel.snapshotCount,
    });

    return {
      current: { ...merge(currentChannel, currentVideo), startDate: this.toDateStr(startDate), endDate: this.toDateStr(endDate) },
      previous: { ...merge(previousChannel, previousVideo), startDate: this.toDateStr(prevStart), endDate: this.toDateStr(prevEnd) },
    };
  }

  private toDateStr(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}

@QueryHandler(GetYoutubeDailyViewsQuery)
export class GetYoutubeDailyViewsQueryHandler implements IQueryHandler<GetYoutubeDailyViewsQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(query: GetYoutubeDailyViewsQuery): Promise<YoutubeChannelAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    return await this.channelAnalyticsRepository.getTrendsAsync(channelId, start, end);
  }
}

@QueryHandler(GetYoutubeWatchTimeQuery)
export class GetYoutubeWatchTimeQueryHandler implements IQueryHandler<GetYoutubeWatchTimeQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(query: GetYoutubeWatchTimeQuery): Promise<YoutubeChannelAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    return await this.channelAnalyticsRepository.getTrendsAsync(channelId, start, end);
  }
}

@QueryHandler(GetYoutubeSubscriberGrowthQuery)
export class GetYoutubeSubscriberGrowthQueryHandler implements IQueryHandler<GetYoutubeSubscriberGrowthQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(query: GetYoutubeSubscriberGrowthQuery): Promise<YoutubeChannelAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    return await this.channelAnalyticsRepository.getTrendsAsync(channelId, start, end);
  }
}

@QueryHandler(GetYoutubeTrafficSourcesQuery)
export class GetYoutubeTrafficSourcesQueryHandler implements IQueryHandler<GetYoutubeTrafficSourcesQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    const latest = await this.channelAnalyticsRepository.getLatestByChannelIdAsync(channelId);
    if (!latest) {
      throw new NotFoundException('No channel analytics found for this account.');
    }
    return latest.trafficSources;
  }
}

@QueryHandler(GetYoutubeAudienceQuery)
export class GetYoutubeAudienceQueryHandler implements IQueryHandler<GetYoutubeAudienceQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    const latest = await this.channelAnalyticsRepository.getLatestByChannelIdAsync(channelId);
    if (!latest) {
      throw new NotFoundException('No channel analytics found for this account.');
    }
    return latest.audience ?? {};
  }
}

@QueryHandler(GetYoutubeGeographyQuery)
export class GetYoutubeGeographyQueryHandler implements IQueryHandler<GetYoutubeGeographyQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    const latest = await this.channelAnalyticsRepository.getLatestByChannelIdAsync(channelId);
    if (!latest) {
      throw new NotFoundException('No channel analytics found for this account.');
    }
    return latest.geography;
  }
}

@QueryHandler(GetYoutubeDevicesQuery)
export class GetYoutubeDevicesQueryHandler implements IQueryHandler<GetYoutubeDevicesQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    const latest = await this.channelAnalyticsRepository.getLatestByChannelIdAsync(channelId);
    if (!latest) {
      throw new NotFoundException('No channel analytics found for this account.');
    }
    return latest.devices;
  }
}

@QueryHandler(GetYoutubePlaybackLocationsQuery)
export class GetYoutubePlaybackLocationsQueryHandler implements IQueryHandler<GetYoutubePlaybackLocationsQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    const latest = await this.channelAnalyticsRepository.getLatestByChannelIdAsync(channelId);
    if (!latest) {
      throw new NotFoundException('No channel analytics found for this account.');
    }
    return latest.playbackLocations;
  }
}

@QueryHandler(GetYoutubeRevenueQuery)
export class GetYoutubeRevenueQueryHandler implements IQueryHandler<GetYoutubeRevenueQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
    @Inject(_const.IYOUTUBEACCOUNT_REPOSITORY)
    private readonly youtubeAccountRepository: IYoutubeAccountRepository,
  ) {}

  async execute(query: GetYoutubeRevenueQuery): Promise<YoutubeChannelAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const channelId = await resolveActiveYoutubeChannelIdAsync(userId, this.youtubeAccountRepository);
    return await this.channelAnalyticsRepository.getTrendsAsync(channelId, start, end);
  }
}
