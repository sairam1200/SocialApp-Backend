import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiBody, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../../core/passport/account.guard";
import { ImportResponseModel } from "../../../../domain/contracts/response.model";
import { Body, Controller, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { SpotifyImportCommand, SpotifyImportRequestModel } from "./spotify-import.handler";

@ApiTags('Integrations')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/integrations/spotify`,
  version: '1',
})
export class SpotifyImportController {

  constructor(
    private readonly commandBus: CommandBus
  ) { }

  @Post('import')
  @ApiResponse({ status: 200, description: 'OK', type: ImportResponseModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiBody({ type: SpotifyImportRequestModel, required: false })
  public async Import(
    @Body() model: SpotifyImportRequestModel,
    @Res() res: Response
  ): Promise<Response | void> {

    const result = await this.commandBus.execute(new SpotifyImportCommand({ model }));
    if (model.spotifyAccessToken) {
      return res.status(HttpStatus.OK).json({ message: "Spotify import has begun." });
    }

    return res.status(HttpStatus.OK).json({ message: "Spotify import has begun.", ...result });
  }
}