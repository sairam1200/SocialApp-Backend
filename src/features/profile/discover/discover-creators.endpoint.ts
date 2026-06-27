import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { Controller, Get, HttpStatus, Query, Res } from "@nestjs/common";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { DiscoverCreatorsQuery, DiscoverCreatorsQueryHandler } from "./discover-creators.handler";
import { PublicProfileModel } from "../../../domain/contracts/public-profile.model";

@ApiTags('Discover')
@Controller({
  path: `/discover`,
  version: '1',
})
export class DiscoverCreatorsController {
  constructor(private readonly queryBus: CommandBus) { }

  @Get('creators')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 12 })
  public async getDiscoverCreators(
    @Res() res: Response,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<Response> {
    const result = await this.queryBus.execute(new DiscoverCreatorsQuery({ page, limit }));
    res.status(HttpStatus.OK).json(result);
    return res;
  }
}
