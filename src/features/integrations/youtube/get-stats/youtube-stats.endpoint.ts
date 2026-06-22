import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiProperty, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { Controller, Get, HttpStatus, Res, Query, UseGuards } from '@nestjs/common';
import { YoutubeStatsQuery } from './youtube-stats.handler';

class StatsResponseDto {
  @ApiProperty()
  views: number;

  @ApiProperty()
  likes: number;

  @ApiProperty()
  comments: number;

  @ApiProperty()
  watchTime: number;
}

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeStatsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get('get-stats')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: StatsResponseDto })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'accountId', required: true })
  @ApiQuery({ name: 'videoId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  public async GetStats(
    @Res() res: Response,
    @Query('accountId') accountId: string,
    @Query('videoId') videoId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(
      new YoutubeStatsQuery({
        model: { accountId, videoId, startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined },
      }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
