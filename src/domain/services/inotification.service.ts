import { Notification } from "../entities/notification.entity";

export interface INotificationService {
  notifyAsync(userId: string, title: string, body: string, isLive: boolean, metaData?: any): Promise<Notification>;
  markAsReadAsync(id: string, userId?: string): Promise<void>;
  markAllAsRead(userId?: string): Promise<void>;

  updateAsync(id: string, isLive: boolean, metaData?: any): Promise<void>;
  markSoundAsPlayedAsync(id: string, userId: string): Promise<void>;
  markAllSoundAsPlayed(userId: string): Promise<void>;
}