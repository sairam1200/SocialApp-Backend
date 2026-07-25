import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IPlaylistRepository } from '../../../domain/repositories/iplaylist.repository';
import { PlaylistMemberNotFoundException } from '../../../core/exceptions/playlist.exception';

export class RemovePlaylistMemberCommand {
  model: {
    playlistReferenceId: string;
    memberId: string;
  };

  constructor(request: Partial<RemovePlaylistMemberCommand> = {}) {
    Object.assign(this, request);
  }
}

const removePlaylistContentValidation = Joi.object({
  playlistReferenceId: Joi.string().required(),
  memberId: Joi.string().required(),
});

@CommandHandler(RemovePlaylistMemberCommand)
export class RemovePlaylistMemberCommandHandler implements ICommandHandler<
  RemovePlaylistMemberCommand,
  void
> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
  ) {}

  public async execute(command: RemovePlaylistMemberCommand): Promise<void> {
    const { model } = command;
    await removePlaylistContentValidation.validateAsync(model);

    const member = await this.playlistRepository.getMemberAsync(
      model.playlistReferenceId,
      model.memberId,
    );
    if (!member) {
      throw new PlaylistMemberNotFoundException(
        model.playlistReferenceId,
        model.memberId,
      );
    }

    await this.playlistRepository.removeMemberAsync(
      model.playlistReferenceId,
      member,
    );
  }
}
