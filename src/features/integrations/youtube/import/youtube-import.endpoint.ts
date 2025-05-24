import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { YoutubeImportCommand } from "./youtube-import.handler";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Body, Controller, Get, HttpStatus, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/youtube`,
  version: '1',
})
export class YoutubeImportController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Get('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: 'accessToken', required: false })
  public async Import(
    @Body() accessToken: string,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new YoutubeImportCommand({ model: { accessToken } }));
    return res.status(HttpStatus.OK).json({ message: "Youtube import has begun.", ...result });
  }
}