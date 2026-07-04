import { Controller, Get, Post, Query, Param, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import {
  SyncYoutubeAnalyticsCommand,
  GetYoutubeChannelAnalyticsQuery,
  GetYoutubeVideoAnalyticsQuery,
  GetYoutubeAnalyticsTrendsQuery,
  GetYoutubeTopVideosQuery,
  GetYoutubeOverviewQuery,
  GetYoutubeDailyViewsQuery,
  GetYoutubeWatchTimeQuery,
  GetYoutubeSubscriberGrowthQuery,
  GetYoutubeTrafficSourcesQuery,
  GetYoutubeAudienceQuery,
  GetYoutubeGeographyQuery,
  GetYoutubeDevicesQuery,
  GetYoutubePlaybackLocationsQuery,
  GetYoutubeRevenueQuery,
} from './youtube-analytics.handler';
import { YoutubeTopVideosModel } from '../../../../domain/contracts/youtube-analytics.model';

@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/youtube/analytics`,
  version: '1',
})
export class YoutubeAnalyticsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('sync')
  @ApiResponse({ status: 200, description: 'Sync successfully completed' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async sync(@Res() res: Response): Promise<Response> {
    const result = await this.commandBus.execute(new SyncYoutubeAnalyticsCommand());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('channel')
  @ApiResponse({ status: 200, description: 'Latest channel analytics snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getChannelAnalytics(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeChannelAnalyticsQuery());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('video/:id')
  @ApiResponse({ status: 200, description: 'Latest video analytics snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getVideoAnalytics(@Param('id') id: string, @Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeVideoAnalyticsQuery(id));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('trends')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'videoId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Trend analytics over a date range' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getTrends(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('videoId') videoId: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(
      new GetYoutubeAnalyticsTrendsQuery({ startDate, endDate, videoId }),
    );
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('top-videos')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Top performing videos ordered by likes, views, watch time, publish date', type: YoutubeTopVideosModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async getTopVideos(@Query('limit') limit: number, @Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeTopVideosQuery({ limit }));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('overview')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Dashboard overview with current vs previous period comparison' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async getOverview(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeOverviewQuery({ startDate, endDate }));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('daily-views')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Daily view count time series' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getDailyViews(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeDailyViewsQuery({ startDate, endDate }));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('watch-time')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Watch time time series' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getWatchTime(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeWatchTimeQuery({ startDate, endDate }));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('subscriber-growth')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Subscriber growth time series' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getSubscriberGrowth(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeSubscriberGrowthQuery({ startDate, endDate }));
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('traffic-sources')
  @ApiResponse({ status: 200, description: 'Traffic sources from latest snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getTrafficSources(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeTrafficSourcesQuery());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('audience')
  @ApiResponse({ status: 200, description: 'Audience demographics from latest snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getAudience(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeAudienceQuery());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('geography')
  @ApiResponse({ status: 200, description: 'Geography breakdown from latest snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getGeography(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeGeographyQuery());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('devices')
  @ApiResponse({ status: 200, description: 'Device breakdown from latest snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getDevices(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeDevicesQuery());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('playback-locations')
  @ApiResponse({ status: 200, description: 'Playback location breakdown from latest snapshot' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getPlaybackLocations(@Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubePlaybackLocationsQuery());
    return res.status(HttpStatus.OK).json(result);
  }

  @Get('revenue')
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Format YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Revenue time series' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  public async getRevenue(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeRevenueQuery({ startDate, endDate }));
    return res.status(HttpStatus.OK).json(result);
  }
}
