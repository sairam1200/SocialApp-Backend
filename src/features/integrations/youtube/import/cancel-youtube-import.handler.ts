import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ApiProperty } from '@nestjs/swagger';
import _const from '../../../../core/utils/const';
import logger from '../../../../core/utils/winston.util';
import { HttpContext } from '../../../../core/middlewares/httpContext.middleware';
import { ILinkedAccountRepository } from '../../../../domain/repositories/ilinkedAccount.repository';
import { INotificationService } from '../../../../domain/services/inotification.service';
import { INotificationRepository } from '../../../../domain/repositories/inotification.repository';
import { NotFoundException } from '@nestjs/common';
import { NotificationStatus, NotificationType } from '../../../../domain/enums';
import { ApplicationException } from '../../../../core/exceptions';
import { IQueueService } from '../../../../domain/services/iqueue.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PlatformRollbackEvent } from '../../../../domain/events/platform-rollback.event';

export class CancelYoutubeImportRequestModel {
  @ApiProperty()
  confirm: boolean;
}

export class CancelYoutubeImportCommand {
  model: CancelYoutubeImportRequestModel;

  constructor(request: Partial<CancelYoutubeImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(CancelYoutubeImportCommand)
export class CancelYoutubeImportCommandHandler
  implements ICommandHandler<CancelYoutubeImportCommand>
{
  constructor(
    @Inject(_const.ILINKEDACCOUNT_REPOSITORY)
    private readonly linkedAccountRepository: ILinkedAccountRepository,
    @Inject(_const.INOTIFICATION_SERVICE)
    private readonly notificationService: INotificationService,
    @Inject(_const.INOTIFICATION_REPOSITORY)
    private readonly notificationRepository: INotificationRepository,
    @Inject(_const.IQUEUE_SERVICE)
    private readonly queueService: IQueueService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async execute(command: CancelYoutubeImportCommand): Promise<void> {
    if (!command.model.confirm) {
      throw new ApplicationException(
        "Cancellation requires confirmation. Set 'confirm' to true.",
      );
    }

    const userId = HttpContext.getCurrentUserId;

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.YOUTUBE,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching Youtube profile was found!');
    }

    logger.info(`[YoutubeImport] Cancellation requested for user ${userId}`);

    try {
      await this.queueService.cancelYoutubeImport(userId);
      logger.info(
        `[YoutubeImport] Job cancellation requested for user ${userId}`,
      );
    } catch (error) {
      logger.error(
        `[YoutubeImport] Error cancelling job: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );
    }

    const notifications = await this.notificationRepository.getAllAsync(userId);
    const importNotification = notifications.find(
      (n) =>
        n.type === NotificationType.Import &&
        n.isLive &&
        n.metaData?.platform === _const.PLATFORMS.YOUTUBE,
    );

    if (
      importNotification &&
      importNotification.metaData?.status === NotificationStatus.InProgress
    ) {
      await this.notificationService.updateAsync(
        importNotification.id,
        false,
        {
          status: NotificationStatus.Cancelled,
          reports: importNotification.metaData.reports || [],
          platform: _const.PLATFORMS.YOUTUBE,
        },
        'YouTube import cancellation requested.',
      );
    }

    try {
      this.eventEmitter.emit(
        'platform.rollback',
        new PlatformRollbackEvent({ account }),
      );
      logger.info(`[YoutubeImport] Rollback event emitted for user ${userId}`);
    } catch (error) {
      logger.error(
        `[YoutubeImport] Error emitting rollback event: 
        ${error instanceof Error ? error.message : JSON.stringify(error)}`,
        { error },
      );
    }
  }
}
