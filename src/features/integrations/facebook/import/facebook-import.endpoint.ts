import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { FacebookImportCommand } from "./facebook-import.handler";

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
  public async Import(
    @Res() res: Response,
  ): Promise<Response | void> {

    await this.commandBus.execute(new FacebookImportCommand());
    return res.status(HttpStatus.OK).json({ message: "Facebook import has begun." });
  }

}