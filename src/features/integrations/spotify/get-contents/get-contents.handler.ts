import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToSpotifyContentModel } from '../../../../domain/mappers/spotify.mapper';
import {
  SpotifyPlaylistModel,
  SpotifyTrackModel,
  SpotifyAlbumModel,
  SpotifyShowModel,
} from '../../../../domain/contracts/spotify.model';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.SPOTIFY;

export class SpotifyContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<SpotifyContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(SpotifyContentsQuery)
export class SpotifyContentsQueryHandler
  implements ICommandHandler<SpotifyContentsQuery>
{
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: SpotifyContentsQuery,
  ): Promise<
    CursorResult<
      | SpotifyPlaylistModel
      | SpotifyTrackModel
      | SpotifyAlbumModel
      | SpotifyShowModel
    >
  > {
    const { model } = query;
    const userId =
      model.userId || HttpContext.user?.[Globals.ClaimTypes.UserId];

    if (!userId) {
      throw new NotFoundException('User ID is required');
    }

    const cursor = model.cursor || '';
    const [contents, nextCursor] =
      await this.userContentRepository.getByUserIdAsync(
        userId,
        PLATFORM,
        cursor,
      );

    const mappedContents = contents.map((content: UserContent) =>
      mapToSpotifyContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
