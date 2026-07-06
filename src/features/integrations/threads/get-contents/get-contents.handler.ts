import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ThreadsContentModel } from '../../../../domain/contracts/threads.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToThreadsContentModel } from '../../../../domain/mappers/threads.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.THREADS;

export class ThreadsContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<ThreadsContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(ThreadsContentsQuery)
export class ThreadsContentsQueryHandler
  implements ICommandHandler<ThreadsContentsQuery>
{
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: ThreadsContentsQuery,
  ): Promise<CursorResult<ThreadsContentModel>> {
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
      mapToThreadsContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
