import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import {
  UserLikedTweetModel,
  UserTweetModel,
} from '../../../../domain/contracts/twitter.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import {
  mapToLikedTweetModel,
  mapToUserTweetModel,
} from '../../../../domain/mappers/twitter.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.TWITTER;

export class TwitterContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<TwitterContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TwitterContentsQuery)
export class TwitterContentsQueryHandler
  implements ICommandHandler<TwitterContentsQuery>
{
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: TwitterContentsQuery,
  ): Promise<CursorResult<UserTweetModel | UserLikedTweetModel>> {
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

    const mappedContents = contents.map((content: UserContent) => {
      if (content.type === 'liked_tweet') {
        return mapToLikedTweetModel(content);
      } else {
        return mapToUserTweetModel(content);
      }
    });

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
