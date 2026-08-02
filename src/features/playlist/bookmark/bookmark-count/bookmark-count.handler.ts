import * as Joi from 'joi';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { IPlaylistRepository } from '../../../../domain/repositories/iplaylist.repository';

export class BookmarkCountQuery {
  model: {
    userNameOrId: string;
  };

  constructor(request: Partial<BookmarkCountQuery> = {}) {
    Object.assign(this, request);
  }
}

const bookmarkCountValidations = Joi.object({
  userNameOrId: Joi.string().required(),
});

@CommandHandler(BookmarkCountQuery)
export class BookmarkCountQueryHandler implements ICommandHandler<
  BookmarkCountQuery,
  { count: number }
> {
  constructor(
    @Inject(_const.IPLAYLIST_REPOSITORY)
    private readonly playlistRepository: IPlaylistRepository,
  ) {}

  public async execute(query: BookmarkCountQuery): Promise<{ count: number }> {
    const { model } = query;
    await bookmarkCountValidations.validateAsync(model);

    const bookmark = await this.playlistRepository.getByNameAsync(
      model.userNameOrId,
      _const.COLLECTION.BOOKMARK.NAME,
    );

    if (!bookmark) {
      return { count: 0 };
    }

    const count = await this.playlistRepository.getContentCountAsync(
      bookmark.referenceId,
    );

    return { count };
  }
}
