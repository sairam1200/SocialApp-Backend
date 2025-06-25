import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { PlaylistContentModel } from "../../../domain/contracts/playlist.model";
import { PlaylistContent } from "../../../domain/entities/playlistContent.entity";
import { mapToPlaylistContentModel } from "../../../domain/mappers/playlist.mpper";
import { IPlaylistRepository } from "../../../domain/repositories/iplaylist.repository";

export class AddPlaylistContentModel {
  contentId: string;
  type: string;
  platform: string;
  title: string;
  contentUrl: string;
  thumbnailUrl: string;
  description?: string;
  metadata?: Record<string, any>;
}

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
export class AddPlaylistContentCommandHandler implements ICommandHandler<AddPlaylistContentContent, PlaylistContentModel> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY) private readonly playlistRepository: IPlaylistRepository,
  ) { }

  public async execute(command: AddPlaylistContentContent): Promise<PlaylistContentModel> {

    const { model, playlistReferenceId } = command;
    await addPlaylistContentValidation.validateAsync(model);

    const content = await this.playlistRepository.addContentAsync(playlistReferenceId, new PlaylistContent({
      contentId: model.contentId,
      type: model.type,
      platform: model.platform,
      title: model.title,
      contentUrl: model.contentUrl,
      thumbnailUrl: model.thumbnailUrl,
      description: model.description,
      metadata: model.metadata,
    }));

    return mapToPlaylistContentModel(content);
  }
}