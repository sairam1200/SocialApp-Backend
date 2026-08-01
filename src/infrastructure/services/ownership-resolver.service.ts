import { Inject, Injectable } from '@nestjs/common';
import _const from '../../core/utils/const';
import { IOwnershipResolver } from '../../domain/services/iownership-resolver.service';
import { ILinkedAccountRepository } from '../../domain/repositories/ilinkedAccount.repository';
import { LinkedAccountNotFoundException } from '../../core/exceptions/linkedAccount.exception';
import { LinkedAccount } from '../../domain/entities';

@Injectable()
export class OwnershipResolver implements IOwnershipResolver {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
  ) {}

  async resolveAsync(userId: string, platform: string): Promise<LinkedAccount> {
    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        platform,
        userId,
      );

    if (!account) {
      throw new LinkedAccountNotFoundException(platform, userId);
    }

    return account;
  }
}
