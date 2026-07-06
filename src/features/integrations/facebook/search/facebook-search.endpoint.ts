import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FacebookSearchResponseModel } from '../../../../domain/contracts/facebook.model';
import {
  FacebookSearchQuery,
  FacebookSearchRequestModel,
} from './facebook-search.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/facebook`,
  version: '1',
})
export class FacebookSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: FacebookSearchResponseModel,
  })
  @ApiBody({ type: FacebookSearchRequestModel })
  public async Search(
    @Body() model: FacebookSearchRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.queryBus.execute(
      new FacebookSearchQuery({ model }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
