import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DiscoverFeedQuery, DiscoverFeedQueryHandler } from './discover-feed.handler';
import { CursorResult } from '../../domain/contracts/pagination/cursorResult';
import { DiscoverContentModel } from '../../domain/contracts/discover-content.model';

@ApiTags('Discover')
@Controller({
  path: '/discover',
  version: '1',
})
export class DiscoverFeedController {
  constructor(private readonly queryBus: CommandBus) {}

  @Get('feed')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'platform', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by user ID (used by "For You" tab)' })
  public async getDiscoverFeed(
    @Res() res: Response,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('platform') platform?: string,
    @Query('userId') userId?: string,
  ): Promise<Response> {
    const result = await this.queryBus.execute(
      new DiscoverFeedQuery({ cursor, limit, platform, userId }),
    );
    res.status(HttpStatus.OK).json(result);
    return res;
  }
}
