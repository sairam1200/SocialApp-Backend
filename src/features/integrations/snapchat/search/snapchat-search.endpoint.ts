import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { SnapchatSearchResponseModel } from '../../../../domain/contracts/snapchat.model';
import {
  SnapchatSearchQuery,
  SnapchatSearchRequestModel,
} from './snapchat-search.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/snapchat`,
  version: '1',
})
export class SnapchatSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: SnapchatSearchResponseModel,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: SnapchatSearchRequestModel })
  public async Search(
    @Body() model: SnapchatSearchRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.queryBus.execute(
      new SnapchatSearchQuery({ model }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
