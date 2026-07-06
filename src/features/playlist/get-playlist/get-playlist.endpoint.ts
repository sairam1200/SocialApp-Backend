import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { GetPlaylistByIdQuery } from './get-playlist-by-id.handler';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../core/passport/account.guard';
import { GetPlaylistByNameQuery } from './get-playlist-by-name.handler';
import { PlaylistModel } from '../../../domain/contracts/playlist.model';
import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

@ApiBearerAuth()
@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlist`,
  version: '1',
})
export class GetPlaylistController {
  constructor(private readonly queryBus: CommandBus) {}

  @Get('get-by-id')
  @ApiResponse({ status: 200, description: 'OK', type: PlaylistModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async GetById(
    @Query('playlistReferenceId') playlistReferenceId: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(
      new GetPlaylistByIdQuery({
        model: {
          playlistReferenceId,
        },
      }),
    );

    res.status(HttpStatus.OK).send(result);
    return res;
  }

  @Get(':userNameOrId/get-by-name')
  @ApiResponse({ status: 200, description: 'OK', type: PlaylistModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async GetByName(
    @Param('userNameOrId') userNameOrId: string,
    @Query('playlistName') playlistName: string,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.queryBus.execute(
      new GetPlaylistByNameQuery({
        model: {
          playlistName,
          userNameOrId,
        },
      }),
    );

    res.status(HttpStatus.OK).send(result);
    return res;
  }
}
