import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { RedditContentModel } from '../../../../domain/contracts/reddit.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToRedditContentModel } from '../../../../domain/mappers/reddit.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.REDDIT;

export class RedditContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<RedditContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(RedditContentsQuery)
export class RedditContentsQueryHandler
  implements ICommandHandler<RedditContentsQuery>
{
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: RedditContentsQuery,
  ): Promise<CursorResult<RedditContentModel>> {
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
      mapToRedditContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
