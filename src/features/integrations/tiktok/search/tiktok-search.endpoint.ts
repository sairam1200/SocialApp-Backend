import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import {
  TiktokSearchQuery,
  TiktokSearchRequestModel,
} from './tiktok-search.handler';
import { TiktokSearchResponseModel } from 'domain/contracts/tiktok.model';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/tiktok`,
  version: '1',
})
export class TiktokSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: TiktokSearchResponseModel,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: TiktokSearchRequestModel })
  public async Search(
    @Body() model: TiktokSearchRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.queryBus.execute(
      new TiktokSearchQuery({ model }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
