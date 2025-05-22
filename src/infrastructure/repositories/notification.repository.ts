import { InjectRepository } from "@nestjs/typeorm";
import { INotificationRepository } from "../../domain/repositories/inotification.repository";
import { Repository } from "typeorm";
import { Notification } from "domain/entities/notification.entity";

export class NotificationRepository implements INotificationRepository {

  constructor(
    @InjectRepository(Notification)
    private notificationContext: Repository<Notification>,
  ) {}

  public async createAsync(notification: Notification): Promise<Notification> {
    return await this.notificationContext.save(notification);
  }

  public async updateAsync(notification: Notification): Promise<void> {
    await this.notificationContext.save(notification);
  }

  public async deleteAsync(notification: Notification): Promise<void> {
    await this.notificationContext.remove(notification);
  }

  public async getByIdAsync(id: string): Promise<Notification> {
    return await this.notificationContext.findOne({ where: { id } });
  }

  public async getAsync(
    userId: string,
    page: number,
    pageSize: number,
    orderBy: string,
    order: "ASC" | "DESC"
  ): Promise<Notification[]> {
    return await this.notificationContext.find({
      where: { receiverId: userId },
      order: { [orderBy]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }
}