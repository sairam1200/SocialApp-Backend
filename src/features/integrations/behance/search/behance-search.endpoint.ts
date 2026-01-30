import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Body, Controller, HttpStatus, Post, Res } from "@nestjs/common";
import { BehanceSearchResponseModel } from "../../../../domain/contracts/behance.model";
import { BehanceSearchQuery, BehanceSearchRequestModel } from "./behance-search.handler";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/behance`,
  version: '1',
})
export class BehanceSearchController {
  constructor(
    private readonly queryBus: QueryBus
  ) { }

  @Post('search')
  @ApiResponse({ status: 200, description: 'OK', type: BehanceSearchResponseModel })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: BehanceSearchRequestModel })
  public async Search(
    @Body() model: BehanceSearchRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.queryBus.execute(new BehanceSearchQuery({ model }));
    return res.status(HttpStatus.OK).json(result);
  }
}
