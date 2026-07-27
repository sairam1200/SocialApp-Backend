import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TiktokProfileModel } from '../../../../domain/contracts/tiktok.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { mapToTiktokProfileModel } from '../../../../domain/mappers/tiktok.mapper';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

export class TiktokProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    tiktokId?: string;
  };

  constructor(request: Partial<TiktokProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TiktokProfileQuery)
export class TiktokProfileQueryHandler implements ICommandHandler<TiktokProfileQuery> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(query: TiktokProfileQuery): Promise<TiktokProfileModel> {
    const { model } = query;

    const account = model.userId
      ? await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
          _const.PLATFORMS.TIKTOK,
          model.userId,
        )
      : model.userName
        ? await this.linkedAccountRepository.getByPlatformAndUserNameAsync(
            _const.PLATFORMS.TIKTOK,
            model.userName,
          )
        : await this.linkedAccountRepository.getByPlatformAndExternalIdAsync(
            _const.PLATFORMS.TIKTOK,
            model.tiktokId,
          );

    if (!account) {
      throw new NotFoundException(
        'No matching tiktok profile was found based on the provided information.',
      );
    }

    // Also figure out a way to check if the loggedIn user has a profile read permission so the can access all the user's profile info
    const includeSensitiveFields = HttpContext.user
      ? account.userId === HttpContext.user[Globals.ClaimTypes.UserId] ||
        HttpContext.user.permission.some((a: string) => a === 'viewuser')
      : false;

    return mapToTiktokProfileModel(account, includeSensitiveFields);
  }
}
