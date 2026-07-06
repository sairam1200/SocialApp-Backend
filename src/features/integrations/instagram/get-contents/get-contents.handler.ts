import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { InstagramContentModel } from '../../../../domain/contracts/instagram.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToInstagramContentModel } from '../../../../domain/mappers/instagram.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = 'instagram';

export class InstagramContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<InstagramContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(InstagramContentsQuery)
export class InstagramContentsQueryHandler
  implements ICommandHandler<InstagramContentsQuery>
{
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: InstagramContentsQuery,
  ): Promise<CursorResult<InstagramContentModel>> {
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
      mapToInstagramContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
