import { Response } from 'express';
import { CommandBus } from '@nestjs/cqrs';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AddPlaylistContentContent } from './add-content.handler';
import { UserAccoutGuard } from '../../../core/passport/account.guard';
import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  AddPlaylistContentModel,
  PlaylistContentModel,
} from '../../../domain/contracts/playlist.model';

@ApiTags('Playlists')
@UseGuards(UserAccoutGuard)
@Controller({
  path: `/playlist`,
  version: '1',
})
export class AddPlaylistContentController {
  constructor(private readonly commandBus: CommandBus) {}

  @Put(':id/content/add')
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  @ApiResponse({ status: 400, description: 'BAD_REQUEST' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN' })
  @ApiResponse({ status: 409, description: 'CONFLICT' })
  @ApiResponse({ status: 200, description: 'OK', type: PlaylistContentModel })
  public async Add(
    @Param('id') playlistReferenceId: string,
    @Body() data: AddPlaylistContentModel,
    @Res() res: Response,
  ): Promise<Response> {
    const result = await this.commandBus.execute(
      new AddPlaylistContentContent({
        model: data,
        playlistReferenceId: playlistReferenceId,
      }),
    );

    res.status(HttpStatus.OK).send(result);
    return res;
  }
}
