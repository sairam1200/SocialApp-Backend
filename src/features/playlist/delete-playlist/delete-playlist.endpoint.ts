import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { DeletePlaylistCommand } from "./delete-playlist.handler";
import { UserAccoutGuard } from "../../../core/passport/account.guard";
import { Controller, Delete, HttpStatus, Param, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlist`,
  version: '1',
})
export class DeletePlaylistController {

  constructor(private readonly commandBus: CommandBus) { }

  @Delete(":id")
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  public async Delete(
    @Param('id') playlistReferenceId: string,
    @Res() res: Response
  ): Promise<Response> {

    await this.commandBus.execute(new DeletePlaylistCommand({
      model: {
        playlistReferenceId,
      }
    }));

    res.status(HttpStatus.NO_CONTENT).send();
    return res;
  }
}