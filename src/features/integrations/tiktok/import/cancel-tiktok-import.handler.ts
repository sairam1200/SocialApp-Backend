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

export class CancelTiktokImportRequestModel {
  @ApiProperty()
  confirm: boolean;
}

export class CancelTiktokImportCommand {
  model: CancelTiktokImportRequestModel;

  constructor(request: Partial<CancelTiktokImportCommand> = {}) {
    Object.assign(this, request);
  }
}

@CommandHandler(CancelTiktokImportCommand)
export class CancelTiktokImportCommandHandler
  implements ICommandHandler<CancelTiktokImportCommand>
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
  ) {}

  public async execute(command: CancelTiktokImportCommand): Promise<void> {
    if (!command.model.confirm) {
      throw new ApplicationException(
        "Cancellation requires confirmation. Set 'confirm' to true.",
      );
    }

    const userId = HttpContext.getCurrentUserId;

    const account =
      await this.linkedAccountRepository.getByPlatformAndUserIdAsync(
        _const.PLATFORMS.TIKTOK,
        userId,
      );

    if (!account) {
      throw new NotFoundException('No matching TikTok profile was found!');
    }

    logger.info(`[TiktokImport] Cancellation requested for user ${userId}`);

    await this.queueService.cancelTiktokImport(userId);

    const notifications = await this.notificationRepository.getAllAsync(userId);
    const importNotification = notifications.find(
      (n) =>
        n.type === NotificationType.Import &&
        n.isLive &&
        n.metaData?.platform === _const.PLATFORMS.TIKTOK,
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
          platform: _const.PLATFORMS.TIKTOK,
        },
        'TikTok import cancellation requested.',
      );
    }

    logger.info(`[TiktokImport] Cancellation completed for user ${userId}`);
  }
}
