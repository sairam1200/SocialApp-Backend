import { Response } from 'express';
import _const from '../../../../core/utils/const';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  Controller,
  Delete,
  HttpStatus,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PlaylistNotFoundException } from '../../../../core/exceptions';
import { PlaylistModel } from '../../../../domain/contracts/playlist.model';
import { ImportGateway } from '../../../../infrastructure/websocket/gateways/import.gateway';
import { NotificationGateway } from '../../../../infrastructure/websocket/gateways/notification.gateway';
import { GetPlaylistByNameQuery } from '../../get-playlist/get-playlist-by-name.handler';
import { RemovePlaylistContentCommand } from '../../remove-content/remove-content.handler';

@ApiBearerAuth()
@ApiTags('Bookmark')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/bookmark`,
  version: '1',
})
export class RemoveBookmarkContentController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly importGateway: ImportGateway,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Delete(':userContentId/content/remove/:contentId')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 204, description: 'NO_CONTENT' })
  public async Remove(
    @Param('userContentId') userContentId: string,
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
      const userId = HttpContext.getCurrentUserId;
      const payload = { contentId: contentId };
      this.importGateway.emitBookmarkRemoved(userId, payload);
      this.notificationGateway.emitBookmarkRemoved(userId, payload);
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
    } catch (error) {
      if (error instanceof PlaylistNotFoundException) {
        return null;
      }
      throw error;
    }
  }
}
