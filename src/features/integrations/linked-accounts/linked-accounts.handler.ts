import { Inject } from '@nestjs/common';
import _const from '../../../core/utils/const';
import { Globals } from '../../../core/globals';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpContext } from '../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';

export class GetUserLinkedAccountsQuery {
  constructor() {}
}

@CommandHandler(GetUserLinkedAccountsQuery)
export class GetUserLinkedAccountsQueryHandler implements ICommandHandler<
  GetUserLinkedAccountsQuery,
  { platforms: string[] }
> {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  public async execute(): Promise<{ platforms: string[] }> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];

    const accounts =
      await this.linkedAccountRepository.getByUserIdAsync(userId);
    if (!accounts) {
      return { platforms: [] };
    }

    const platforms = accounts.map((a) => a.platform);

    return { platforms };
  }
}
