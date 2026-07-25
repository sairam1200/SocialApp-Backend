import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { BehanceContentModel } from '../../../../domain/contracts/behance.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToBehanceContentModel } from '../../../../domain/mappers/behance.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.BEHANCE;

export class BehanceContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<BehanceContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(BehanceContentsQuery)
export class BehanceContentsQueryHandler implements ICommandHandler<BehanceContentsQuery> {
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: BehanceContentsQuery,
  ): Promise<CursorResult<BehanceContentModel>> {
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
      mapToBehanceContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
