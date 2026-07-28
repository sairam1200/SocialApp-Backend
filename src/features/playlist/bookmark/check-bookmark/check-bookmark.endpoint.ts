import { Response } from 'express';
import _const from '../../../../core/utils/const';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserAccoutGuard } from '../../../../core/passport/account.guard';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { GetPlaylistByNameQuery } from '../../get-playlist/get-playlist-by-name.handler';
import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { PlaylistNotFoundException } from '../../../../core/exceptions';
import { IPlaylistRepository } from '../../../../domain/repositories/iplaylist.repository';
import { Inject } from '@nestjs/common';
import _constRepo from '../../../../core/utils/const';

@ApiBearerAuth()
@ApiTags('Bookmark')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/bookmark`,
  version: '1',
})
export class CheckBookmarkController {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(_constRepo.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
  ) {}

  @Get('check')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async Check(
    @Query('userContentId') userContentId: string,
    @Res() res: Response,
  ): Promise<Response> {
    let bookmarked = false;

    try {
      const bookmark = await this.commandBus.execute(
        new GetPlaylistByNameQuery({
          model: {
            playlistName: _const.COLLECTION.BOOKMARK.NAME,
            userNameOrId: HttpContext.getCurrentUserId,
          },
        }),
      );

      bookmarked = await this.playlistRepository.isContentInPlaylist(
        bookmark.referenceId,
        userContentId,
      );
    } catch (error) {
      if (error instanceof PlaylistNotFoundException) {
        bookmarked = false;
      } else {
        throw error;
      }
    }

    res.status(HttpStatus.OK).send({ bookmarked });
    return res;
  }

  @Get('check-batch')
  @ApiResponse({ status: 200, description: 'OK' })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  public async CheckBatch(
    @Query('userContentIds') userContentIds: string,
    @Res() res: Response,
  ): Promise<Response> {
    const ids = userContentIds
      ? userContentIds.split(',').map((id) => id.trim())
      : [];

    let bookmarkedIds: string[] = [];

    try {
      const bookmark = await this.commandBus.execute(
        new GetPlaylistByNameQuery({
          model: {
            playlistName: _const.COLLECTION.BOOKMARK.NAME,
            userNameOrId: HttpContext.getCurrentUserId,
          },
        }),
      );

      bookmarkedIds = await this.playlistRepository.getContentIdsInPlaylist(
        bookmark.referenceId,
        ids,
      );
    } catch (error) {
      if (error instanceof PlaylistNotFoundException) {
        bookmarkedIds = [];
      } else {
        throw error;
      }
    }

    res.status(HttpStatus.OK).send({ bookmarkedIds });
    return res;
  }
}
