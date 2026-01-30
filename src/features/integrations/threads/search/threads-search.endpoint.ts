import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { ThreadsSearchResponseModel } from "../../../../domain/contracts/threads.model";
import { ThreadsSearchQuery, ThreadsSearchRequestModel } from "./threads-search.handler";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/threads`,
  version: '1',
})
export class ThreadsSearchController {
  constructor(
    private readonly queryBus: QueryBus
  ) { }

  @Post('search')
  @ApiResponse({ status: 200, description: 'OK', type: ThreadsSearchResponseModel })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: ThreadsSearchRequestModel })
  public async Search(
    @Body() model: ThreadsSearchRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.queryBus.execute(new ThreadsSearchQuery({ model }));
    return res.status(HttpStatus.OK).json(result);
  }
}
