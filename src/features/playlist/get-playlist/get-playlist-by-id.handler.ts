import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import _const from "../../../core/utils/const";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import { PlaylistModel } from "../../../domain/contracts/playlist.model";
import { mapToPlaylistModel } from "../../../domain/mappers/playlist.mpper";
import { PlaylistNotFoundException } from "../../../core/exceptions/playlist.exception";
import { IPlaylistRepository } from "../../../domain/repositories/iplaylist.repository";

export class GetPlaylistByIdQuery {

  model: {
    playlistReferenceId: string;
  };

  constructor(request: Partial<GetPlaylistByIdQuery> = {}) {
    Object.assign(this, request);
  }
}

const getPlaylistByIdValidations = Joi.object({
  playlistReferenceId: Joi.string().required(),
});

@CommandHandler(GetPlaylistByIdQuery)
export class GetPlaylistByIdQueryHandler implements ICommandHandler<GetPlaylistByIdQuery, PlaylistModel> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY) private readonly playlistRepository: IPlaylistRepository,
  ) { }

  public async execute(query: GetPlaylistByIdQuery): Promise<PlaylistModel> {

    const { model } = query;
    await getPlaylistByIdValidations.validateAsync(query.model);

    const playlist = await this.playlistRepository.getByIdAsync(model.playlistReferenceId);

    if (!playlist) {
      throw new PlaylistNotFoundException(model.playlistReferenceId);
    }

    return mapToPlaylistModel(playlist);
  }
}  