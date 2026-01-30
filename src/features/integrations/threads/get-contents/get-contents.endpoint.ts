import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";
import { ThreadsContentsQuery } from "../../threads/get-contents/get-contents.handler";

@ApiTags('Integrations')
@Controller({
  path: `/integrations/threads`,
  version: '1',
})
export class ThreadsContentsController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Get('contents')
  @UseGuards(UserAccoutGuard)
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  public async Contents(
    @Query('userId') userId: string,
    @Query('cursor') cursor: string,
    @Res() res: Response
  ): Promise<Response | void> {
    const result = await this.commandBus.execute(new ThreadsContentsQuery({ model: { userId, cursor } }));
    return res.status(HttpStatus.OK).json(result);
  }
}
