import _const from "../../core/utils/const";
import { Globals } from "../../core/globals";
import { NotificationChannel, NotificationType } from "../../domain/enums";
import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { Notification } from "../../domain/entities/notification/notification.entity";
import { HttpContext } from "../../core/middlewares/httpContext.middleware";
import { mapToNotificationModel } from "../../domain/mappers/notification.mapper";
import { INotificationService } from "../../domain/services/inotification.service";
import { INotificationRepository } from "../../domain/repositories/inotification.repository";
import { IUserPreferenceRepository } from "../../domain/repositories/iuserPreference.repository";
import { NotificationGateway } from "../../infrastructure/websocket/gateways/notification.gateway";

@Injectable()
export class NotificationService implements INotificationService {

  constructor(
    @Inject(_const.INOTIFICATION_REPOSITORY)
    private readonly notificationRepository: INotificationRepository,
    @Inject(_const.IUSERPREFERENCE_REPOSITORY)
    private readonly userPreferenceRepository: IUserPreferenceRepository,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly gateway: NotificationGateway,
  ) { }

  public async notifyAsync(userId: string, type: NotificationType, title: string, body: string, isLive: boolean, metaData?: any): Promise<Notification> {
    
    const notification = await this.notificationRepository.createAsync(new Notification({
      body: body,
      type: type,
      title: title,
      isLive: isLive,
      notifyId: userId,
      metaData: metaData,
    }));

    const preferences = await this.userPreferenceRepository.findByUserIdAsync(userId);
    const channels = preferences?.notificationChannelsEnabled;
    const shouldNotifyInApp = !channels || channels.length === 0 || channels.includes(NotificationChannel.InApp);

    if (shouldNotifyInApp) {
      this.gateway.emitNewNotification(userId, mapToNotificationModel(notification));
    }
    return notification;
  }

  public async markAsReadAsync(id: string, userId?: string): Promise<void> {

    if (!userId) {
      userId = HttpContext.user[Globals.ClaimTypes.UserId];
    }

    const notification = await this.notificationRepository.getByIdAsync(id);
    notification.readAt = new Date(Date.now());

    await this.notificationRepository.updateAsync(notification);

    this.gateway.emitNotificationRead(userId, notification.readAt);
  }

  public async markAllAsRead(userId?: string): Promise<void> {

    if (!userId) {
      userId = HttpContext.user[Globals.ClaimTypes.UserId];
    }

    const notifications = await this.notificationRepository.getAllAsync(userId);

    for (const notification of notifications) {
      if (!notification.readAt) {
        notification.readAt = new Date(Date.now());
        await this.notificationRepository.updateAsync(notification);
        this.gateway.emitNotificationRead(userId, notification.readAt);
      }
    }
  }

  public async updateAsync(id: string, isLive: boolean, metaData?: any, title?: string): Promise<void> {

    const notification = await this.notificationRepository.getByIdAsync(id);
    notification.isLive = isLive;
    notification.metaData = metaData;

    if (title) {
      notification.title = title;
    }

    await this.notificationRepository.updateAsync(notification);
    this.gateway.emitNotificationUpdated(notification.notifyId, mapToNotificationModel(notification));
  }

  public async markSoundAsPlayedAsync(id: string, userId?: string): Promise<void> {

    if (!userId) {
      userId = HttpContext.user[Globals.ClaimTypes.UserId];
    }

    const notification = await this.notificationRepository.getByIdAsync(id);
    notification.sound = true;

    await this.notificationRepository.updateAsync(notification);
  }

  public async markAllSoundAsPlayed(userId?: string): Promise<void> {

    if (!userId) {
      userId = HttpContext.user[Globals.ClaimTypes.UserId];
    }

    const notifications = await this.notificationRepository.getAllAsync(userId);

    for (const notification of notifications) {
      if (!notification.sound) {
        notification.sound = true;
        await this.notificationRepository.updateAsync(notification);
      }
    }
  }
}
