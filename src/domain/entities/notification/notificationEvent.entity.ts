import { Entity } from 'typeorm';
import { BaseEntity } from '../../baseEntity';

@Entity({ name: 'notificationEvents', schema: 'notification' })
export class NotificationEvent extends BaseEntity {}
