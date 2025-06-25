import { CommandBus } from "@nestjs/cqrs";
import { GetPlaylistsQuery } from "./get-playlists.handler";
import { ApiBearerAuth, ApiResponse, ApiTags } from "@nestjs/swagger";
import { UserAccoutGuard } from "../../../core/passport/account.guard";
import { PlaylistModel } from "../../../domain/contracts/playlist.model";
import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";

@ApiBearerAuth()
@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlists`,
  version: '1',
})
export class GetPlaylistsController {
  constructor(
    private readonly queryBus: CommandBus
  ) { }

  @Get(':userNameOrId')
  @ApiResponse({ status: 200, description: 'OK', type: [PlaylistModel] })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async Get(
    @Param('userNameOrId') userNameOrId: string,
  ): Promise<PlaylistModel> {

    const result = await this.queryBus.execute(new GetPlaylistsQuery({
      model: {
        userNameOrId
      }
    }));

    return result;
  }
}