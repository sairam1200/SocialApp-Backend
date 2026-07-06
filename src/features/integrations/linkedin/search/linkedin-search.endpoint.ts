import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { LinkedInSearchResponseModel } from '../../../../domain/contracts/linkedin.model';
import {
  LinkedInSearchQuery,
  LinkedInSearchRequestModel,
} from './linkedin-search.handler';

@ApiTags('Integrations')
@Controller({
  path: `/integrations/linkedin`,
  version: '1',
})
export class LinkedInSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: LinkedInSearchResponseModel,
  })
  @ApiBody({ type: LinkedInSearchRequestModel })
  public async Search(
    @Body() model: LinkedInSearchRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.queryBus.execute(
      new LinkedInSearchQuery({ model }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
