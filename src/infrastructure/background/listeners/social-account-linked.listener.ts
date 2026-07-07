import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { NotificationGateway } from '../../websocket/gateways/notification.gateway';
import { ILinkedAccountRepository } from '../../../domain/repositories/ilinkedAccount.repository';
import { SocialAccountLinkedEvent } from '../../../domain/events/social-account-linked.event';

@Injectable()
export class SocialAccountLinkedListener {
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    private readonly gateway: NotificationGateway,
  ) {}

  @OnEvent('social.account.linked', { async: true })
  async handle(event: SocialAccountLinkedEvent): Promise<void> {
    try {
      const { userId } = event.data;

      const linkedAccounts =
        await this.linkedAccountRepository.getByUserIdAsync(userId);

      const mappedAccounts = linkedAccounts.map((account) => ({
        id: account.id,
        platform: account.platform,
        username: account.userName,
        profileImage: account.profileImage ?? null,
        isImported: account.allowImport,
        externalId: account.externalId,
        externalUrl: account.externalUrl ?? '',
        followersCount: account.followersCount,
        followingCount: account.followingCount,
        isVerified: account.verified,
      }));

      this.gateway.emitProfileUpdated(userId, {
        userId,
        updates: {
          linkedAccounts: mappedAccounts,
        },
      });

      logger.info(
        `[SocialAccountLinkedListener] Emitted profile-update for user ${userId} with ${mappedAccounts.length} linked accounts`,
      );
    } catch (err: any) {
      logger.error(
        `[SocialAccountLinkedListener] Failed to emit profile-update event: ${err.message}`,
      );
    }
  }
}
