import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { PlaylistModel } from '../../../../domain/contracts/playlist.model';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { GetPlaylistByNameQuery } from '../../get-playlist/get-playlist-by-name.handler';

@ApiBearerAuth()
@ApiTags('Bookmark')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/bookmark`,
  version: '1',
})
export class GetBookmarkController {
  constructor(private readonly commandBus: CommandBus) {}

  @Get()
  @ApiResponse({ status: 200, description: 'OK', type: PlaylistModel })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async GetByName(@Res() res: Response): Promise<Response> {
    const result = await this.commandBus.execute(
      new GetPlaylistByNameQuery({
        model: {
          playlistName: _const.COLLECTION.BOOKMARK.NAME,
          userNameOrId: HttpContext.getCurrentUserId,
        },
      }),
    );

    res.status(HttpStatus.OK).send(result);
    return res;
  }
}
