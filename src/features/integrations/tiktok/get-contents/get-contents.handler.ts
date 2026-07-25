import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { TikTokContentModel } from '../../../../domain/contracts/tiktok.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToTikTokContentModel } from '../../../../domain/mappers/tiktok.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.TIKTOK;

export class TiktokContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<TiktokContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TiktokContentsQuery)
export class TiktokContentsQueryHandler implements ICommandHandler<TiktokContentsQuery> {
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: TiktokContentsQuery,
  ): Promise<CursorResult<TikTokContentModel>> {
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
      mapToTikTokContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
