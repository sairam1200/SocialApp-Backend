import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { PlaylistModel } from '../../../../domain/contracts/playlist.model';
import { PlaylistType, SystemCollectionType } from '../../../../domain/enums';
import { Controller, Get, HttpStatus, Res, UseGuards } from '@nestjs/common';
import { PlaylistNotFoundException } from '../../../../core/exceptions';
import { CreatePlaylistCommand } from '../../create-playlist/create-playlist.handler';
import { GetBookmarkContentsQuery } from './get-bookmark-by-content-stream.handler';

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
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  public async GetByName(@Res() res: Response): Promise<Response> {
    let result: PlaylistModel;

    try {
      result = await this.commandBus.execute(
        new GetBookmarkContentsQuery({
          model: {
            playlistName: _const.COLLECTION.BOOKMARK.NAME,
            userNameOrId: HttpContext.getCurrentUserId,
          },
        }),
      );
    } catch (error) {
      if (error instanceof PlaylistNotFoundException) {
        result = await this.commandBus.execute(
          new CreatePlaylistCommand({
            model: {
              name: _const.COLLECTION.BOOKMARK.NAME,
              description: _const.COLLECTION.BOOKMARK.DESCRIPTION,
              playlistType: PlaylistType.SYSTEM,
              systemType: SystemCollectionType.BOOKMARK,
            },
          }),
        );
      } else {
        throw error;
      }
    }

    res.status(HttpStatus.OK).send(result);
    return res;
  }
}
