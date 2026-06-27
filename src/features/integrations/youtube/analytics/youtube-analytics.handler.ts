import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../../core/globals';
import { NotFoundException } from '@nestjs/common';
import { IYoutubeAnalyticsService } from '../../../../domain/services/iyoutubeAnalytics.service';
import { IYoutubeChannelAnalyticsRepository } from '../../../../domain/repositories/iyoutubeChannelAnalytics.repository';
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
