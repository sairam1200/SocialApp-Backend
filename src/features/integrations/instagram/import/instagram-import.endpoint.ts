import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { InstagramImportCommand, InstagramImportRequestModel } from "./instagram-import.handler";

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
  @ApiBody({ type: InstagramImportRequestModel, required: false })
  public async Import(
    @Body() model: InstagramImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new InstagramImportCommand({ model }));
    if (model.instagramAccessToken) {
      return res.status(HttpStatus.OK).json({ message: "Instagram import has begun." });
    }

    return res.status(HttpStatus.OK).json({ message: "Instagram import has begun.", ...result });
  }
}