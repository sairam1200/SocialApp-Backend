import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import { LinkedAccountModel } from "../../../domain/contracts/user.model";
import { GetUserLinkedAccountsQuery } from "./get-linked-accounts.handler";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { UserAccoutGuard } from "core/passport";

@ApiBearerAuth()
@ApiTags('User Profiles')
@UseGuards()
@Controller({
  path: `/user/profile`,
  version: '1',
})
export class GetUserLinkedAccountsController {
  constructor(
    private readonly queryBus: CommandBus
  ) { }

  @Get("linked-accounts")
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK', type: [LinkedAccountModel] })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Get(@Query('userName') userName: string, @Res() res: Response): Promise<Response> {

    const result = await this.queryBus.execute(new GetUserLinkedAccountsQuery({ userName }));
    res.status(HttpStatus.OK).send(result);
    return res;
  }
}