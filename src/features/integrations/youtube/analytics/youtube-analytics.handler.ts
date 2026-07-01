import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../../core/globals';
import { NotFoundException } from '@nestjs/common';
import { IYoutubeAnalyticsService } from '../../../../domain/services/iyoutubeAnalytics.service';
import { IYoutubeChannelAnalyticsRepository, ChannelMetricsAggregate } from '../../../../domain/repositories/iyoutubeChannelAnalytics.repository';
import { IYoutubeVideoAnalyticsRepository } from '../../../../domain/repositories/iyoutubeVideoAnalytics.repository';
import { YoutubeChannelAnalytics } from '../../../../domain/entities/youtubeChannelAnalytics.entity';
import { YoutubeVideoAnalytics } from '../../../../domain/entities/youtubeVideoAnalytics.entity';

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
  ) {}

  async execute(): Promise<YoutubeChannelAnalytics> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const latest = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
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
  ) {}

  async execute(query: GetYoutubeVideoAnalyticsQuery): Promise<YoutubeVideoAnalytics> {
    const latest = await this.videoAnalyticsRepository.getLatestByVideoIdAsync(query.videoId);
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
      return await this.videoAnalyticsRepository.getTrendsAsync(query.videoId, start, end);
    }

    // Default to Channel trends: find the channel first
    const channelRecord = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!channelRecord) {
      throw new NotFoundException('No channel analytics records found to fetch trends.');
    }

    return await this.channelAnalyticsRepository.getTrendsAsync(channelRecord.channelId, start, end);
  }
}

@QueryHandler(GetYoutubeTopVideosQuery)
export class GetYoutubeTopVideosQueryHandler implements IQueryHandler<GetYoutubeTopVideosQuery> {
  constructor(
    @Inject(_const.IYOUTUBEVIDEOANALYTICS_REPOSITORY)
    private readonly videoAnalyticsRepository: IYoutubeVideoAnalyticsRepository,
  ) {}

  async execute(query: GetYoutubeTopVideosQuery): Promise<YoutubeVideoAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const limit = query.limit || 5;
    return await this.videoAnalyticsRepository.getTopVideosAsync(userId, limit);
  }
}

@QueryHandler(GetYoutubeOverviewQuery)
export class GetYoutubeOverviewQueryHandler implements IQueryHandler<GetYoutubeOverviewQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
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

    const current = await this.channelAnalyticsRepository.getAggregatedMetricsAsync(userId, startDate, endDate);
    const previous = await this.channelAnalyticsRepository.getAggregatedMetricsAsync(userId, prevStart, prevEnd);

    return {
      current: { ...current, startDate: this.toDateStr(startDate), endDate: this.toDateStr(endDate) },
      previous: { ...previous, startDate: this.toDateStr(prevStart), endDate: this.toDateStr(prevEnd) },
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
  ) {}

  async execute(query: GetYoutubeDailyViewsQuery): Promise<YoutubeChannelAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const channelRecord = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!channelRecord) {
      throw new NotFoundException('No channel analytics records found.');
    }

    return await this.channelAnalyticsRepository.getTrendsAsync(channelRecord.channelId, start, end);
  }
}

@QueryHandler(GetYoutubeWatchTimeQuery)
export class GetYoutubeWatchTimeQueryHandler implements IQueryHandler<GetYoutubeWatchTimeQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
  ) {}

  async execute(query: GetYoutubeWatchTimeQuery): Promise<YoutubeChannelAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const channelRecord = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!channelRecord) {
      throw new NotFoundException('No channel analytics records found.');
    }

    return await this.channelAnalyticsRepository.getTrendsAsync(channelRecord.channelId, start, end);
  }
}

@QueryHandler(GetYoutubeSubscriberGrowthQuery)
export class GetYoutubeSubscriberGrowthQueryHandler implements IQueryHandler<GetYoutubeSubscriberGrowthQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
  ) {}

  async execute(query: GetYoutubeSubscriberGrowthQuery): Promise<YoutubeChannelAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const channelRecord = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!channelRecord) {
      throw new NotFoundException('No channel analytics records found.');
    }

    return await this.channelAnalyticsRepository.getTrendsAsync(channelRecord.channelId, start, end);
  }
}

@QueryHandler(GetYoutubeTrafficSourcesQuery)
export class GetYoutubeTrafficSourcesQueryHandler implements IQueryHandler<GetYoutubeTrafficSourcesQuery> {
  constructor(
    @Inject(_const.IYOUTUBECHANNELANALYTICS_REPOSITORY)
    private readonly channelAnalyticsRepository: IYoutubeChannelAnalyticsRepository,
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const latest = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
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
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const latest = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
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
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const latest = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
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
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const latest = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
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
  ) {}

  async execute(): Promise<Record<string, any>> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const latest = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
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
  ) {}

  async execute(query: GetYoutubeRevenueQuery): Promise<YoutubeChannelAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const channelRecord = await this.channelAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!channelRecord) {
      throw new NotFoundException('No channel analytics records found.');
    }

    return await this.channelAnalyticsRepository.getTrendsAsync(channelRecord.channelId, start, end);
  }
}
