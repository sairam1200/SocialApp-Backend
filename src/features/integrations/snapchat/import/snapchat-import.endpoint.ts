import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { SnapchatImportCommand, SnapchatImportRequestModel } from "../../snapchat/import/snapchat-import.handler";
import { CancelSnapchatImportCommand, CancelSnapchatImportRequestModel } from "../../snapchat/import/cancel-snapchat-import.handler";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/snapchat`,
  version: '1',
})
export class SnapchatImportController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: SnapchatImportRequestModel, required: false })
  public async Import(
    @Body() model: SnapchatImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new SnapchatImportCommand({ model }));
    if (model.snapchatAccessToken) {
      return res.status(HttpStatus.OK).json({ message: "Snapchat import has begun." });
    }

    return res.status(HttpStatus.OK).json({ message: "Snapchat import has begun.", ...result });
  }

  @Post('import/cancel')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelSnapchatImportRequestModel })
  public async Cancel(
    @Body() model: CancelSnapchatImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelSnapchatImportCommand({ model }));
    return res.status(HttpStatus.OK).json({ message: "Snapchat import cancellation and rollback requested." });
  }
}
