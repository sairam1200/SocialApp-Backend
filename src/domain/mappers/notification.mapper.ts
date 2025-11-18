import { NotificationModel } from "../contracts/notification.model";
import { Notification } from "../entities/notification/notification.entity";

export function mapToNotificationModel(data: Notification): NotificationModel {
  return {
    id: data.id,
    title: data.title,
    body: data.body,
    createdAt: data.createdOn,
    isLive: data.isLive,
    notifyId: data.notifyId,
    sound: data.sound,
    type: data.type,
    metaData: data.metaData,
    readAt: data.readAt

  } as NotificationModel;
}