import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { Controller, Post, Res, UseGuards } from "@nestjs/common";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";


@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/instagram`,
  version: '1',
})
export class InstagramImportController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Import(
    @Res() res: Response
  ): Promise<Response | void> {

    

  }

}