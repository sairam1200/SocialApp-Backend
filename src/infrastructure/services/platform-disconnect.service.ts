import _const from '../../core/utils/const';
import logger from '../../core/utils/winston.util';
import { Injectable, Inject } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LinkedAccount, UserContent, UserLogin } from '../../domain/entities';
import { IUserLoginRepository } from '../../domain/repositories/iuserLogin.repository';
import { IUserContentRepository } from '../../domain/repositories/iuserContent.repository';
import { ILinkedAccountRepository } from '../../domain/repositories/ilinkedAccount.repository';
import { IPlatformDisconnectService } from '../../domain/services/iplatform-disconnect.service';
import { LinkedAccountRemovedEvent } from '../../domain/events/linked-account-removed.event';

@Injectable()
export class PlatformDisconnectService implements IPlatformDisconnectService {
  constructor(
    @Inject(_const.IUSERCONTENT_REPOSITORY)
    private readonly userContentRepository: IUserContentRepository,
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.IUSERLOGIN_REPOSITORY)
    private readonly userLoginRepository: IUserLoginRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async disconnectPlatformAsync(
    userId: string,
    platform: string,
    entityManager?: EntityManager,
  ): Promise<void> {
    logger.info(
      `[PlatformDisconnect] Starting disconnect for user ${userId}, platform ${platform}`,
    );

    const linkedAccount = entityManager
      ? await entityManager
          .getRepository(LinkedAccount)
          .findOne({ where: { userId, platform } })
      : await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
          platform,
          userId,
        );

    if (!linkedAccount) {
      logger.warn(
        `[PlatformDisconnect] No linked account found for user ${userId}, platform ${platform}`,
      );
      return;
    }

    const userLogin = entityManager
      ? await entityManager
          .getRepository(UserLogin)
          .findOne({ where: { userId, provider: platform } })
      : await this.userLoginRepository.getByUserIdAndProviderAsync(
          userId,
          platform,
        );

    const linkedAccountId = linkedAccount.id;

    if (entityManager) {
      await entityManager
        .getRepository(UserContent)
        .delete({ linkedAccountId });
      if (userLogin) {
        await entityManager.getRepository(UserLogin).delete(userLogin.id);
      }
      await entityManager.getRepository(LinkedAccount).delete(linkedAccountId);
    } else {
      await this.userContentRepository.deleteByLinkedAccountIdAsync(
        linkedAccountId,
      );
      if (userLogin) {
        await this.userLoginRepository.deleteAsync(userLogin);
      }
      await this.linkedAccountRepository.deleteAsync(linkedAccount);
    }

    this.eventEmitter.emit(
      'linked.account.removed',
      new LinkedAccountRemovedEvent({
        userId,
        platform,
        linkedAccountId,
      }),
    );

    logger.info(
      `[PlatformDisconnect] Successfully disconnected platform ${platform} for user ${userId}`,
    );
  }
}
