import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { FacebookImportCommand } from "./facebook-import.handler";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, HttpStatus, Post, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/facebook`,
  version: '1',
})
export class FacebookImportController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiQuery({ name: 'accessToken', required: false })
  public async Import(
    @Res() res: Response,
    @Query('accessToken') accessToken: string,
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new FacebookImportCommand({ model: { accessToken } }));
    return res.status(HttpStatus.OK).json({ message: "Facebook import has begun.", ...result });
  }
}