import { Controller, Get, Post, Query, Param, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import {
  SyncFacebookAnalyticsCommand,
  GetFacebookPageAnalyticsQuery,
  GetFacebookPostAnalyticsQuery,
  GetFacebookVideoAnalyticsQuery,
  GetFacebookAnalyticsTrendsQuery,
  GetFacebookTopPostsQuery,
  GetFacebookTopVideosQuery,
  GetFacebookCompareQuery,
  GetFacebookGrowthQuery,
} from './facebook-analytics.handler';

@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/facebook/analytics`,
  version: '1',
})
export class FacebookAnalyticsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('sync')
  @ApiResponse({ status: 200, description: 'Sync successfully completed' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async sync(@Res() res: Response): Promise<Response> {
    const result = await this.commandBus.execute(new SyncFacebookAnalyticsCommand());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('page')
  @ApiResponse({ status: 200, description: 'Latest page analytics snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getPageAnalytics(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetFacebookPageAnalyticsQuery());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('growth')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Page follower growth trend' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getGrowth(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(new GetFacebookGrowthQuery({ startDate, endDate }));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('post/:id')
  @ApiResponse({ status: 200, description: 'Latest post analytics snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getPostAnalytics(@Param('id') id: string, @Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetFacebookPostAnalyticsQuery(id));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('video/:id')
  @ApiResponse({ status: 200, description: 'Latest video analytics snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getVideoAnalytics(@Param('id') id: string, @Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetFacebookVideoAnalyticsQuery(id));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('trends')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Trend analytics over a date range' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getTrends(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(
      new GetFacebookAnalyticsTrendsQuery({ startDate, endDate }),
    );
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('top-posts')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top performing posts ordered by reach' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async getTopPosts(@Query('limit') limit: number, @Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetFacebookTopPostsQuery({ limit }));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('top-videos')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top performing videos ordered by views' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async getTopVideos(@Query('limit') limit: number, @Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetFacebookTopVideosQuery({ limit }));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('engagement')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Engagement summary over time' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getEngagement(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const trends = await this.queryBus.execute(
      new GetFacebookAnalyticsTrendsQuery({ startDate, endDate }),
    );
    const summary = trends.map((t: any) => ({
      snapshotDate: t.snapshotDate,
      engagement: t.engagement,
    }));
    return res.status(HttpStatus.OK).json(summary);
  }

  @Get('reach-impressions')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Reach and impressions summary' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getReachImpressions(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const trends = await this.queryBus.execute(
      new GetFacebookAnalyticsTrendsQuery({ startDate, endDate }),
    );
    const summary = trends.map((t: any) => ({
      snapshotDate: t.snapshotDate,
      reach: t.reach,
      impressions: t.impressions,
    }));
    return res.status(HttpStatus.OK).json(summary);
  }

  @Get('compare')
  @ApiQuery({ name: 'startDate1', required: true, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate1', required: true, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'startDate2', required: true, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate2', required: true, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Compare analytics metrics between two custom date ranges' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async compare(
    @Query('startDate1') startDate1: string,
    @Query('endDate1') endDate1: string,
    @Query('startDate2') startDate2: string,
    @Query('endDate2') endDate2: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(
      new GetFacebookCompareQuery({ startDate1, endDate1, startDate2, endDate2 }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
