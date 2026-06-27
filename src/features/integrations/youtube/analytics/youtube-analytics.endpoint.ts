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
} from './youtube-analytics.handler';

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
  @ApiResponse({ status: 200, description: 'Top performing videos ordered by views' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async getTopVideos(@Query('limit') limit: number, @Res() res: Response): Promise<Response> {
    const result = await this.queryBus.execute(new GetYoutubeTopVideosQuery({ limit }));
    return res.status(HttpStatus.OK).json(result);
  }
}
