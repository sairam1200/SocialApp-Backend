import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { ApiProperty } from '@nestjs/swagger';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Playlist } from '../../../domain/entities/collection/playlist.entity';
import { PlaylistModel } from '../../../domain/contracts/playlist.model';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { mapToPlaylistModel } from '../../../domain/mappers/playlist.mpper';
import { IAnalyticsService } from '../../../domain/services/ianalytics.service';
import { IPlaylistRepository } from '../../../domain/repositories/iplaylist.repository';
import { PlaylistAlreadyExistsException } from '../../../core/exceptions/playlist.exception';

export class CreatePlaylistModel {
  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;
}

const createPlaylistValidations = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().optional(),
});

export class CreatePlaylistCommand {
  model: CreatePlaylistModel;

  constructor(request: Partial<CreatePlaylistCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(CreatePlaylistCommand)
export class CreatePlaylistCommandHandler
  implements ICommandHandler<CreatePlaylistCommand, PlaylistModel>
{
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
    @Inject(_const.IANALYTICS_SERVICE)
    private readonly analyticsService: IAnalyticsService,
  ) {}

  public async execute(command: CreatePlaylistCommand): Promise<PlaylistModel> {
    const { model } = command;
    await createPlaylistValidations.validateAsync(model);

    const loggedInUserId = HttpContext.getCurrentUserId;
    let playlist = await this.playlistRepository.getByNameAsync(
      loggedInUserId,
      model.name,
    );

    if (playlist) {
      throw new PlaylistAlreadyExistsException(model.name);
    }

    playlist = await this.playlistRepository.createAsync(
      new Playlist({
        name: model.name,
        description: model.description,
      }),
    );

    await this.analyticsService.trackEvent(
      _const.ANALYTICS_EVENTS.PLAYLIST.CREATED,
      {
        playlistId: playlist.id,
        name: playlist.name,
      },
    );

    return mapToPlaylistModel(playlist);
  }
}
