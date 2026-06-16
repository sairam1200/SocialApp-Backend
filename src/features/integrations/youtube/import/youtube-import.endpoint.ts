import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { YoutubeImportCommand, YoutubeImportRequestModel } from "./youtube-import.handler";
import { CancelYoutubeImportCommand, CancelYoutubeImportRequestModel } from "./cancel-youtube-import.handler";

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

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: YoutubeImportRequestModel, required: false })
  public async Import(
    @Body() model: YoutubeImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new YoutubeImportCommand({ model }));
    console.log("YoutubeImportCommand result:", result);
    if (model.youtubeAccessToken) {
      return res.status(HttpStatus.OK).json({ message: "Youtube import has begun." });
    }

    return res.status(HttpStatus.OK).json({ message: "Youtube import has begun.", ...result });
  }

  @Post('import/cancel')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: CancelYoutubeImportRequestModel })
  public async Cancel(
    @Body() model: CancelYoutubeImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {
    await this.commandBus.execute(new CancelYoutubeImportCommand({ model }));
    return res.status(HttpStatus.OK).json({ message: "Youtube import cancellation and rollback requested." });
  }
}