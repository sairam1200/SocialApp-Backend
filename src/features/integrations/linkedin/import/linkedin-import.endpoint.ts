import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { LinkedInImportCommand, LinkedInImportRequestModel } from "./linkedin-import.handler";
import { CancelLinkedInImportCommand, CancelLinkedInImportRequestModel } from "./cancel-linkedin-import.handler";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/linkedin`,
  version: '1',
})
export class LinkedInImportController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: LinkedInImportRequestModel, required: false })
  public async Import(
    @Body() model: LinkedInImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new LinkedInImportCommand({ model }));
    if (model.linkedInAccessToken) {
      return res.status(HttpStatus.OK).json({ message: "LinkedIn import has begun." });
    }

    return res.status(HttpStatus.OK).json({ message: "LinkedIn import has begun.", ...result });
  }

  @Post('import/cancel')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelLinkedInImportRequestModel })
  public async Cancel(
    @Body() model: CancelLinkedInImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelLinkedInImportCommand({ model }));
    return res.status(HttpStatus.OK).json({ message: "LinkedIn import cancellation and rollback requested." });
  }
}
