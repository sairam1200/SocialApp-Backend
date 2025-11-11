import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UpdateUserNameCommand } from "./update-username.handler";
import { AuthenticatedAccountGuard } from "../../../../core/passport";
import { Controller, HttpStatus, Patch, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Account')
@Controller({
  path: `/account`,
  version: '1',
})
export class UpdateUserNameController {

  constructor(private readonly queryBus: CommandBus) {
  }

  @Patch('username/update')
  @UseGuards(AuthenticatedAccountGuard)
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'hint', required: false, type: '' })
  @ApiQuery({ name: 'userName', required: false, type: '' })
  public async Suggest(
    @Res() res: Response,
    @Query('userName') userName?: string
  ): Promise<Response> {
    await this.queryBus.execute(new UpdateUserNameCommand({ userName }));
    res.status(HttpStatus.NO_CONTENT).send({})
    return res;
  }
}