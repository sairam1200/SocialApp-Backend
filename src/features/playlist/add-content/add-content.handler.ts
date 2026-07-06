import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { mapToPlaylistContentModel } from '../../../domain/mappers/playlist.mpper';
import { IPlaylistRepository } from '../../../domain/repositories/iplaylist.repository';
import { PlaylistContent } from '../../../domain/entities/collection/playlistContent.entity';
import { IAnalyticsService } from '../../../domain/services/ianalytics.service';
import {
  AddPlaylistContentModel,
  PlaylistContentModel,
} from '../../../domain/contracts/playlist.model';

export class AddPlaylistContentContent {
  model: AddPlaylistContentModel;
  playlistReferenceId: string;

  constructor(request: Partial<AddPlaylistContentContent> = {}) {
    Object.assign(this, request);
  }
}

const addPlaylistContentValidation = Joi.object({
  playlistReferenceId: Joi.string().required(),
});

@CommandHandler(AddPlaylistContentContent)
export class AddPlaylistContentCommandHandler
  implements ICommandHandler<AddPlaylistContentContent, PlaylistContentModel>
{
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
    @Inject(_const.IANALYTICS_SERVICE)
    private readonly analyticsService: IAnalyticsService,
  ) {}

  public async execute(
    command: AddPlaylistContentContent,
  ): Promise<PlaylistContentModel> {
    const { model, playlistReferenceId } = command;
    await addPlaylistContentValidation.validateAsync(model);

    const content = await this.playlistRepository.addContentAsync(
      playlistReferenceId,
      new PlaylistContent({
        contentId: model.contentId,
        type: model.type,
        platform: model.platform,
        title: model.title,
        contentUrl: model.contentUrl,
        thumbnailUrl: model.thumbnailUrl,
        description: model.description,
        metadata: model.metadata,
      }),
    );

    const playlist =
      await this.playlistRepository.getByIdAsync(playlistReferenceId);
    if (playlist) {
      const isBookmark =
        playlist.name.toLowerCase() ===
        _const.COLLECTION.BOOKMARK.NAME.toLowerCase();
      const eventName = isBookmark
        ? _const.ANALYTICS_EVENTS.PLAYLIST.BOOKMARKED
        : _const.ANALYTICS_EVENTS.PLAYLIST.CONTENT_ADDED;

      await this.analyticsService.trackEvent(eventName, {
        playlistId: playlist.id,
        contentId: model.contentId,
        type: model.type,
        platform: model.platform,
        title: model.title,
      });
    }

    return mapToPlaylistContentModel(content);
  }
}
