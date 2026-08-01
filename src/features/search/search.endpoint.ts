import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { GlobalSearchQuery, GlobalSearchRequestModel } from './search.handler';
import { SearchSuggestionsQuery } from './database-search.handler';
import { SearchResponse } from '../../domain/contracts/search';

@ApiTags('Search')
@Controller({
  path: `/search`,
  version: '1',
})
export class GlobalSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('suggestions')
  public suggestions(@Query('keyword') keyword: string) {
    return this.queryBus.execute(new SearchSuggestionsQuery({ keyword }));
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: Object,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: GlobalSearchRequestModel })
  public async GlobalSearch(
    @Body() model: GlobalSearchRequestModel,
    @Res() res: Response,
  ): Promise<Response<SearchResponse>> {
    const result = await this.queryBus.execute(
      new GlobalSearchQuery({ model }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
