import { Response } from "express";
import { CommandBus } from "@nestjs/cqrs";
import { ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../core/passport/account.guard";
import { PlaylistMemberModel } from "../../../domain/contracts/playlist.model";
import { AddPlaylistMemberCommand, AddPlaylistMemberModel } from "./add-member.handler";
import { Body, Controller, HttpStatus, Param, Post, Res, UseGuards } from "@nestjs/common";

@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlist`,
  version: '1',
})
export class AddPlaylistMemberController {

  constructor(private readonly commandBus: CommandBus) { }

  @Post(':id/add-member')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 200, description: 'OK', type: PlaylistMemberModel })
  public async addMember(@Param('id') id: string, @Body() request: AddPlaylistMemberModel, @Res() res: Response
  ): Promise<PlaylistMemberModel> {

    const result = await this.commandBus.execute(new AddPlaylistMemberCommand({
      model: request,
      playlistReferenceId: id
    }));

    res.status(HttpStatus.OK).send(result);

    return result;
  }
}