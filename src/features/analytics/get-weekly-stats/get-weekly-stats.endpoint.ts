import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetWeeklyStatsQuery } from './get-weekly-stats.handler';
import { AuthenticatedAccountGuard } from '../../../core/passport';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';

@ApiBearerAuth()
@ApiTags('Analytics')
@Controller({
  path: `/analytics`,
  version: '1',
})
export class GetWeeklyStatsController {

  constructor(private readonly queryBus: QueryBus) { }

  @Get('weekly-stats')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async getWeeklyStats(@Res() res: Response): Promise<Response> {
    const userId = HttpContext.getCurrentUserId;
    const result = await this.queryBus.execute(new GetWeeklyStatsQuery({ userId }));
    return res.status(HttpStatus.OK).send(result);
  }
}
