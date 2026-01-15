import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { TiktokSearchQuery, TiktokSearchRequestModel } from "./tiktok-search.handler";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/tiktok`,
  version: '1',
})
export class TiktokSearchController {
  constructor(
    private readonly queryBus: QueryBus
  ) { }

  @Post('search')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: TiktokSearchRequestModel })
  public async Search(
    @Body() model: TiktokSearchRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.queryBus.execute(new TiktokSearchQuery({ model }));
    return res.status(HttpStatus.OK).json(result);

  }
}

