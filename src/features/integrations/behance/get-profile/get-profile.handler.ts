import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { BehanceProfileModel } from '../../../../domain/contracts/behance.model';
import { mapToBehanceProfileModel } from '../../../../domain/mappers/behance.mapper';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';

const PLATFORM = _const.PLATFORMS.BEHANCE;
export class BehanceProfileQuery {
  model: {
    userId?: string;
    userName?: string;
    behanceId?: string;
  };

  constructor(request: Partial<BehanceProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(BehanceProfileQuery)
export class BehanceProfileQueryHandler
  implements ICommandHandler<BehanceProfileQuery>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(
    query: BehanceProfileQuery,
  ): Promise<BehanceProfileModel> {
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
            model.behanceId,
          );

    if (!account) {
      throw new NotFoundException(
        'No matching Behance profile was found based on the provided information.',
      );
    }

    const includeSensitiveFields = HttpContext.user
      ? account.userId === HttpContext.user[Globals.ClaimTypes.UserId] ||
        HttpContext.user.permission.some((a) => a === 'viewuser')
      : false;

    return mapToBehanceProfileModel(account, includeSensitiveFields);
  }
}
