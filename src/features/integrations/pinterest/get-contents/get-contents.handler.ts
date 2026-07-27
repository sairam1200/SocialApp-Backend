import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { PinterestContentModel } from '../../../../domain/contracts/pinterest.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToPinterestContentModel } from '../../../../domain/mappers/pinterest.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.PINTEREST;

export class PinterestContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<PinterestContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(PinterestContentsQuery)
export class PinterestContentsQueryHandler implements ICommandHandler<PinterestContentsQuery> {
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: PinterestContentsQuery,
  ): Promise<CursorResult<PinterestContentModel>> {
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
      mapToPinterestContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
