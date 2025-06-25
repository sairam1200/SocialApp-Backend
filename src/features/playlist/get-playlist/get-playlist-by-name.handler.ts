import * as Joi from "joi";
import { Inject } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import _const from "../../../core/utils/const";
import { PlaylistModel } from "../../../domain/contracts/playlist.model";
import { mapToPlaylistModel } from "../../../domain/mappers/playlist.mpper";
import { PlaylistNotFoundException } from "../../../core/exceptions/playlist.exception";
import { IPlaylistRepository } from "../../../domain/repositories/iplaylist.repository";

export class GetPlaylistByNameQuery {

  model: {
    userNameOrId: string;
    playlistName: string;
  };

  constructor(request: Partial<GetPlaylistByNameQuery> = {}) {
    Object.assign(this, request);
  }
}

const getPlaylistByNameValidations = Joi.object({
  userNameOrId: Joi.string().required(),
  playlistName: Joi.string().required(),
});

@CommandHandler(GetPlaylistByNameQuery)
export class GetPlaylistByNameQueryHandler implements ICommandHandler<GetPlaylistByNameQuery, PlaylistModel> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY) private readonly playlistRepository: IPlaylistRepository,
  ) { }

  public async execute(query: GetPlaylistByNameQuery): Promise<PlaylistModel> {

    const { model } = query;
    await getPlaylistByNameValidations.validateAsync(query.model);

    const playlist = await this.playlistRepository.getByNameAsync(model.userNameOrId, model.playlistName);

    if (!playlist) {
      throw new PlaylistNotFoundException();
    }

    return mapToPlaylistModel(playlist);
  }
}  