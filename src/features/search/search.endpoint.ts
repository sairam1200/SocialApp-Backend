import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../core/passport/account.guard";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { GlobalSearchQuery, GlobalSearchRequestModel, GlobalSearchResponseModel } from "./search.handler";

@ApiTags('Search')
@Controller({
  path: `/search`,
  version: '1',
})
export class GlobalSearchController {
  constructor(
    private readonly queryBus: QueryBus
  ) { }

  @Post()
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: GlobalSearchResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: GlobalSearchRequestModel })
  public async GlobalSearch(
    @Body() model: GlobalSearchRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.queryBus.execute(new GlobalSearchQuery({ model }));
    return res.status(HttpStatus.OK).json(result);

  }
}