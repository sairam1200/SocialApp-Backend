import { CommandBus } from "@nestjs/cqrs";
import { GetPlaylistByIdQuery } from "./get-playlist-by-id.handler";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../core/passport/account.guard";
import { GetPlaylistByNameQuery } from "./get-playlist-by-name.handler";
import { PlaylistModel } from "../../../domain/contracts/playlist.model";
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

@ApiBearerAuth()
@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlist`,
  version: '1',
})
export class GetPlaylistController {
  constructor(
    private readonly queryBus: CommandBus
  ) { }

  @Get('get-by-id')
  @ApiResponse({ status: 200, description: 'OK', type: PlaylistModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async GetById(@Query('playlistReferenceId') playlistReferenceId: string): Promise<PlaylistModel> {

    const result = await this.queryBus.execute(new GetPlaylistByIdQuery({
      model: {
        playlistReferenceId
      }
    }));

    return result;
  }

  @Get(':userName/get-by-name')
  @ApiResponse({ status: 200, description: 'OK', type: PlaylistModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async GetByName(
    @Param('userName') userName: string,
    @Query('playlistName') playlistName: string
  ): Promise<PlaylistModel> {

    const result = await this.queryBus.execute(new GetPlaylistByNameQuery({
      model: {
        playlistName,
        userName
      }
    }));

    return result;
  }
}