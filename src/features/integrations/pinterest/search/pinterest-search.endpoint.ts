import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { PinterestSearchResponseModel } from '../../../../domain/contracts/pinterest.model';
import {
  PinterestSearchQuery,
  PinterestSearchRequestModel,
} from './pinterest-search.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/pinterest`,
  version: '1',
})
export class PinterestSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: PinterestSearchResponseModel,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: PinterestSearchRequestModel })
  public async Search(
    @Body() model: PinterestSearchRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.queryBus.execute(
      new PinterestSearchQuery({ model }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
