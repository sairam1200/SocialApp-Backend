import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { LinkedInContentModel } from '../../../../domain/contracts/linkedin.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapToLinkedInContentModel } from '../../../../domain/mappers/linkedin.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = _const.PLATFORMS.LINKEDIN;

export class LinkedInContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<LinkedInContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(LinkedInContentsQuery)
export class LinkedInContentsQueryHandler
  implements ICommandHandler<LinkedInContentsQuery>
{
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: LinkedInContentsQuery,
  ): Promise<CursorResult<LinkedInContentModel>> {
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
      mapToLinkedInContentModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
