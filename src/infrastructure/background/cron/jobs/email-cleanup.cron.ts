import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import _const from '../../../../core/utils/const';
import { IUserRepository } from '../../../../domain/repositories';
import logger from '../../../../core/utils/winston.util';

@Injectable()
export class EmailCleanupCron {
  constructor(
    @Inject(_const.IUSER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleExpiredEmailChanges(): Promise<void> {
    try {
      const expirationHours = 24;
      const cleanedCount =
        await this.userRepository.cleanupExpiredEmailChangesAsync(
          expirationHours,
        );

      if (cleanedCount > 0) {
        logger.info(
          `Cleaned up ${cleanedCount} expired email change requests.`,
        );
      }
    } catch (error) {
      logger.error('Error cleaning up expired email changes:', error);
    }
  }
}
