import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Controller, Get, HttpStatus, Res, UseGuards } from "@nestjs/common";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/twitter`,
  version: '1',
})
export class TwitterImportController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Get('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Import(
    @Res() res: Response
  ): Promise<Response | void> {



  }

}