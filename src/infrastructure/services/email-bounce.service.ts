import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import _const from '../../core/utils/const';
import redis from '../../core/utils/redis.util';
import logger from '../../core/utils/winston.util';
import { stringUtil } from '../../core/utils/string.util';
import { IIdentityRepository } from '../../domain/repositories';
import { IDataProtectionKeyRepository } from '../../domain/repositories/idataProtectionKey.repository';
import {
  IEmailBounceService,
  EmailBounceEvent,
} from '../../domain/services/iemail-bounce.service';

@Injectable()
export class EmailBounceService implements IEmailBounceService {
  constructor(
    @Inject(_const.IIDENTITY_REPOSITORY)
    private readonly userRepository: IIdentityRepository,
    @Inject(_const.IDATAPROTECTIONKEY_REPOSITORY)
    private readonly dataProtectionKeyRepository: IDataProtectionKeyRepository,
    private readonly dataSource: DataSource,
  ) {}

  public async handleBounce(event: EmailBounceEvent): Promise<void> {
    const normalizedEmail = stringUtil.normalizeEmail(event.email);

    const user = await this.userRepository.getUserByEmailAsync(normalizedEmail);
    if (!user) {
      logger.info('[EmailBounce] Bounce for unknown email, ignoring', {
        event: event.event,
        deliveryProvider: event.deliveryProvider,
        receivedAt: new Date().toISOString(),
      });
      return;
    }

    if (user.emailConfirmed) {
      logger.info('[EmailBounce] Bounce for verified user, ignoring', {
        userId: user.id,
        event: event.event,
        deliveryProvider: event.deliveryProvider,
        receivedAt: new Date().toISOString(),
      });
      return;
    }

    if (user.googleId) {
      logger.warn('[EmailBounce] Bounce for OAuth user, ignoring', {
        userId: user.id,
        event: event.event,
        deliveryProvider: event.deliveryProvider,
        receivedAt: new Date().toISOString(),
      });
      return;
    }

    const result = await this.dataSource.transaction(async (em) => {
      const freshUser = await this.userRepository.findByIdAsync(user.id, em);
      if (!freshUser || freshUser.emailConfirmed) {
        return { deleted: false, reason: 'race_condition' };
      }

      await this.dataProtectionKeyRepository.deleteByUserIdAsync(user.id, em);

      const deleted = await this.userRepository.deleteUnverifiedByIdAsync(
        user.id,
        em,
      );

      return {
        deleted,
        reason: deleted ? 'deleted' : 'race_condition',
      };
    });

    if (result.deleted) {
      const cacheKey = redis.getRedisKey<string>(
        `${user.id}${_const.REDIS.USER.ACCOUNT}`,
      );
      await redis.removeFromRedisAsync(cacheKey);

      logger.info('[EmailBounce] Pending user deleted', {
        userId: user.id,
        event: event.event,
        reason: event.reason,
        messageId: event.messageId,
        deliveryProvider: event.deliveryProvider,
        subject: event.subject,
        webhookTimestamp: event.timestamp,
        receivedAt: new Date().toISOString(),
      });
    } else {
      logger.info('[EmailBounce] Delete skipped', {
        userId: user.id,
        reason: result.reason,
        event: event.event,
        deliveryProvider: event.deliveryProvider,
        receivedAt: new Date().toISOString(),
      });
    }
  }
}
