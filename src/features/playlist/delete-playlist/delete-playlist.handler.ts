import * as Joi from 'joi';
import _const from '../../../core/utils/const';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PlaylistType } from '../../../domain/enums';
import { IPlaylistRepository } from '../../../domain/repositories/iplaylist.repository';
import { IAnalyticsService } from '../../../domain/services/ianalytics.service';
import { PlaylistUpdateNotAllowedException } from '../../../core/exceptions/playlist.exception';

export class DeletePlaylistCommand {
  model: {
    playlistReferenceId: string;
  };

  constructor(request: Partial<DeletePlaylistCommand> = {}) {
    Object.assign(this, request);
  }
}

const removePlaylistContentValidation = Joi.object({
  playlistReferenceId: Joi.string().required(),
});

@CommandHandler(DeletePlaylistCommand)
export class DeletePlaylistCommandHandler implements ICommandHandler<
  DeletePlaylistCommand,
  void
> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
    @Inject(_const.IANALYTICS_SERVICE)
    private readonly analyticsService: IAnalyticsService,
  ) {}

  public async execute(command: DeletePlaylistCommand): Promise<void> {
    const { model } = command;
    await removePlaylistContentValidation.validateAsync(model);

    const playlist = await this.playlistRepository.getByIdAsync(
      model.playlistReferenceId,
    );
    if (!playlist) {
      throw new NotFoundException('Content not found');
    }

    if (playlist.playlistType === PlaylistType.SYSTEM) {
      throw new PlaylistUpdateNotAllowedException(
        model.playlistReferenceId,
        'system-collection',
      );
    }

    await this.playlistRepository.deleteAsync(playlist);

    await this.analyticsService.trackEvent(
      _const.ANALYTICS_EVENTS.PLAYLIST.DELETED,
      {
        playlistId: playlist.id,
        name: playlist.name,
      },
    );
  }
}
