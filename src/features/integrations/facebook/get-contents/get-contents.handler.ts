import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { FacebookOnlineModel } from '../../../../domain/contracts/facebook.model';
import { IUserContentRepository } from '../../../../domain/repositories/iuserContent.repository';
import { mapUserContentToFacebookOnlineModel } from '../../../../domain/mappers/facebook.mapper';
import { UserContent } from '../../../../domain/entities/userContent.entity';
import { CursorResult } from '../../../../domain/contracts/pagination/cursorResult';

const PLATFORM = 'facebook';

export class FacebookContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  };

  constructor(request: Partial<FacebookContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(FacebookContentsQuery)
export class FacebookContentsQueryHandler implements ICommandHandler<FacebookContentsQuery> {
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) {}

  public async execute(
    query: FacebookContentsQuery,
  ): Promise<CursorResult<FacebookOnlineModel>> {
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
      mapUserContentToFacebookOnlineModel(content),
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}
