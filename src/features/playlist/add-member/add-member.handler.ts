import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { PlaylistMemberRole } from '../../../domain/enums';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PlaylistMemberModel } from '../../../domain/contracts/playlist.model';
import { mapToPlayListMemberModel } from '../../../domain/mappers/playlist.mpper';
import { IPlaylistRepository } from '../../../domain/repositories/iplaylist.repository';

export class AddPlaylistMemberModel {
  userId: string;
  role: PlaylistMemberRole;
}

export class AddPlaylistMemberCommand {
  model: AddPlaylistMemberModel;
  playlistReferenceId: string;

  constructor(request: Partial<AddPlaylistMemberCommand> = {}) {
    Object.assign(this, request);
  }
}

const addPlaylistMemberValidations = Joi.object({
  userId: Joi.string().required(),
  role: Joi.string()
    .valid(...Object.values(PlaylistMemberRole))
    .required(),
});

@CommandHandler(AddPlaylistMemberCommand)
export class AddPlaylistMemberCommandHandler
  implements ICommandHandler<AddPlaylistMemberCommand, PlaylistMemberModel>
{
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
  ) {}

  public async execute(
    command: AddPlaylistMemberCommand,
  ): Promise<PlaylistMemberModel> {
    const { model, playlistReferenceId } = command;
    await addPlaylistMemberValidations.validateAsync(model);

    const playlistMember = await this.playlistRepository.addMemberAsync(
      playlistReferenceId,
      model.userId,
      model.role,
    );

    return mapToPlayListMemberModel(playlistMember);
  }
}
