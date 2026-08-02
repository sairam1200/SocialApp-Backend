import { Response } from 'express';
import _const from '../../../../core/utils/const';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PlaylistNotFoundException } from '../../../../core/exceptions';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { PlaylistType, SystemCollectionType } from '../../../../domain/enums';
import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AddPlaylistContentContent } from '../../add-content/add-content.handler';
import { CreatePlaylistCommand } from '../../create-playlist/create-playlist.handler';
import { GetPlaylistByNameQuery } from '../../get-playlist/get-playlist-by-name.handler';
import { ImportGateway } from '../../../../infrastructure/websocket/gateways/import.gateway';
import { NotificationGateway } from '../../../../infrastructure/websocket/gateways/notification.gateway';
import {
  AddPlaylistContentModel,
  PlaylistContentModel,
  PlaylistModel,
} from '../../../../domain/contracts/playlist.model';

@ApiBearerAuth()
@ApiTags('Bookmark')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/bookmark`,
  version: '1',
})
export class AddBookmarkContentController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly importGateway: ImportGateway,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  @Put(':userContentId/content/add')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 200, description: 'OK', type: PlaylistContentModel })
  public async Add(
    @Param('userContentId') userContentId: string,
    @Body() data: AddPlaylistContentModel,
    @Res() res: Response,
  ): Promise<Response> {
    if (!data.userContentId && !data.contentId) {
      data.userContentId = userContentId;
    }

    if (!data.userContentId && !data.contentId) {
      res.status(HttpStatus.BAD_REQUEST).send({
        statusCode: 400,
        message: 'Either userContentId or contentId must be provided',
      });
      return res;
    }

    const bookmark = await this.getBookmarkAsync();

    const result = await this.commandBus.execute(
      new AddPlaylistContentContent({
        model: data,
        playlistReferenceId: bookmark.referenceId,
      }),
    );

    res.status(HttpStatus.OK).send(result);
    const userId = HttpContext.getCurrentUserId;
    const payload = { contentId: data.userContentId ?? data.contentId };
    this.importGateway.emitBookmarkAdded(userId, payload);
    this.notificationGateway.emitBookmarkAdded(userId, payload);
    return res;
  }

  private async getBookmarkAsync(): Promise<PlaylistModel> {
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
        return this.commandBus.execute(
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
  }
}
