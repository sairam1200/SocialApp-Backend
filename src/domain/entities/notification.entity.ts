import { Column, Entity } from "typeorm";
import { BaseEntity } from "../baseEntity";
import { NotificationType } from "../enums";

@Entity({ name: "notifications" })
export class Notification extends BaseEntity {

  @Column({ type: 'json', nullable: true })
  metaData?: Record<string, any>;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column()
  title: string;

  @Column()
  body: string;

  @Column({ type: 'uuid' })
  notifyId: string;

  @Column({ type: 'boolean', default: false })
  isLive: boolean;

  @Column({ default: false })
  sound: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt?: Date;

  constructor(request: Partial<Notification> = {}) {
    super();
    Object.assign(this, request);
  }
}