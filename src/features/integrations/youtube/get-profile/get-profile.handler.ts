import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { YoutubeProfileModel } from '../../../../domain/contracts/youtube.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { mapToYoutubeProfileModel } from '../../../../domain/mappers/youtube.mapper';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

export class YoutubeProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    youtubeId?: string;
  };

  constructor(request: Partial<YoutubeProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(YoutubeProfileQuery)
export class YoutubeProfileQueryHandler implements ICommandHandler<YoutubeProfileQuery> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    query: YoutubeProfileQuery,
  ): Promise<YoutubeProfileModel> {
    const { model } = query;

    const account = model.userId
      ? await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
          _const.PLATFORMS.YOUTUBE,
          model.userId,
        )
      : model.userName
        ? await this.linkedAccountRepository.getByPlatformAndUserNameAsync(
            _const.PLATFORMS.YOUTUBE,
            model.userName,
          )
        : await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(
            _const.PLATFORMS.YOUTUBE,
            model.youtubeId,
          );

    if (!account) {
      throw new NotFoundException(
        'No matching Youtube profile was found based on the provided information.',
      );
    }

    // Also figure out a way to check if the loggedIn user has a profile read permission so the can access all the user's profile info
    const includeSensitiveFields = HttpContext.user
      ? account.userId === HttpContext.user[Globals.ClaimTypes.UserId] ||
        HttpContext.user.permission.some((a) => a === 'viewuser')
      : false;

    return mapToYoutubeProfileModel(account, includeSensitiveFields);
  }
}
