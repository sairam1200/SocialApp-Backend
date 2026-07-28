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
import { PlaylistType, SystemCollectionType } from '../../../domain/enums';

export class CreatePlaylistModel {
  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false, enum: PlaylistType })
  playlistType?: PlaylistType;

  @ApiProperty({ required: false, enum: SystemCollectionType })
  systemType?: SystemCollectionType;
}

const createPlaylistValidations = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('').optional(),
  playlistType: Joi.string()
    .valid(...Object.values(PlaylistType))
    .optional(),
  systemType: Joi.string()
    .valid(...Object.values(SystemCollectionType))
    .optional(),
});

export class CreatePlaylistCommand {
  model: CreatePlaylistModel;

  constructor(request: Partial<CreatePlaylistCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(CreatePlaylistCommand)
export class CreatePlaylistCommandHandler implements ICommandHandler<
  CreatePlaylistCommand,
  PlaylistModel
> {
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
        playlistType: model.playlistType ?? PlaylistType.USER,
        systemType: model.systemType,
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
