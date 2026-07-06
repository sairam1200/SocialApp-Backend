import { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedAccountGuard } from '../../core/passport/account.guard';
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
  GlobalSearchQuery,
  GlobalSearchRequestModel,
  GlobalSearchResponseModel,
} from './search.handler';
import {
  SearchItemQuery,
  SearchResultsQuery,
  SearchSuggestionsQuery,
} from './database-search.handler';

@ApiTags('Search')
@Controller({
  path: `/search`,
  version: '1',
})
export class GlobalSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('suggestions')
  @UseGuards(AuthenticatedAccountGuard)
  public suggestions(@Query('keyword') keyword: string) {
    return this.queryBus.execute(new SearchSuggestionsQuery({ keyword }));
  }

  @Get('results')
  @UseGuards(AuthenticatedAccountGuard)
  public results(
    @Query('keyword') keyword: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.queryBus.execute(
      new SearchResultsQuery({ keyword, page, limit }),
    );
  }

  @Get('item')
  @UseGuards(AuthenticatedAccountGuard)
  public item(
    @Query('id') id: string,
    @Query('type') type: 'user' | 'userContent',
  ) {
    return this.queryBus.execute(new SearchItemQuery({ id, type }));
  }

  @Post()
  @ApiResponse({
    status: 200,
    description: 'OK',
    type: GlobalSearchResponseModel,
  })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: GlobalSearchRequestModel })
  public async GlobalSearch(
    @Body() model: GlobalSearchRequestModel,
    @Res() res: Response,
  ): Promise<Response | void> {
    const result = await this.queryBus.execute(
      new GlobalSearchQuery({ model }),
    );
    return res.status(HttpStatus.OK).json(result);
  }
}
