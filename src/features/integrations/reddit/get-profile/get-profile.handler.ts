import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RedditProfileModel } from '../../../../domain/contracts/reddit.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { mapToRedditProfileModel } from '../../../../domain/mappers/reddit.mapper';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

const PLATFORM = _const.PLATFORMS.REDDIT;

export class RedditProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    redditId?: string;
  };

  constructor(request: Partial<RedditProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(RedditProfileQuery)
export class RedditProfileQueryHandler
  implements ICommandHandler<RedditProfileQuery>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(query: RedditProfileQuery): Promise<RedditProfileModel> {
    const { model } = query;

    const account = model.userId
      ? await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
          PLATFORM,
          model.userId,
        )
      : model.userName
        ? await this.linkedAccountRepository.getByPlatformAndUserNameAsync(
            PLATFORM,
            model.userName,
          )
        : await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(
            PLATFORM,
            model.redditId,
          );

    if (!account) {
      throw new NotFoundException(
        'No matching Reddit profile was found based on the provided information.',
      );
    }

    const includeSensitiveFields = HttpContext.user
      ? account.userId === HttpContext.user[Globals.ClaimTypes.UserId] ||
        HttpContext.user.permission.some((p) => p === 'viewuser')
      : false;

    return mapToRedditProfileModel(account, includeSensitiveFields);
  }
}
