import { Inject, NotFoundException } from "@nestjs/common";
import { CommandHandler, ICommandHandler } from "@nestjs/cqrs";
import _const from "../../../../core/utils/const";
import { Globals } from "../../../../core/globals";
import { HttpContext } from "../../../../core/middlewares/httpContext.middleware";
import { YouTubeContentModel } from "../../../../domain/contracts/youtube.model";
import { IUserContentRepository } from "../../../../domain/repositories/iuserContent.repository";
import { mapToYouTubeContentModel } from "../../../../domain/mappers/youtube.mapper";
import { UserContent } from "../../../../domain/entities/userContent.entity";
import { CursorResult } from "../../../../domain/contracts/pagination/cursorResult";

const PLATFORM = _const.PLATFORMS.YOUTUBE;

export class YoutubeContentsQuery {
  model: {
    userId?: string;
    cursor?: string;
  }

  constructor(request: Partial<YoutubeContentsQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(YoutubeContentsQuery)
export class YoutubeContentsQueryHandler implements ICommandHandler<YoutubeContentsQuery> {

  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
  ) { }

  public async execute(query: YoutubeContentsQuery): Promise<CursorResult<YouTubeContentModel>> {
    const { model } = query;
    const userId = model.userId || HttpContext.user?.[Globals.ClaimTypes.UserId];

    if (!userId) {
      throw new NotFoundException("User ID is required");
    }

    const cursor = model.cursor || '';
    const [contents, nextCursor] = await this.userContentRepository.getByUserIdAsync(
      userId,
      PLATFORM,
      cursor,
    );

    const mappedContents = contents.map((content: UserContent) => 
      mapToYouTubeContentModel(content)
    );

    return new CursorResult(mappedContents, nextCursor || null, !!nextCursor);
  }
}

