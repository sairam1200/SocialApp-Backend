import { Response } from 'express';
import _const from '../../../../core/utils/const';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { PlaylistModel } from '../../../../domain/contracts/playlist.model';
import {
  Controller,
  Delete,
  HttpStatus,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { GetPlaylistByNameQuery } from '../../get-playlist/get-playlist-by-name.handler';
import { RemovePlaylistContentCommand } from '../../remove-content/remove-content.handler';

@ApiTags('Bookmark')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/bookmark`,
  version: '1',
})
export class RemoveBookmarkContentController {
  constructor(private readonly commandBus: CommandBus) {}

  @Delete(':id/content/remove/:contentId')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  public async Remove(
    @Param('contentId') contentId: string,
    @Res() res: Response,
  ): Promise<Response> {
    const bookmark = await this.getBookmarkAsync();
    if (bookmark) {
      await this.commandBus.execute(
        new RemovePlaylistContentCommand({
          model: {
            contentId,
            playlistReferenceId: bookmark.referenceId,
          },
        }),
      );
    }

    res.status(HttpStatus.NO_CONTENT).send();
    return res;
  }

  private async getBookmarkAsync(): Promise<PlaylistModel | null> {
    try {
      return await this.commandBus.execute(
        new GetPlaylistByNameQuery({
          model: {
            playlistName: _const.COLLECTION.BOOKMARK.NAME,
            userNameOrId: HttpContext.getCurrentUserId,
          },
        }),
      );
    } catch {
      return null;
    }
  }
}
