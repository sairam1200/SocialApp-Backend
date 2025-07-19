import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { Globals } from '../../../../core/globals';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TikTokProfileModel } from '../../../../domain/contracts/tiktok.model';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { mapToTikTokProfileModel } from '../../../../domain/mappers/tiktok.mapper';

export class TikTokProfileQuery {
  constructor(request: Partial<TikTokProfileQuery> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(TikTokProfileQuery)
export class TikTokProfileQueryHandler implements ICommandHandler<TikTokProfileQuery> {

  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) { }

  public async execute(query: TikTokProfileQuery): Promise<TikTokProfileModel> {
    const userId = HttpContext.user[Globals.ClaimTypes.UserId];
    const linkedAccount = await this.linkedAccountRepository.getByPlatformAndUserIdAsync(_const.PLATFORMS.TIKTOK, userId);
    
    if (!linkedAccount) {
      throw new Error('TikTok account not linked');
    }

    return mapToTikTokProfileModel(linkedAccount, linkedAccount.allowImport);
  }
}
