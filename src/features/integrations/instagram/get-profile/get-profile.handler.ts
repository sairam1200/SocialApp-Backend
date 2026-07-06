import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { InstagramProfileModel } from '../../../../domain/contracts/instagram.model';
import { mapToInstagramProfileModel } from '../../../../domain/mappers/instagram.mapper';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

const PLATFORM = 'instagram';
export class InstagramProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    instagramId?: string;
  };

  constructor(request: Partial<InstagramProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(InstagramProfileQuery)
export class InstagramProfileQueryHandler
  implements ICommandHandler<InstagramProfileQuery>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    command: InstagramProfileQuery,
  ): Promise<InstagramProfileModel> {
    const { model } = command;

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
            model.instagramId,
          );

    if (!account) {
      throw new NotFoundException(
        'No matching Instagram profile was found based on the provided information.',
      );
    }

    // Also figure out a way to check if the loggedIn user has a profile read permission so the can access all the user's profile info
    const includeSensitiveFields = HttpContext.user
      ? account.userId === HttpContext.user[Globals.ClaimTypes.UserId] ||
        HttpContext.user.permission.some((a) => a === 'viewuser')
      : false;

    return mapToInstagramProfileModel(account, includeSensitiveFields);
  }
}
