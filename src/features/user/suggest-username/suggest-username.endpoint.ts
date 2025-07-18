import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Controller, HttpStatus, Post, Query, Res } from "@nestjs/common";
import { SuggestUserNameCommand, SuggestUserNameResponseModel } from "./suggest-username.handler";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class SuggestUserNameController {

  constructor(private readonly queryBus: CommandBus) {
  }

  @Post('suggest-username')
  @ApiResponse({ status: 200, description: 'OK', type: SuggestUserNameResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'hint', required: false, type: '' })
  @ApiQuery({ name: 'userName', required: false, type: '' })
  public async Suggest(
    @Res() res: Response,
    @Query('hint') hint?: string,
    @Query('userName') userName?: string
  ): Promise<Response> {
    const result = await this.queryBus.execute(new SuggestUserNameCommand({ hint, userName }));
    res.status(HttpStatus.OK).send(result)
    return res;
  }
}