import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../core/passport/account.guard";
import { RemovePlaylistContentCommand } from "./remove-content.handler";
import { Controller, Delete, HttpStatus, Param, Query, Res, UseGuards } from "@nestjs/common";

@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlist`,
  version: '1',
})
export class RemovePlaylistContentController {

  constructor(private readonly commandBus: CommandBus) { }

  @Delete(":id/content/remove/:contentId")
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  public async Remove(
    @Param('contentId') contentId: string,
    @Param('id') playlistReferenceId: string,
    @Res() res: Response
  ): Promise<Response> {

    await this.commandBus.execute(new RemovePlaylistContentCommand({
      model: {
        playlistReferenceId,
        contentId
      }
    }));

    res.status(HttpStatus.NO_CONTENT).send();
    return res;
  }
}