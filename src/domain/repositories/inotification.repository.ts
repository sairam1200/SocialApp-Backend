import { Notification } from '../entities/notification/notification.entity';

export interface INotificationRepository {
  createAsync(notification: Notification): Promise<Notification>;
  updateAsync(notification: Notification): Promise<void>;
  deleteAsync(notification: Notification): Promise<void>;

  getAllAsync(userId: string): Promise<Notification[]>;
  getByIdAsync(id: string): Promise<Notification>;
  getAsync(
    userId: string,
    page: number,
    pageSize: number,
    orderBy: string,
    order: 'ASC' | 'DESC',
    // add filter by type
  ): Promise<Notification[]>;
}
