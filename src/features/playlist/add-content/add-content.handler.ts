import * as Joi from 'joi';
import { Inject, NotFoundException } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { mapToPlaylistContentModel } from '../../../domain/mappers/playlist.mpper';
import { IPlaylistRepository } from '../../../domain/repositories/iplaylist.repository';
import { IUserContentRepository } from '../../../domain/repositories/iuserContent.repository';
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
export class AddPlaylistContentCommandHandler implements ICommandHandler<
  AddPlaylistContentContent,
  PlaylistContentModel
> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.IANALYTICS_SERVICE)
    private readonly analyticsService: IAnalyticsService,
  ) {}

  public async execute(
    command: AddPlaylistContentContent,
  ): Promise<PlaylistContentModel> {
    const { model, playlistReferenceId } = command;
    await addPlaylistContentValidation.validateAsync({
      playlistReferenceId: command.playlistReferenceId,
    });

    let playlistContent: PlaylistContent;

    if (model.userContentId) {
      const userContent = await this.userContentRepository.getByIdAsync(
        model.userContentId,
      );
      if (!userContent) {
        throw new NotFoundException('UserContent not found');
      }

      playlistContent = new PlaylistContent({
        userContentId: userContent.id,
        contentId: userContent.externalId,
        type: userContent.type,
        platform: userContent.platform,
        title: userContent.title,
        contentUrl: userContent.sourceUrl,
        thumbnailUrl: userContent.media?.[0]?.thumbnail,
        metadata: userContent.metaData,
      });
    } else {
      playlistContent = new PlaylistContent({
        contentId: model.contentId,
        type: model.type,
        platform: model.platform,
        title: model.title,
        contentUrl: model.contentUrl,
        thumbnailUrl: model.thumbnailUrl,
        description: model.description,
        metadata: model.metadata,
      });
    }

    const content = await this.playlistRepository.addContentAsync(
      playlistReferenceId,
      playlistContent,
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
        contentId: content.contentId,
        type: content.type,
        platform: content.platform,
        title: content.title,
      });
    }

    return mapToPlaylistContentModel(content);
  }
}
