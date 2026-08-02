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
  UseGuards,
} from '@nestjs/common';
import {
  ExternalSearchRateLimitGuard,
  SearchRateLimitGuard,
} from '../../core/passport/searchRateLimit.guard';
import {
  GlobalSearchQuery,
  GlobalSearchRequestModel,
} from './search.handler';
import {
  SearchSuggestionsQuery,
} from './database-search.handler';
import { SearchResponse } from '../../domain/contracts/search';

@ApiTags('Search')
@Controller({
  path: `/search`,
  version: '1',
})
// These endpoints are intentionally public — search is the product's front door and
// must work before signup. Public plus unlimited is the problem, not public alone:
// the POST below fans out to twelve platforms, several metered, and YouTube allows
// roughly 100 searches per day in total. The guard bounds anonymous callers hard
// while leaving signed-in users room to browse.
@UseGuards(SearchRateLimitGuard)
export class GlobalSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('suggestions')
  public suggestions(@Query('keyword') keyword: string) {
    return this.queryBus.execute(new SearchSuggestionsQuery({ keyword }));
  }

  @Post()
  @UseGuards(ExternalSearchRateLimitGuard)
  @ApiResponse({ status: 429, description: 'TOO_MANY_REQUESTS' })
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
