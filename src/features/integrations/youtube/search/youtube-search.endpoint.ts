import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { YoutubeSearchResponseModel } from "../../../../domain/contracts/youtube.model";
import { YoutubeSearchQuery, YoutubeSearchRequestModel } from "./youtube-search.handler";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeSearchController {
  constructor(
    private readonly queryBus: QueryBus
  ) { }


  @Post('search')
  @ApiResponse({ status: 200, description: 'OK', type: YoutubeSearchResponseModel })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: YoutubeSearchRequestModel })
  public async Search(
    @Body() model: YoutubeSearchRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.queryBus.execute(new YoutubeSearchQuery({ model }));
    return res.status(HttpStatus.OK).json(result);
  }
}