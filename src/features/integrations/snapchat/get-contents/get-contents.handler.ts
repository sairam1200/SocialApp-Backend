import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { SnapchatContentModel } from '../../../../domain/contracts/snapchat.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToSnapchatContentModel } from '../../../../domain/mappers/snapchat.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.SNAPCHAT;

export class SnapchatContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<SnapchatContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(SnapchatContentsQuery)
export class SnapchatContentsQueryHandler
  implements ICommandHandler<SnapchatContentsQuery>
{
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: SnapchatContentsQuery,
  ): Promise<CursorResult<SnapchatContentModel>> {
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
      mapToSnapchatContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
