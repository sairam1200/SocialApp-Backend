import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { RedditSearchResponseModel } from 'domain/contracts/reddit.model';
import {
  RedditSearchQuery,
  RedditSearchRequestModel,
} from './reddit-search.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/reddit`,
  version: '1',
})
export class RedditSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: RedditSearchResponseModel,
  })
  @ApiBody({ type: RedditSearchRequestModel })
  public async Search(
    @Body() model: RedditSearchRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.queryBus.execute(
      new RedditSearchQuery({ model }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
