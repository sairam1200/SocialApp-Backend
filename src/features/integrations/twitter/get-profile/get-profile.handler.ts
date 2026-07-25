import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TwitterProfileModel } from '../../../../domain/contracts/twitter.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { mapToTwitterProfileModel } from '../../../../domain/mappers/twitter.mapper';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

const PLATFORM = 'twitter';
export class TwitterProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    twitterId?: string;
  };

  constructor(request: Partial<TwitterProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TwitterProfileQuery)
export class TwitterProfileQueryHandler implements ICommandHandler<TwitterProfileQuery> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    query: TwitterProfileQuery,
  ): Promise<TwitterProfileModel> {
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
            model.twitterId,
          );

    if (!account) {
      throw new NotFoundException(
        'No matching Twitter profile was found based on the provided information.',
      );
    }

    // Also figure out a way to check if the loggedIn user has a profile read permission so the can access all the user's profile info
    const includeSensitiveFields = HttpContext.user
      ? account.userId === HttpContext.user[Globals.ClaimTypes.UserId] ||
        HttpContext.user.permission.some((a) => a === 'viewuser')
      : false;

    return mapToTwitterProfileModel(account, includeSensitiveFields);
  }
}
