import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler, QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { Globals } from '../../../../core/globals';
import { NotFoundException } from '@nestjs/common';
import { IFacebookAnalyticsService } from '../../../../domain/services/ifacebookAnalytics.service';
import { IFacebookPageAnalyticsRepository } from '../../../../domain/repositories/ifacebookPageAnalytics.repository';
import { IFacebookPostAnalyticsRepository } from '../../../../domain/repositories/ifacebookPostAnalytics.repository';
import { IFacebookVideoAnalyticsRepository } from '../../../../domain/repositories/ifacebookVideoAnalytics.repository';
import { FacebookPageAnalytics } from '../../../../domain/entities/facebookPageAnalytics.entity';
import { FacebookPostAnalytics } from '../../../../domain/entities/facebookPostAnalytics.entity';
import { FacebookVideoAnalytics } from '../../../../domain/entities/facebookVideoAnalytics.entity';

// --- Commands & Queries Definitions ---

export class SyncFacebookAnalyticsCommand {
  constructor(request: Partial<SyncFacebookAnalyticsCommand> = {}) {
    Object.assign(this, request);
  }
}

export class GetFacebookPageAnalyticsQuery {
  constructor(request: Partial<GetFacebookPageAnalyticsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetFacebookPostAnalyticsQuery {
  postId: string;
  constructor(postId: string) {
    this.postId = postId;
  }
}

export class GetFacebookVideoAnalyticsQuery {
  videoId: string;
  constructor(videoId: string) {
    this.videoId = videoId;
  }
}

export class GetFacebookAnalyticsTrendsQuery {
  startDate?: string;
  endDate?: string;
  constructor(request: Partial<GetFacebookAnalyticsTrendsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetFacebookTopPostsQuery {
  limit?: number;
  constructor(request: Partial<GetFacebookTopPostsQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetFacebookTopVideosQuery {
  limit?: number;
  constructor(request: Partial<GetFacebookTopVideosQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetFacebookCompareQuery {
  startDate1: string;
  endDate1: string;
  startDate2: string;
  endDate2: string;
  constructor(request: Partial<GetFacebookCompareQuery> = {}) {
    Object.assign(this, request);
  }
}

export class GetFacebookGrowthQuery {
  startDate?: string;
  endDate?: string;
  constructor(request: Partial<GetFacebookGrowthQuery> = {}) {
    Object.assign(this, request);
  }
}

// --- Handlers Implementation ---

@CommandHandler(SyncFacebookAnalyticsCommand)
export class SyncFacebookAnalyticsCommandHandler implements ICommandHandler<SyncFacebookAnalyticsCommand> {
  constructor(
    @Inject(_const.IFACEBOOKANALYTICS_SERVICE)
    private readonly analyticsService: IFacebookAnalyticsService,
  ) {}

  async execute(): Promise<{ message: string }> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    await this.analyticsService.syncAccountAnalyticsAsync(userId);
    return { message: 'Facebook Analytics sync completed successfully' };
  }
}

@QueryHandler(GetFacebookPageAnalyticsQuery)
export class GetFacebookPageAnalyticsQueryHandler implements IQueryHandler<GetFacebookPageAnalyticsQuery> {
  constructor(
    @Inject(_const.IFACEBOOKPAGEANALYTICS_REPOSITORY)
    private readonly pageAnalyticsRepository: IFacebookPageAnalyticsRepository,
  ) {}

  async execute(): Promise<FacebookPageAnalytics> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const latest = await this.pageAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!latest) {
      throw new NotFoundException('No Facebook page analytics record found for this account.');
    }
    return latest;
  }
}

@QueryHandler(GetFacebookPostAnalyticsQuery)
export class GetFacebookPostAnalyticsQueryHandler implements IQueryHandler<GetFacebookPostAnalyticsQuery> {
  constructor(
    @Inject(_const.IFACEBOOKPOSTANALYTICS_REPOSITORY)
    private readonly postAnalyticsRepository: IFacebookPostAnalyticsRepository,
  ) {}

  async execute(query: GetFacebookPostAnalyticsQuery): Promise<FacebookPostAnalytics> {
    const latest = await this.postAnalyticsRepository.getLatestByPostIdAsync(query.postId);
    if (!latest) {
      throw new NotFoundException(`No analytics record found for Facebook post: ${query.postId}`);
    }
    return latest;
  }
}

@QueryHandler(GetFacebookVideoAnalyticsQuery)
export class GetFacebookVideoAnalyticsQueryHandler implements IQueryHandler<GetFacebookVideoAnalyticsQuery> {
  constructor(
    @Inject(_const.IFACEBOOKVIDEOANALYTICS_REPOSITORY)
    private readonly videoAnalyticsRepository: IFacebookVideoAnalyticsRepository,
  ) {}

  async execute(query: GetFacebookVideoAnalyticsQuery): Promise<FacebookVideoAnalytics> {
    const latest = await this.videoAnalyticsRepository.getLatestByVideoIdAsync(query.videoId);
    if (!latest) {
      throw new NotFoundException(`No analytics record found for Facebook video: ${query.videoId}`);
    }
    return latest;
  }
}

@QueryHandler(GetFacebookAnalyticsTrendsQuery)
export class GetFacebookAnalyticsTrendsQueryHandler implements IQueryHandler<GetFacebookAnalyticsTrendsQuery> {
  constructor(
    @Inject(_const.IFACEBOOKPAGEANALYTICS_REPOSITORY)
    private readonly pageAnalyticsRepository: IFacebookPageAnalyticsRepository,
  ) {}

  async execute(query: GetFacebookAnalyticsTrendsQuery): Promise<FacebookPageAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const pageRecord = await this.pageAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!pageRecord) {
      throw new NotFoundException('No Facebook page analytics records found to fetch trends.');
    }

    return await this.pageAnalyticsRepository.getTrendsAsync(pageRecord.pageId, start, end);
  }
}

@QueryHandler(GetFacebookTopPostsQuery)
export class GetFacebookTopPostsQueryHandler implements IQueryHandler<GetFacebookTopPostsQuery> {
  constructor(
    @Inject(_const.IFACEBOOKPOSTANALYTICS_REPOSITORY)
    private readonly postAnalyticsRepository: IFacebookPostAnalyticsRepository,
  ) {}

  async execute(query: GetFacebookTopPostsQuery): Promise<FacebookPostAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const limit = query.limit || 5;
    return await this.postAnalyticsRepository.getTopPostsAsync(userId, limit);
  }
}

@QueryHandler(GetFacebookTopVideosQuery)
export class GetFacebookTopVideosQueryHandler implements IQueryHandler<GetFacebookTopVideosQuery> {
  constructor(
    @Inject(_const.IFACEBOOKVIDEOANALYTICS_REPOSITORY)
    private readonly videoAnalyticsRepository: IFacebookVideoAnalyticsRepository,
  ) {}

  async execute(query: GetFacebookTopVideosQuery): Promise<FacebookVideoAnalytics[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const limit = query.limit || 5;
    return await this.videoAnalyticsRepository.getTopVideosAsync(userId, limit);
  }
}

@QueryHandler(GetFacebookGrowthQuery)
export class GetFacebookGrowthQueryHandler implements IQueryHandler<GetFacebookGrowthQuery> {
  constructor(
    @Inject(_const.IFACEBOOKPAGEANALYTICS_REPOSITORY)
    private readonly pageAnalyticsRepository: IFacebookPageAnalyticsRepository,
  ) {}

  async execute(query: GetFacebookGrowthQuery): Promise<any[]> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setUTCDate(today.getUTCDate() - 30);

    const start = query.startDate ? new Date(query.startDate) : thirtyDaysAgo;
    const end = query.endDate ? new Date(query.endDate) : today;

    const pageRecord = await this.pageAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!pageRecord) {
      throw new NotFoundException('No Facebook page analytics records found to fetch growth.');
    }

    const trends = await this.pageAnalyticsRepository.getTrendsAsync(pageRecord.pageId, start, end);
    return trends.map((t) => ({
      snapshotDate: t.snapshotDate,
      followerCount: t.followerCount,
      fanCount: t.fanCount,
    }));
  }
}

@QueryHandler(GetFacebookCompareQuery)
export class GetFacebookCompareQueryHandler implements IQueryHandler<GetFacebookCompareQuery> {
  constructor(
    @Inject(_const.IFACEBOOKPAGEANALYTICS_REPOSITORY)
    private readonly pageAnalyticsRepository: IFacebookPageAnalyticsRepository,
  ) {}

  async execute(query: GetFacebookCompareQuery): Promise<any> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const pageRecord = await this.pageAnalyticsRepository.getLatestByUserIdAsync(userId);
    if (!pageRecord) {
      throw new NotFoundException('No Facebook page analytics records found to perform comparison.');
    }

    const start1 = new Date(query.startDate1);
    const end1 = new Date(query.endDate1);
    const start2 = new Date(query.startDate2);
    const end2 = new Date(query.endDate2);

    const trends1 = await this.pageAnalyticsRepository.getTrendsAsync(pageRecord.pageId, start1, end1);
    const trends2 = await this.pageAnalyticsRepository.getTrendsAsync(pageRecord.pageId, start2, end2);

    const aggregates1 = this.calculateAggregates(trends1);
    const aggregates2 = this.calculateAggregates(trends2);

    return {
      period1: {
        startDate: query.startDate1,
        endDate: query.endDate1,
        ...aggregates1,
      },
      period2: {
        startDate: query.startDate2,
        endDate: query.endDate2,
        ...aggregates2,
      },
      comparison: {
        followerGrowthPercent: this.calculatePercentageChange(aggregates1.followers, aggregates2.followers),
        fanGrowthPercent: this.calculatePercentageChange(aggregates1.likes, aggregates2.likes),
        impressionsGrowthPercent: this.calculatePercentageChange(aggregates1.impressions, aggregates2.impressions),
        reachGrowthPercent: this.calculatePercentageChange(aggregates1.reach, aggregates2.reach),
        engagementGrowthPercent: this.calculatePercentageChange(aggregates1.engagement, aggregates2.engagement),
        pageViewsGrowthPercent: this.calculatePercentageChange(aggregates1.pageViews, aggregates2.pageViews),
        clicksGrowthPercent: this.calculatePercentageChange(aggregates1.clicks, aggregates2.clicks),
      },
    };
  }

  private calculateAggregates(trends: FacebookPageAnalytics[]) {
    if (trends.length === 0) {
      return {
        impressions: 0,
        reach: 0,
        engagement: 0,
        pageViews: 0,
        clicks: 0,
        followers: 0,
        likes: 0,
      };
    }

    let totalImpressions = 0;
    let totalReach = 0;
    let totalPageViews = 0;
    let totalClicks = 0;
    let sumEngagement = 0;

    for (const item of trends) {
      totalImpressions += Number(item.impressions || 0);
      totalReach += Number(item.reach || 0);
      totalPageViews += Number(item.pageViews || 0);
      totalClicks += Number(item.clicks || 0);
      sumEngagement += Number(item.engagement || 0);
    }

    const latest = trends[trends.length - 1];

    return {
      impressions: totalImpressions,
      reach: totalReach,
      engagement: parseFloat((sumEngagement / trends.length).toFixed(2)),
      pageViews: totalPageViews,
      clicks: totalClicks,
      followers: latest.followerCount || 0,
      likes: latest.fanCount || 0,
    };
  }

  private calculatePercentageChange(val1: number, val2: number): number {
    if (val1 === 0) {
      return val2 > 0 ? 100 : 0;
    }
    return parseFloat((((val2 - val1) / val1) * 100).toFixed(2));
  }
}
