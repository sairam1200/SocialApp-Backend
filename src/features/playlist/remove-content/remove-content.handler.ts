import * as Joi from "joi";
import _const from "../../../core/utils/const";
import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { IPlaylistRepository } from "../../../domain/repositories/iplaylist.repository";
import { IAnalyticsService } from "../../../domain/services/ianalytics.service";

export class RemovePlaylistContentCommand {
  model: {
    playlistReferenceId: string;
    contentId: string;
  };

  constructor(request: Partial<RemovePlaylistContentCommand> = {}) {
    Object.assign(this, request);
  }
}

const removePlaylistContentValidation = Joi.object({
  playlistReferenceId: Joi.string().required(),
  contentId: Joi.string().required(),
});

@CommandHandler(RemovePlaylistContentCommand)
export class RemovePlaylistContentCommandHandler implements ICommandHandler<RemovePlaylistContentCommand, void> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY) private readonly playlistRepository: IPlaylistRepository,
    @Inject(_const.IANALYTICS_SERVICE) private readonly analyticsService: IAnalyticsService,
  ) { }

  public async execute(command: RemovePlaylistContentCommand): Promise<void> {

    const { model } = command;
    await removePlaylistContentValidation.validateAsync(model);

    const content = await this.playlistRepository.getContentAsync(model.playlistReferenceId, model.contentId);
    if (!content) {
      throw new NotFoundException("Content not found");
    }

    await this.playlistRepository.removeContentAsync(model.playlistReferenceId, content);

    await this.analyticsService.trackEvent(
      _const.ANALYTICS_EVENTS.PLAYLIST.CONTENT_REMOVED,
      {
        playlistId: model.playlistReferenceId,
        contentId: model.contentId,
      }
    );
  }
}