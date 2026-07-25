import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from 'core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PlaylistModel } from '../../../domain/contracts/playlist.model';
import { mapToPlaylistModel } from '../../../domain/mappers/playlist.mpper';
import { IPlaylistRepository } from '../../../domain/repositories/iplaylist.repository';

export class GetPlaylistsQuery {
  model: {
    userNameOrId: string;
  };

  constructor(request: Partial<GetPlaylistsQuery> = {}) {
    Object.assign(this, request);
  }
}

const getPlaylistsValidations = Joi.object({
  userNameOrId: Joi.string().required(),
});

@CommandHandler(GetPlaylistsQuery)
export class GetPlaylistsQueryHandler implements ICommandHandler<
  GetPlaylistsQuery,
  PlaylistModel[]
> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
  ) {}

  public async execute(query: GetPlaylistsQuery): Promise<PlaylistModel[]> {
    const { model } = query;
    await getPlaylistsValidations.validateAsync(query.model);

    const playlists = await this.playlistRepository.getAsync(
      model.userNameOrId,
    );

    return playlists.map(mapToPlaylistModel);
  }
}
